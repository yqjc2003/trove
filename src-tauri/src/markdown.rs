use pulldown_cmark::{html, CowStr, Event, Options, Parser, Tag, TagEnd};

fn fingerprint(input: &str) -> (String, Vec<String>, Vec<String>, Vec<&'static str>) {
    let mut text = String::new();
    let mut links = Vec::new();
    let mut blocks = Vec::new();
    let mut tables = Vec::new();
    let mut code: Option<String> = None;
    for event in Parser::new_ext(input, Options::ENABLE_TABLES) {
        match event {
            Event::Start(Tag::CodeBlock(kind)) => {
                let language = match kind {
                    pulldown_cmark::CodeBlockKind::Fenced(info) => info.to_string(),
                    pulldown_cmark::CodeBlockKind::Indented => String::new(),
                };
                code = Some(format!("{language}\0"));
            }
            Event::End(TagEnd::CodeBlock) => {
                if let Some(value) = code.take() {
                    blocks.push(value);
                }
            }
            Event::Start(Tag::Image { dest_url, .. })
            | Event::Start(Tag::Link { dest_url, .. }) => links.push(dest_url.to_string()),
            Event::Text(value) | Event::Code(value) => {
                if let Some(ref mut block) = code {
                    block.push_str(&value);
                }
                text.extend(value.chars().filter(|ch| !ch.is_whitespace()));
            }
            Event::Start(Tag::Table(_)) => tables.push("table"),
            Event::Start(Tag::TableHead) => tables.push("head"),
            Event::Start(Tag::TableRow) => tables.push("row"),
            Event::Start(Tag::TableCell) => tables.push("cell"),
            Event::End(TagEnd::Table) => tables.push("/table"),
            Event::End(TagEnd::TableHead) => tables.push("/head"),
            Event::End(TagEnd::TableRow) => tables.push("/row"),
            Event::End(TagEnd::TableCell) => tables.push("/cell"),
            _ => {}
        }
    }
    (text, links, blocks, tables)
}

pub fn preserves_content(original: &str, candidate: &str) -> bool {
    !candidate.trim().is_empty()
        && candidate.len() <= 2 * 1024 * 1024
        && fingerprint(original) == fingerprint(candidate)
}

pub fn from_html(input: &str) -> Result<String, String> {
    htmd::HtmlToMarkdown::builder()
        .skip_tags(vec![
            "script", "style", "noscript", "svg", "template", "audio", "video", "iframe", "object",
            "embed",
        ])
        .add_handler(
            vec!["img"],
            |_handlers: &dyn htmd::element_handler::Handlers, element: htmd::Element| {
                let attr = |name: &str| {
                    element
                        .attrs
                        .iter()
                        .find(|value| value.name.local.as_ref() == name)
                        .map(|value| value.value.to_string())
                        .filter(|value| !value.trim().is_empty())
                };
                let source = attr("data-original")
                    .or_else(|| attr("data-src"))
                    .or_else(|| attr("src"))
                    .or_else(|| {
                        attr("srcset").and_then(|set| {
                            set.split(',')
                                .next()?
                                .split_whitespace()
                                .next()
                                .map(str::to_string)
                        })
                    })?;
                let source = source
                    .trim()
                    .replace('<', "%3C")
                    .replace('>', "%3E")
                    .replace('\\', "%5C")
                    .replace(['\n', '\r'], "");
                let alt = attr("alt")
                    .unwrap_or_default()
                    .replace('\\', "\\\\")
                    .replace('[', "\\[")
                    .replace(']', "\\]")
                    .replace(['\n', '\r'], " ");
                Some(format!("![{alt}](<{source}>)").into())
            },
        )
        .build()
        .convert(input)
        .map_err(|_| "无法转换网页正文".to_string())
}

pub fn render(input: &str, images: &[crate::assets::LocalImage]) -> Result<String, String> {
    if images.len() > 24 {
        return Err("图片数量超过限制".into());
    }
    let mut assets = std::collections::HashMap::new();
    let mut total = 0;
    for image in images {
        total += crate::assets::validate(image)?.len();
        if total > 8 * 1024 * 1024 {
            return Err("图片总大小超过限制".into());
        }
        assets.insert(
            image.source.as_str(),
            format!("data:{};base64,{}", image.mime, image.data),
        );
    }
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let mut missing_image = false;
    let mut unsafe_link = false;
    let events = Parser::new_ext(input, options).filter_map(|event| match event {
        Event::Html(_) | Event::InlineHtml(_) => None,
        Event::Start(Tag::Image {
            link_type,
            dest_url,
            title,
            id,
        }) => {
            if let Some(data_url) = assets.get(dest_url.as_ref()) {
                Some(Event::Start(Tag::Image {
                    link_type,
                    dest_url: CowStr::Boxed(data_url.clone().into_boxed_str()),
                    title,
                    id,
                }))
            } else {
                missing_image = true;
                None
            }
        }
        Event::End(TagEnd::Image) if missing_image => {
            missing_image = false;
            None
        }
        Event::Start(Tag::Link {
            link_type,
            dest_url,
            title,
            id,
        }) => {
            if url::Url::parse(&dest_url).is_ok_and(|url| matches!(url.scheme(), "http" | "https"))
            {
                Some(Event::Start(Tag::Link {
                    link_type,
                    dest_url,
                    title,
                    id,
                }))
            } else {
                unsafe_link = true;
                None
            }
        }
        Event::End(TagEnd::Link) if unsafe_link => {
            unsafe_link = false;
            None
        }
        other => Some(other),
    });
    let mut output = String::new();
    html::push_html(&mut output, events);
    Ok(ammonia::Builder::default()
        .add_url_schemes(&["data"])
        .clean(&output)
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_conversion_keeps_code_and_tables_but_skips_media() {
        let html = "<article><h2>说明</h2><pre><code>let x = 1;\nlet y = 2;</code></pre><table><tr><th>名称</th><th>数值</th></tr><tr><td>A</td><td>1</td></tr></table><video src='x'></video><audio src='y'></audio><script>bad()</script></article>";
        let result = from_html(html).unwrap();
        assert!(result.contains("let x = 1;"));
        assert!(result.contains("let y = 2;"));
        assert!(result.contains("名称"));
        assert!(result.contains("数值"));
        assert!(result.contains('|'), "表格应转换为 Markdown 表格：{result}");
        assert!(!result.contains("bad()"));
        assert!(!result.contains("<video"));
        assert!(!result.contains("<audio"));
    }

    #[test]
    fn html_conversion_keeps_lazy_loaded_image_sources() {
        let result = from_html(
            "<p>正文<img alt='图片' src='placeholder.gif' data-src='/real/image.png'></p>",
        )
        .unwrap();
        assert!(result.contains("/real/image.png"));
        assert!(!result.contains("placeholder.gif"));
    }

    #[test]
    fn renders_markdown_safely_and_supports_tables_and_code() {
        let result = render("# 标题\n\n| 项 | 值 |\n| --- | --- |\n| a | b |\n\n```rust\nlet x = 1;\n```\n\n<script>alert(1)</script>\n\n[bad](javascript:alert)", &[]).unwrap();
        assert!(result.contains("<h1>"));
        assert!(result.contains("<table>"));
        assert!(result.contains("<code>"));
        assert!(!result.contains("<script"));
        assert!(!result.contains("javascript:"));
    }

    #[test]
    fn renders_only_validated_local_images_and_blocks_data_links() {
        let image = crate::assets::LocalImage {
            source: "https://example.com/p.png".into(),
            mime: "image/png".into(),
            data: "iVBORw0KGgo=".into(),
        };
        let result = render("![图片](https://example.com/p.png)\n\n![缺失](https://example.com/missing.png)\n\n[危险](data:text/html,hello)", &[image]).unwrap();
        assert!(result.contains("src=\"data:image/png;base64,iVBORw0KGgo=\""));
        assert!(!result.contains("https://example.com/missing.png"));
        assert!(!result.contains("href=\"data:"));
        assert!(result.contains("缺失"));
    }

    #[test]
    fn ai_formatting_must_preserve_text_links_images_and_code() {
        let original = "标题\n\n正文\n\n```js\nlet x = 1;\n```\n\n![图](img.png)";
        assert!(preserves_content(
            original,
            "# 标题\n\n正文\n\n```js\nlet x = 1;\n```\n\n![图](img.png)"
        ));
        assert!(!preserves_content(
            original,
            "# 标题\n\n```js\nlet x = 1;\n```\n\n![图](img.png)"
        ));
        let table = "| 名称 | 数量 |\n| --- | --- |\n| A | 1 |";
        assert!(!preserves_content(table, "名称 数量 A 1"));
        assert!(!preserves_content(
            original,
            "# 标题\n\n正文\n\n```js\nlet x=1;\n```\n\n![图](img.png)"
        ));
        assert!(!preserves_content(
            original,
            "# 标题\n\n正文\n\n```js\nlet x = 1;\n```\n\n![图](evil.png)"
        ));
    }
}
