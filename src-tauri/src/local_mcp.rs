use crate::{database, read_secret, save_item_in_db_with_options, write_secret, SaveItem};
use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::Response,
    Router,
};
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, ContentBlock, ServerCapabilities, ServerConfig},
    schemars, tool, tool_handler, tool_router, ServerHandler,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use url::Url;

const ADDRESS: &str = "127.0.0.1:46917";
const MCP_URL: &str = "http://127.0.0.1:46917/mcp";

#[derive(Default)]
pub struct McpState {
    server: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    error: Mutex<Option<String>>,
}

#[derive(Serialize)]
pub struct McpSettings {
    enabled: bool,
    url: &'static str,
    token: String,
    error: Option<String>,
}

fn auth_header_valid(headers: &axum::http::HeaderMap, token: &str) -> bool {
    if headers
        .get(axum::http::header::ORIGIN)
        .is_some_and(|value| !value.to_str().ok().is_some_and(extension_origin))
    {
        return false;
    }
    let host = headers
        .get(axum::http::header::HOST)
        .and_then(|value| value.to_str().ok());
    if !matches!(host, Some("127.0.0.1:46917" | "localhost:46917")) {
        return false;
    }
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|value| value == token)
}

fn extension_origin(origin: &str) -> bool {
    origin
        .strip_prefix("chrome-extension://")
        .is_some_and(|id| id.len() == 32 && id.bytes().all(|byte| (b'a'..=b'p').contains(&byte)))
}

async fn authorize(
    State(token): State<Arc<String>>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let origin = request
        .headers()
        .get(axum::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .filter(|value| extension_origin(value))
        .map(str::to_string);
    if request.method() == axum::http::Method::OPTIONS && origin.is_some() {
        let host = request
            .headers()
            .get(axum::http::header::HOST)
            .and_then(|v| v.to_str().ok());
        if !matches!(host, Some("127.0.0.1:46917" | "localhost:46917")) {
            return Err(StatusCode::FORBIDDEN);
        }
        let mut response = Response::new(axum::body::Body::empty());
        *response.status_mut() = StatusCode::NO_CONTENT;
        response.headers_mut().insert(
            "access-control-allow-origin",
            origin.unwrap().parse().map_err(|_| StatusCode::FORBIDDEN)?,
        );
        response.headers_mut().insert(
            "access-control-allow-methods",
            "POST, GET, DELETE, OPTIONS".parse().unwrap(),
        );
        response.headers_mut().insert(
            "access-control-allow-headers",
            "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id"
                .parse()
                .unwrap(),
        );
        return Ok(response);
    }
    if !auth_header_valid(request.headers(), &token) {
        return Err(StatusCode::FORBIDDEN);
    }
    let mut response = next.run(request).await;
    if let Some(origin) = origin {
        response.headers_mut().insert(
            "access-control-allow-origin",
            origin.parse().map_err(|_| StatusCode::FORBIDDEN)?,
        );
    }
    Ok(response)
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CaptureUrl {
    /// The HTTP(S) page URL to save locally.
    url: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct SearchQuery {
    /// Optional substring matched against title, tags, or saved text.
    query: Option<String>,
}

#[derive(Clone)]
struct LocalServer {
    app: tauri::AppHandle,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl LocalServer {
    fn new(app: tauri::AppHandle) -> Self {
        Self {
            app,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Save an HTTP(S) URL to the local CatchLinger desktop collection. The desktop app extracts the page and uses its configured AI, if enabled. Existing URLs are left unchanged."
    )]
    async fn catchlinger_save(
        &self,
        Parameters(args): Parameters<CaptureUrl>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let url = Url::parse(args.url.trim())
            .map_err(|_| rmcp::ErrorData::invalid_params("请输入有效的 HTTP(S) 网址", None))?;
        if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
            return Err(rmcp::ErrorData::invalid_params(
                "仅支持 HTTP 或 HTTPS 网址",
                None,
            ));
        }
        let normalized = url.as_str().to_string();
        let exists = database(&self.app)
            .and_then(|db| {
                db.query_row(
                    "SELECT EXISTS(SELECT 1 FROM items WHERE url=?1)",
                    [&normalized],
                    |row| row.get::<_, bool>(0),
                )
                .map_err(|error| error.to_string())
            })
            .map_err(|message| rmcp::ErrorData::internal_error(message, None))?;
        if exists {
            return Ok(CallToolResult::success(vec![ContentBlock::text(
                serde_json::json!({"url": normalized, "status": "exists"}).to_string(),
            )]));
        }
        let result = crate::analyze_url(self.app.clone(), normalized.clone()).await;
        let (title, summary, tags, body, warning, images, incomplete) = match result {
            Ok(data) => (
                data.title,
                data.summary,
                data.tags,
                data.body,
                data.warning,
                data.images,
                data.source_incomplete,
            ),
            Err(error) => (
                normalized.chars().take(500).collect(),
                String::new(),
                vec![],
                String::new(),
                Some(format!(
                    "无法读取网页：{error}；已保存链接，可在客户端手动编辑。"
                )),
                vec![],
                true,
            ),
        };
        let item = SaveItem {
            url: normalized.clone(),
            title: title.clone(),
            summary,
            tags,
            body: Some(body),
            source_note: warning.clone(),
            images: Some(images),
            source_incomplete: Some(incomplete),
        };
        let created = save_item_in_db_with_options(
            &database(&self.app)
                .map_err(|message| rmcp::ErrorData::internal_error(message, None))?,
            item,
            true,
        )
        .map_err(|message| rmcp::ErrorData::internal_error(message, None))?;
        if created {
            let _ = self.app.emit("collection-changed", ());
        }
        Ok(CallToolResult::success(vec![ContentBlock::text(serde_json::json!({"url": normalized, "title": title, "status": if created { "created" } else { "exists" }, "warning": warning}).to_string())]))
    }

    #[tool(description = "List the tags already available in the local collection.")]
    fn catchlinger_list_tags(&self) -> Result<CallToolResult, rmcp::ErrorData> {
        let conn = database(&self.app)
            .map_err(|message| rmcp::ErrorData::internal_error(message, None))?;
        let tags = crate::list_desktop_tags_in_db(&conn)
            .map_err(|message| rmcp::ErrorData::internal_error(message, None))?;
        Ok(CallToolResult::success(vec![ContentBlock::text(
            serde_json::json!({"tags": tags}).to_string(),
        )]))
    }

    #[tool(description = "Search the local collection by title, tag, or saved text.")]
    fn catchlinger_search(
        &self,
        Parameters(args): Parameters<SearchQuery>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let conn = database(&self.app)
            .map_err(|message| rmcp::ErrorData::internal_error(message, None))?;
        let items = crate::search_items(&conn, args.query.as_deref().unwrap_or(""))
            .map_err(|message| rmcp::ErrorData::internal_error(message, None))?;
        Ok(CallToolResult::success(vec![ContentBlock::text(
            serde_json::to_string(&items)
                .map_err(|error| rmcp::ErrorData::internal_error(error.to_string(), None))?,
        )]))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for LocalServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "本机 CatchLinger 收藏。调用 catchlinger_save 后等待结果；重复网址不会覆盖原有收藏。"
                .to_string(),
        )
    }
}

fn start(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<McpState>();
    let mut server = state.server.lock().map_err(|_| "无法启动 MCP 服务")?;
    if server
        .as_ref()
        .is_some_and(|handle| !handle.inner().is_finished())
    {
        return Ok(());
    }
    *server = None;
    let listener = std::net::TcpListener::bind(ADDRESS)
        .map_err(|error| format!("无法监听 {ADDRESS}：{error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let mut token = read_secret(app, "CATCHLINGER_MCP_TOKEN")?;
    if token.is_empty() {
        token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        write_secret(app, "CATCHLINGER_MCP_TOKEN", &token)?;
    }
    let token = Arc::new(token);
    let app_handle = app.clone();
    let handler = app.clone();
    let service = rmcp::transport::streamable_http_server::StreamableHttpService::new(
        move || Ok(LocalServer::new(handler.clone())),
        Arc::new(
            rmcp::transport::streamable_http_server::session::local::LocalSessionManager::default(),
        ),
        rmcp::transport::streamable_http_server::StreamableHttpServerConfig::default()
            .with_max_request_body_bytes(64 * 1024)
            .with_legacy_session_mode(false)
            .with_json_response(true),
    );
    let router = Router::new()
        .route_service("/mcp", service)
        .layer(middleware::from_fn_with_state(token, authorize));
    *server = Some(tauri::async_runtime::spawn(async move {
        let result = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => axum::serve(listener, router)
                .await
                .map_err(|e| e.to_string()),
            Err(error) => Err(error.to_string()),
        };
        if let Err(error) = result {
            if let Ok(mut slot) = app_handle.state::<McpState>().error.lock() {
                *slot = Some(format!("MCP 服务已停止：{error}"));
            }
        }
    }));
    if let Ok(mut error) = state.error.lock() {
        *error = None;
    }
    Ok(())
}

#[tauri::command]
pub fn get_mcp_settings(app: tauri::AppHandle) -> Result<McpSettings, String> {
    let state = app.state::<McpState>();
    let enabled = state
        .server
        .lock()
        .map_err(|_| "无法读取 MCP 状态")?
        .as_ref()
        .is_some_and(|handle| !handle.inner().is_finished());
    let error = state.error.lock().map_err(|_| "无法读取 MCP 状态")?.clone();
    Ok(McpSettings {
        enabled,
        url: MCP_URL,
        token: read_secret(&app, "CATCHLINGER_MCP_TOKEN")?,
        error,
    })
}

#[tauri::command]
pub async fn set_mcp_enabled(app: tauri::AppHandle, enabled: bool) -> Result<McpSettings, String> {
    if enabled {
        start(&app)?;
    } else {
        let handle = {
            app.state::<McpState>()
                .server
                .lock()
                .map_err(|_| "无法停止 MCP 服务")?
                .take()
        };
        if let Some(handle) = handle {
            handle.abort();
            let _ = handle.await;
        }
        if let Ok(mut error) = app.state::<McpState>().error.lock() {
            *error = None;
        }
    }
    let persisted = database(&app).and_then(|conn| conn.execute("INSERT INTO settings (key, value) VALUES ('mcp_enabled', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [if enabled { "1" } else { "0" }]).map_err(|e| e.to_string()));
    if let Err(error) = persisted {
        if enabled {
            let handle = {
                app.state::<McpState>()
                    .server
                    .lock()
                    .map_err(|_| "无法停止 MCP 服务")?
                    .take()
            };
            if let Some(handle) = handle {
                handle.abort();
                let _ = handle.await;
            }
        }
        return Err(format!("无法保存 MCP 设置：{error}"));
    }
    get_mcp_settings(app)
}

pub fn restore_on_start(app: tauri::AppHandle) {
    let enabled = database(&app)
        .ok()
        .and_then(|db| {
            db.query_row(
                "SELECT value FROM settings WHERE key = 'mcp_enabled'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .is_some_and(|value| value == "1");
    if enabled {
        if let Err(error) = start(&app) {
            if let Ok(mut slot) = app.state::<McpState>().error.lock() {
                *slot = Some(error);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct TestServer {
        tool_router: ToolRouter<Self>,
    }
    #[tool_router]
    impl TestServer {
        fn new() -> Self {
            Self {
                tool_router: Self::tool_router(),
            }
        }
        #[tool(description = "Return a test value")]
        fn echo_test(&self) -> CallToolResult {
            CallToolResult::success(vec![ContentBlock::text("ok")])
        }
    }
    #[tool_handler(router = self.tool_router)]
    impl ServerHandler for TestServer {
        fn get_info(&self) -> ServerConfig {
            ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
        }
    }

    #[test]
    fn exposes_the_expected_local_tools() {
        let tools = LocalServer::tool_router();
        assert!(tools.has_route("catchlinger_save"));
        assert!(tools.has_route("catchlinger_search"));
        assert!(tools.has_route("catchlinger_list_tags"));
    }

    #[test]
    fn http_transport_negotiates_and_enforces_access() {
        tauri::async_runtime::block_on(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let service = rmcp::transport::streamable_http_server::StreamableHttpService::new(|| Ok(TestServer::new()), Arc::new(rmcp::transport::streamable_http_server::session::local::LocalSessionManager::default()), rmcp::transport::streamable_http_server::StreamableHttpServerConfig::default().with_legacy_session_mode(false).with_json_response(true));
            let router =
                Router::new()
                    .route_service("/mcp", service)
                    .layer(middleware::from_fn_with_state(
                        Arc::new("test-secret".to_string()),
                        authorize,
                    ));
            let server = tokio::spawn(async move {
                axum::serve(listener, router).await.unwrap();
            });
            let client = reqwest::Client::builder().no_proxy().build().unwrap();
            let url = format!("http://{address}/mcp");
            let init = serde_json::json!({"jsonrpc":"2.0", "id":1, "method":"initialize", "params":{"protocolVersion":"2025-11-25", "capabilities":{}, "clientInfo":{"name":"test", "version":"1"}}});
            let send = |body: serde_json::Value| {
                client
                    .post(&url)
                    .header("Host", ADDRESS)
                    .header("Authorization", "Bearer test-secret")
                    .header("Accept", "application/json, text/event-stream")
                    .header("MCP-Protocol-Version", "2025-11-25")
                    .json(&body)
            };
            let denied = client
                .post(&url)
                .header("Host", ADDRESS)
                .json(&init)
                .send()
                .await
                .unwrap();
            assert_eq!(denied.status(), StatusCode::FORBIDDEN);
            let denied = send(init.clone())
                .header("Origin", "https://example.com")
                .send()
                .await
                .unwrap();
            assert_eq!(denied.status(), StatusCode::FORBIDDEN);
            let response = send(init).send().await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert!(
                response.json::<serde_json::Value>().await.unwrap()["result"]["protocolVersion"]
                    .is_string()
            );
            let notification =
                send(serde_json::json!({"jsonrpc":"2.0", "method":"notifications/initialized"}))
                    .send()
                    .await
                    .unwrap();
            assert_eq!(notification.status(), StatusCode::ACCEPTED);
            let listed = send(
                serde_json::json!({"jsonrpc":"2.0", "id":2, "method":"tools/list", "params":{}}),
            )
            .send()
            .await
            .unwrap();
            assert!(
                listed.json::<serde_json::Value>().await.unwrap()["result"]["tools"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|tool| tool["name"] == "echo_test")
            );
            let called = send(serde_json::json!({"jsonrpc":"2.0", "id":3, "method":"tools/call", "params":{"name":"echo_test", "arguments":{}}})).send().await.unwrap();
            assert_eq!(
                called.json::<serde_json::Value>().await.unwrap()["result"]["content"][0]["text"],
                "ok"
            );
            server.abort();
        });
    }
    #[test]
    fn rejects_origins_wrong_hosts_and_missing_credentials() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert("host", "127.0.0.1:46917".parse().unwrap());
        assert!(!auth_header_valid(&headers, "secret"));
        headers.insert("authorization", "Bearer secret".parse().unwrap());
        assert!(auth_header_valid(&headers, "secret"));
        headers.insert("origin", "https://example.com".parse().unwrap());
        assert!(!auth_header_valid(&headers, "secret"));
        headers.remove("origin");
        headers.insert("host", "attacker.example:46917".parse().unwrap());
        assert!(!auth_header_valid(&headers, "secret"));
        headers.insert("host", "127.0.0.1:46917".parse().unwrap());
        headers.insert(
            "origin",
            "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
                .parse()
                .unwrap(),
        );
        assert!(auth_header_valid(&headers, "secret"));
    }
}
