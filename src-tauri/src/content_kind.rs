use serde::Serialize;
use url::Url;

/// 仅表示内容的技术形态，不作为语义分类。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentKind {
    Article,
    Repo,
    Video,
}

fn host_matches(host: &str, domain: &str) -> bool {
    host == domain
        || host
            .strip_suffix(domain)
            .is_some_and(|prefix| prefix.ends_with('.'))
}

pub fn detect(raw_url: &str) -> ContentKind {
    let Ok(url) = Url::parse(raw_url.trim()) else {
        return ContentKind::Article;
    };
    if !matches!(url.scheme(), "http" | "https") {
        return ContentKind::Article;
    }
    let Some(host) = url.host_str() else {
        return ContentKind::Article;
    };
    if [
        "github.com",
        "gitlab.com",
        "gitee.com",
        "bitbucket.org",
        "codeberg.org",
    ]
    .iter()
    .any(|domain| host_matches(host, domain))
    {
        ContentKind::Repo
    } else if [
        "youtube.com",
        "youtube-nocookie.com",
        "youtu.be",
        "bilibili.com",
        "b23.tv",
        "vimeo.com",
        "douyin.com",
    ]
    .iter()
    .any(|domain| host_matches(host, domain))
    {
        ContentKind::Video
    } else {
        ContentKind::Article
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_repositories_videos_and_regular_articles() {
        for url in [
            "https://github.com/owner/project",
            "https://gitlab.com/group/repo",
            "https://gitee.com/a/b",
            "https://codeberg.org/a/b",
        ] {
            assert_eq!(detect(url), ContentKind::Repo, "{url}");
        }
        for url in [
            "https://www.youtube.com/watch?v=123",
            "https://youtu.be/123",
            "https://m.bilibili.com/video/BV1",
            "https://b23.tv/abc",
            "https://vimeo.com/123",
        ] {
            assert_eq!(detect(url), ContentKind::Video, "{url}");
        }
        for url in [
            "https://juejin.cn/post/123",
            "https://github.com.example.org/a/b",
            "https://example.com/?url=youtube.com",
            "https://example.github.io/article",
            "file://github.com/a/b",
        ] {
            assert_eq!(detect(url), ContentKind::Article, "{url}");
        }
    }
}
