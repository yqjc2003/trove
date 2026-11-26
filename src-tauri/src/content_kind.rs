use serde::Serialize;
use url::Url;

/// 仅表示内容的技术形态，不作为语义分类。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentKind {
    Article,
    Repo,
    Profile,
    Video,
}

#[derive(Debug, PartialEq, Eq)]
pub enum GithubTarget {
    User(String),
    Repository(String, String),
}

pub fn github_target(raw_url: &str) -> Option<GithubTarget> {
    let url = Url::parse(raw_url.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || !matches!(url.host_str(), Some("github.com" | "www.github.com"))
    {
        return None;
    }
    let parts: Vec<_> = url
        .path_segments()?
        .filter(|part| !part.is_empty())
        .collect();
    let owner = *parts.first()?;
    if !owner.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        || [
            "settings",
            "login",
            "signup",
            "orgs",
            "users",
            "explore",
            "topics",
            "marketplace",
            "search",
            "features",
            "sponsors",
            "notifications",
            "pulls",
            "issues",
            "new",
            "apps",
            "about",
            "collections",
            "events",
            "codespaces",
            "site",
            "enterprise",
        ]
        .iter()
        .any(|name| owner.eq_ignore_ascii_case(name))
    {
        return None;
    }
    match parts.as_slice() {
        [_] => Some(GithubTarget::User(owner.to_string())),
        [_, repo, ..]
            if repo
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
                && !repo.is_empty()
                && *repo != "."
                && *repo != ".." =>
        {
            let repo = repo.strip_suffix(".git").unwrap_or(repo);
            if repo.is_empty() {
                None
            } else {
                Some(GithubTarget::Repository(
                    owner.to_string(),
                    repo.to_string(),
                ))
            }
        }
        _ => None,
    }
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
    if matches!(github_target(raw_url), Some(GithubTarget::User(_))) {
        return ContentKind::Profile;
    }
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
        assert_eq!(detect("https://github.com/yqjc2003"), ContentKind::Profile);
        assert_eq!(
            github_target("https://github.com/yqjc2003/fhzy-life"),
            Some(GithubTarget::Repository(
                "yqjc2003".into(),
                "fhzy-life".into()
            ))
        );
        assert_eq!(github_target("https://github.com/settings/profile"), None);
        assert_eq!(
            github_target("https://github.com.evil.test/owner/repo"),
            None
        );
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
