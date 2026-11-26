#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod analysis;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::Manager;
use url::Url;

#[derive(Serialize)]
struct Item {
    id: i64,
    url: String,
    title: String,
    summary: String,
    tags: Vec<String>,
    created_at: String,
    liked: bool,
    archived: bool,
    note_count: i64,
}

fn data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let conn = Connection::open(data_dir(app)?.join("trove.sqlite3")).map_err(|e| e.to_string())?;
    initialize_database(&conn)?;
    Ok(conn)
}

fn initialize_database(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reader_notes (
            id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL,
            body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS reader_notes_item_id_idx ON reader_notes(item_id);",
    )
    .map_err(|e| e.to_string())?;
    let columns = conn
        .prepare("PRAGMA table_info(items)")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if !columns.iter().any(|c| c == "summary") {
        conn.execute(
            "ALTER TABLE items ADD COLUMN summary TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !columns.iter().any(|c| c == "tags") {
        conn.execute(
            "ALTER TABLE items ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !columns.iter().any(|c| c == "body") {
        conn.execute(
            "ALTER TABLE items ADD COLUMN body TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !columns.iter().any(|c| c == "liked") {
        conn.execute(
            "ALTER TABLE items ADD COLUMN liked INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !columns.iter().any(|c| c == "archived") {
        conn.execute(
            "ALTER TABLE items ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
struct AiSettings {
    provider: String,
    model: String,
    has_key: bool,
}

fn read_key(app: &tauri::AppHandle) -> Result<String, String> {
    let path = data_dir(app)?.join(".env.local");
    let contents = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
        Err(e) => return Err(format!("无法读取 AI 密钥：{e}")),
    };
    Ok(contents
        .lines()
        .find_map(|line| line.strip_prefix("DEEPSEEK_API_KEY="))
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
fn get_ai_settings(app: tauri::AppHandle) -> Result<AiSettings, String> {
    let conn = database(&app)?;
    let model = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'deepseek_model'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "deepseek-chat".to_string());
    Ok(AiSettings {
        provider: "deepseek".into(),
        model,
        has_key: !read_key(&app)?.is_empty(),
    })
}

#[tauri::command]
fn save_ai_settings(
    app: tauri::AppHandle,
    provider: String,
    model: String,
    api_key: String,
) -> Result<(), String> {
    if provider != "deepseek" {
        return Err("暂不支持该 AI 服务商".into());
    }
    let model = model.trim();
    if model.is_empty()
        || model.len() > 100
        || !model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    {
        return Err("模型名称无效".into());
    }
    let key = api_key.trim();
    if key.contains(['\n', '\r']) || key.len() > 1024 {
        return Err("API Key 格式无效".into());
    }
    if !key.is_empty() {
        std::fs::write(
            data_dir(&app)?.join(".env.local"),
            format!("DEEPSEEK_API_KEY={key}\n"),
        )
        .map_err(|_| "无法保存 AI 密钥".to_string())?;
    } else if read_key(&app)?.is_empty() {
        return Err("请输入 DeepSeek API Key".into());
    }
    database(&app)?.execute("INSERT INTO settings(key, value) VALUES ('deepseek_model', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [model]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn analyze_url(app: tauri::AppHandle, url: String) -> Result<analysis::Analysis, String> {
    let settings = get_ai_settings(app.clone())?;
    let key = read_key(&app)?;
    if key.is_empty() {
        return Err("请先在 AI 设置中配置 DeepSeek API Key".into());
    }
    analysis::analyze(&url, &settings.model, &key).await
}

#[tauri::command]
fn list_items(app: tauri::AppHandle, query: Option<String>) -> Result<Vec<Item>, String> {
    let conn = database(&app)?;
    search_items(&conn, query.as_deref().unwrap_or(""))
}

fn search_items(conn: &Connection, query_text: &str) -> Result<Vec<Item>, String> {
    let query_text = query_text.trim();
    let mut query = conn
        .prepare("SELECT id, url, title, created_at, summary, tags, liked, archived, (SELECT count(*) FROM reader_notes WHERE item_id = items.id) AS note_count FROM items WHERE ?1 = '' OR instr(lower(title), lower(?1)) > 0 OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(items.tags) THEN items.tags ELSE '[]' END) WHERE instr(lower(json_each.value), lower(?1)) > 0) OR instr(lower(body), lower(?1)) > 0 ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    let rows = query
        .query_map([query_text], |row| {
            let tags: String = row.get(5)?;
            Ok(Item {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                summary: row.get(4)?,
                tags: serde_json::from_str(&tags).unwrap_or_default(),
                liked: row.get(6)?,
                archived: row.get(7)?,
                note_count: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_item_state(
    app: tauri::AppHandle,
    id: i64,
    field: String,
    value: bool,
) -> Result<(), String> {
    let sql = match field.as_str() {
        "liked" => "UPDATE items SET liked = ?1 WHERE id = ?2",
        "archived" => "UPDATE items SET archived = ?1 WHERE id = ?2",
        _ => return Err("不支持的操作".into()),
    };
    let updated = database(&app)?
        .execute(sql, params![value, id])
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("找不到这条收藏".into());
    }
    Ok(())
}

#[derive(Serialize)]
struct ReaderNote {
    id: i64,
    body: String,
    created_at: String,
}

#[tauri::command]
fn list_reader_notes(app: tauri::AppHandle, item_id: i64) -> Result<Vec<ReaderNote>, String> {
    let conn = database(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, body, created_at FROM reader_notes WHERE item_id = ?1 ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([item_id], |row| {
            Ok(ReaderNote {
                id: row.get(0)?,
                body: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn add_reader_note(app: tauri::AppHandle, item_id: i64, body: String) -> Result<(), String> {
    let body = body.trim();
    if body.is_empty() || body.chars().count() > 10000 {
        return Err("笔记不能为空，且不能超过 10000 字".into());
    }
    let conn = database(&app)?;
    let count = conn
        .execute(
            "INSERT INTO reader_notes (item_id, body) SELECT id, ?1 FROM items WHERE id = ?2",
            params![body, item_id],
        )
        .map_err(|e| e.to_string())?;
    if count == 0 {
        return Err("找不到这条收藏".into());
    }
    Ok(())
}

#[tauri::command]
fn delete_reader_note(app: tauri::AppHandle, id: i64, item_id: i64) -> Result<(), String> {
    database(&app)?
        .execute(
            "DELETE FROM reader_notes WHERE id = ?1 AND item_id = ?2",
            params![id, item_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
struct SaveItem {
    url: String,
    title: String,
    summary: String,
    tags: Vec<String>,
    body: Option<String>,
}

#[tauri::command]
fn save_item(app: tauri::AppHandle, item: SaveItem) -> Result<(), String> {
    let parsed = Url::parse(item.url.trim()).map_err(|_| "请输入有效的网址".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("仅支持 HTTP 或 HTTPS 网址".into());
    }
    let title = item.title.trim();
    if title.is_empty() || title.chars().count() > 500 {
        return Err("标题不能为空，且不能超过 500 个字符".into());
    }
    if item.summary.chars().count() > 2000 {
        return Err("摘要不能超过 2000 个字符".into());
    }
    let tags = analysis::normalize_tags(item.tags)?;
    let tags = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    let body = item.body.unwrap_or_default();
    if body.len() > 2 * 1024 * 1024 {
        return Err("正文过长".into());
    }
    database(&app)?.execute(
        "INSERT INTO items (url, title, summary, tags, body) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(url) DO UPDATE SET title=excluded.title, summary=excluded.summary, tags=excluded.tags, body=CASE WHEN excluded.body = '' THEN items.body ELSE excluded.body END",
        params![parsed.as_str(), title, item.summary.trim(), tags, body],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
struct ReaderItem {
    id: i64,
    url: String,
    title: String,
    summary: String,
    body: String,
}

#[tauri::command]
async fn get_reader_item(app: tauri::AppHandle, id: i64) -> Result<ReaderItem, String> {
    let (url, title, summary, mut body): (String, String, String, String) = database(&app)?
        .query_row(
            "SELECT url, title, summary, body FROM items WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "找不到这条收藏".to_string())?;
    if body.is_empty() {
        let (_, fetched) = analysis::fetch_page(&url)
            .await
            .map_err(|e| format!("此收藏尚未保存正文，重新读取失败：{e}"))?;
        database(&app)?
            .execute(
                "UPDATE items SET body = ?1 WHERE id = ?2 AND url = ?3 AND body = ''",
                params![fetched, id, url],
            )
            .map_err(|e| e.to_string())?;
        body = database(&app)?
            .query_row("SELECT body FROM items WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .map_err(|_| "收藏已被删除".to_string())?;
    }
    Ok(ReaderItem {
        id,
        url,
        title,
        summary,
        body,
    })
}

#[tauri::command]
fn open_original(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "网址无效".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("仅支持 HTTP 或 HTTPS 网址".into());
    }
    open::that(parsed.as_str()).map_err(|_| "无法打开原网页".into())
}

#[tauri::command]
fn delete_item(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let mut conn = database(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM reader_notes WHERE item_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM items WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_items,
            save_item,
            delete_item,
            get_ai_settings,
            save_ai_settings,
            analyze_url,
            get_reader_item,
            open_original,
            set_item_state,
            list_reader_notes,
            add_reader_note,
            delete_reader_note
        ])
        .run(tauri::generate_context!())
        .expect("无法启动拾藏桌面应用");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upgrades_existing_items_without_losing_content() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE items (id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, summary TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', body TEXT NOT NULL DEFAULT ''); INSERT INTO items(url,title,body) VALUES ('https://example.com','标题','正文');").unwrap();
        initialize_database(&conn).unwrap();
        initialize_database(&conn).unwrap();
        let (title, body, liked, archived): (String, String, bool, bool) = conn
            .query_row(
                "SELECT title, body, liked, archived FROM items",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(
            (title.as_str(), body.as_str(), liked, archived),
            ("标题", "正文", false, false)
        );
    }

    #[test]
    fn search_matches_title_tags_and_body_including_archived() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        conn.execute(
            "INSERT INTO items (url, title, tags, body, archived) VALUES (?1, ?2, ?3, ?4, 1)",
            params![
                "https://example.com",
                "Rust 入门",
                r#"["学习","数据库"]"#,
                "这篇正文包含百分号 100% 的测试"
            ],
        )
        .unwrap();
        for query in ["rust", "数据库", "正文", "100%"] {
            let items = search_items(&conn, query).unwrap();
            assert_eq!(items.len(), 1, "query: {query}");
            assert!(items[0].archived);
        }
        assert!(search_items(&conn, "不存在").unwrap().is_empty());
        assert!(search_items(&conn, "_").unwrap().is_empty());
        assert!(search_items(&conn, "[").unwrap().is_empty());
        assert_eq!(search_items(&conn, " ").unwrap().len(), 1);
    }

    #[test]
    fn list_counts_notes_for_each_item() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        conn.execute("INSERT INTO items (id, url, title, archived) VALUES (1, 'https://example.com', '有笔记', 1), (2, 'https://example.org', '无笔记', 0)", []).unwrap();
        conn.execute(
            "INSERT INTO reader_notes (item_id, body) VALUES (1, '一'), (1, '二')",
            [],
        )
        .unwrap();
        let items = search_items(&conn, "").unwrap();
        assert_eq!(
            items.iter().find(|item| item.id == 1).unwrap().note_count,
            2
        );
        assert_eq!(
            items.iter().find(|item| item.id == 2).unwrap().note_count,
            0
        );
    }
}
