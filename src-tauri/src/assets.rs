use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{stream, StreamExt};
use pulldown_cmark::{Event, Options, Parser, Tag};
use serde::{Deserialize, Serialize};
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    time::Duration,
};
use url::Url;

const MAX_IMAGE: usize = 2 * 1024 * 1024;
const MAX_TOTAL: usize = 8 * 1024 * 1024;
const MAX_IMAGES: usize = 24;

#[derive(Clone, Serialize, Deserialize)]
pub struct LocalImage {
    pub source: String,
    pub mime: String,
    pub data: String,
}

fn public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(a == 0
        || a == 10
        || a == 127
        || a >= 224
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && (b == 168 || (b == 0 && (c == 0 || c == 2))))
        || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
        || (a == 203 && b == 0 && c == 113))
}

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => public_ipv4(ip),
        IpAddr::V6(ip) => {
            if let Some(ipv4) = ip.to_ipv4_mapped() {
                return public_ipv4(ipv4);
            }
            let s = ip.segments();
            !((s[0] & 0xe000 != 0x2000)
                || ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || (s[0] & 0xfe00 == 0xfc00)
                || (s[0] & 0xffc0 == 0xfe80)
                || s[0] == 0x2002
                || (s[0] == 0x2001 && (s[1] == 0 || s[1] == 0x0db8)))
        }
    }
}

fn is_fake_ip(ip: IpAddr) -> bool {
    matches!(ip, IpAddr::V4(ip) if ip.octets()[0] == 198 && matches!(ip.octets()[1], 18 | 19))
}

fn public_dns_answers(data: &serde_json::Value, port: u16) -> Result<Vec<SocketAddr>, String> {
    let answers = data
        .get("Answer")
        .and_then(|value| value.as_array())
        .ok_or("公共 DNS 未返回图片地址")?;
    let addresses: Vec<SocketAddr> = answers
        .iter()
        .filter_map(|entry| {
            if !matches!(
                entry.get("type").and_then(|value| value.as_u64()),
                Some(1 | 28)
            ) {
                return None;
            }
            entry
                .get("data")?
                .as_str()?
                .parse::<IpAddr>()
                .ok()
                .map(|ip| SocketAddr::new(ip, port))
        })
        .collect();
    if addresses.is_empty() || addresses.iter().any(|addr| !public_ip(addr.ip())) {
        return Err("图片地址不是公共网络地址".into());
    }
    Ok(addresses)
}

async fn resolve_public(host: &str, port: u16) -> Result<Vec<SocketAddr>, String> {
    let addresses: Vec<_> = tokio::time::timeout(
        Duration::from_secs(8),
        tokio::net::lookup_host((host, port)),
    )
    .await
    .map_err(|_| "图片域名解析超时")?
    .map_err(|_| "图片域名解析失败")?
    .collect();
    if !addresses.is_empty() && addresses.iter().all(|addr| public_ip(addr.ip())) {
        return Ok(addresses);
    }
    // 一些本地代理使用 198.18/15 虚拟 DNS。仅在域名被全部解析为虚拟地址时，
    // 用 HTTPS 公共 DNS 查询真实地址，再固定连接到已验证的公网 IP。
    if addresses.is_empty()
        || !addresses.iter().all(|addr| is_fake_ip(addr.ip()))
        || host.parse::<IpAddr>().is_ok()
        || !host.contains('.')
        || [
            "localhost",
            "local",
            "lan",
            "internal",
            "home",
            "home.arpa",
            "invalid",
            "test",
            "example",
        ]
        .iter()
        .any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}")))
    {
        return Err("图片地址不是公共网络地址".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法创建 DNS 连接")?;
    let response = client
        .get("https://dns.google/resolve")
        .query(&[("name", host), ("type", "A")])
        .send()
        .await
        .map_err(|_| "无法解析图片的公网地址")?
        .error_for_status()
        .map_err(|_| "无法解析图片的公网地址")?;
    let data: serde_json::Value = response.json().await.map_err(|_| "公共 DNS 响应无效")?;
    public_dns_answers(&data, port)
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

pub fn validate(image: &LocalImage) -> Result<Vec<u8>, String> {
    if image.source.is_empty()
        || image.source.len() > 4096
        || image.data.len() > (MAX_IMAGE * 4 / 3 + 8)
    {
        return Err("图片数据无效或过大".into());
    }
    let bytes = STANDARD.decode(&image.data).map_err(|_| "图片数据无效")?;
    if bytes.len() > MAX_IMAGE || image_mime(&bytes) != Some(image.mime.as_str()) {
        return Err("图片格式不受支持或图片过大".into());
    }
    Ok(bytes)
}

async fn download(mut url: Url) -> Result<(String, Vec<u8>), String> {
    for _ in 0..4 {
        if !matches!(url.scheme(), "http" | "https")
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("图片地址不受支持".into());
        }
        let host = url.host_str().ok_or("图片地址无效")?;
        let port = url.port_or_known_default().ok_or("图片端口无效")?;
        let addresses = resolve_public(host, port).await?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .resolve_to_addrs(host, &addresses)
            .user_agent("CatchLinger/0.1")
            .build()
            .map_err(|_| "无法创建图片连接")?;
        let mut response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|_| "图片下载失败")?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("图片跳转地址无效")?;
            url = url.join(location).map_err(|_| "图片跳转地址无效")?;
            continue;
        }
        if !response.status().is_success() {
            return Err("图片请求失败".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "图片下载失败")? {
            if bytes.len() + chunk.len() > MAX_IMAGE {
                return Err("图片超过大小限制".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let mime = image_mime(&bytes).ok_or("图片格式不受支持")?;
        return Ok((mime.to_string(), bytes));
    }
    Err("图片跳转次数过多".into())
}

fn image_sources(markdown: &str) -> Vec<String> {
    let mut sources = Vec::new();
    for event in Parser::new_ext(markdown, Options::ENABLE_TABLES) {
        if let Event::Start(Tag::Image { dest_url, .. }) = event {
            let source = dest_url.to_string();
            if !sources.contains(&source) {
                sources.push(source);
            }
        }
    }
    sources
}

pub async fn archive(markdown: &str, page_url: &str) -> (Vec<LocalImage>, usize) {
    let sources = image_sources(markdown);
    let Ok(base) = Url::parse(page_url) else {
        return (vec![], sources.len());
    };
    let mut images = Vec::new();
    let mut skipped = sources.len().saturating_sub(MAX_IMAGES);
    let mut total = 0;
    let mut downloads = stream::iter(sources.into_iter().take(MAX_IMAGES))
        .map(|source| {
            let base = base.clone();
            async move {
                let result = match base.join(&source) {
                    Ok(url) => download(url).await,
                    Err(_) => Err("图片地址无效".into()),
                };
                (source, result)
            }
        })
        .buffer_unordered(4);
    while let Some((source, result)) = downloads.next().await {
        match result {
            Ok((mime, bytes)) if total + bytes.len() <= MAX_TOTAL => {
                total += bytes.len();
                images.push(LocalImage {
                    source,
                    mime,
                    data: STANDARD.encode(bytes),
                });
            }
            _ => skipped += 1,
        }
    }
    (images, skipped)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blocks_private_addresses_and_non_image_content() {
        for ip in [
            "127.0.0.1",
            "192.168.1.2",
            "169.254.169.254",
            "100.64.0.1",
            "::1",
            "fc00::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(!public_ip(ip.parse().unwrap()), "{ip}");
        }
        assert!(public_ip("8.8.8.8".parse().unwrap()));
        assert!(validate(&LocalImage {
            source: "a".into(),
            mime: "image/png".into(),
            data: STANDARD.encode(b"<svg onload=alert(1)>")
        })
        .is_err());
        assert!(validate(&LocalImage {
            source: "a".into(),
            mime: "image/png".into(),
            data: STANDARD.encode(b"\x89PNG\r\n\x1a\n")
        })
        .is_ok());
    }

    #[test]
    fn validates_public_dns_answers_before_connecting() {
        let public = serde_json::json!({"Answer":[{"type":5,"data":"alias.example.org."},{"type":1,"data":"8.8.8.8"}]});
        assert_eq!(
            public_dns_answers(&public, 443).unwrap()[0].ip(),
            "8.8.8.8".parse::<IpAddr>().unwrap()
        );
        let mixed = serde_json::json!({"Answer":[{"type":1,"data":"8.8.8.8"},{"type":1,"data":"127.0.0.1"}]});
        assert!(public_dns_answers(&mixed, 443).is_err());
        assert!(public_dns_answers(&serde_json::json!({"Answer":[]}), 443).is_err());
    }

    #[test]
    fn finds_and_deduplicates_markdown_image_references() {
        let html = "<p>正文<img alt='示意图' src='/images/chart.png'></p>";
        let markdown = crate::markdown::from_html(html).unwrap();
        assert_eq!(image_sources(&markdown), vec!["/images/chart.png"]);
        assert_eq!(
            image_sources("![a](one.png) ![b](one.png) ![c](two.jpg)"),
            vec!["one.png", "two.jpg"]
        );
    }
}
