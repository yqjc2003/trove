#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod analysis;
mod assets;
mod content_kind;
mod markdown;
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;
use url::Url;

static DATABASE_INIT: Mutex<()> = Mutex::new(());

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
    content_type: content_kind::ContentKind,
}

fn data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let _guard = DATABASE_INIT
        .lock()
        .map_err(|_| "无法初始化本地数据库".to_string())?;
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
        CREATE TABLE IF NOT EXISTS custom_tags (
            name TEXT PRIMARY KEY COLLATE NOCASE
        );
        CREATE TABLE IF NOT EXISTS item_images (
            item_id INTEGER NOT NULL, source TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL,
            PRIMARY KEY(item_id, source)
        );
        CREATE INDEX IF NOT EXISTS reader_notes_item_id_idx ON reader_notes(item_id);",
    )
    .map_err(|e| e.to_string())?;
    let note_columns = conn
        .prepare("PRAGMA table_info(reader_notes)")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (name, definition) in [
        ("anchor_text", "TEXT NOT NULL DEFAULT ''"),
        ("start_offset", "INTEGER"),
        ("end_offset", "INTEGER"),
        ("element_index", "INTEGER"),
        ("updated_at", "TEXT NOT NULL DEFAULT ''"),
    ] {
        if !note_columns.iter().any(|column| column == name) {
            conn.execute(
                &format!("ALTER TABLE reader_notes ADD COLUMN {name} {definition}"),
                [],
            )
            .map_err(|e| e.to_string())?;
        }
    }
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
    if !columns.iter().any(|c| c == "source_note") {
        conn.execute(
            "ALTER TABLE items ADD COLUMN source_note TEXT NOT NULL DEFAULT ''",
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
    if !columns.iter().any(|c| c == "content_type") {
        conn.execute(
            "ALTER TABLE items ADD COLUMN content_type TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    // 旧数据库的 url 不允许 NULL；手写文章没有外部地址，需要一次性迁移。
    let url_not_null: bool = conn
        .query_row(
            "SELECT \"notnull\" FROM pragma_table_info('items') WHERE name = 'url'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if url_not_null {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute_batch("CREATE TABLE items_migrated (id INTEGER PRIMARY KEY, url TEXT UNIQUE, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, summary TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', body TEXT NOT NULL DEFAULT '', source_note TEXT NOT NULL DEFAULT '', liked INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, content_type TEXT NOT NULL DEFAULT '');
            INSERT INTO items_migrated (id,url,title,created_at,summary,tags,body,source_note,liked,archived,content_type) SELECT id,url,title,created_at,summary,tags,body,source_note,liked,archived,content_type FROM items;
            DROP TABLE items; ALTER TABLE items_migrated RENAME TO items;").map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    let missing = {
        let mut stmt = conn
            .prepare("SELECT id, url FROM items WHERE content_type = '' AND url IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    for (id, url) in missing {
        conn.execute(
            "UPDATE items SET content_type = ?1 WHERE id = ?2",
            params![content_kind::detect(&url).as_str(), id],
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
        let source = analysis::fetch_source(&url).await?;
        return Ok(analysis::Analysis {
            title: source.title,
            summary: String::new(),
            tags: vec![],
            body: source.body,
            content_type: content_kind::detect(&url),
            warning: Some(format!(
                "{}未配置 AI，已使用本地转换；可手工填写摘要和标签。",
                source.warning.unwrap_or_default()
            )),
            images: source.images,
            source_incomplete: source.incomplete,
        });
    }
    let available_tags = list_desktop_tags_in_db(&database(&app)?)?;
    let mut result = analysis::analyze(&url, &settings.model, &key, &available_tags).await?;
    // AI 请求期间标签可能被删除；返回前再按当前标签库校验。
    let current_tags = list_desktop_tags_in_db(&database(&app)?)?;
    result.tags = analysis::select_existing_tags(&result.tags, &current_tags);
    Ok(result)
}

#[tauri::command]
fn classify_url(url: String) -> Result<content_kind::ContentKind, String> {
    let parsed = Url::parse(url.trim()).map_err(|_| "请输入有效的网址".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("仅支持 HTTP 或 HTTPS 网址".into());
    }
    Ok(content_kind::detect(parsed.as_str()))
}

#[tauri::command]
fn list_items(app: tauri::AppHandle, query: Option<String>) -> Result<Vec<Item>, String> {
    let conn = database(&app)?;
    search_items(&conn, query.as_deref().unwrap_or(""))
}

fn search_items(conn: &Connection, query_text: &str) -> Result<Vec<Item>, String> {
    let query_text = query_text.trim();
    let mut query = conn
        .prepare("SELECT id, coalesce(url, ''), title, created_at, summary, tags, liked, archived, (SELECT count(*) FROM reader_notes WHERE item_id = items.id) AS note_count, content_type FROM items WHERE ?1 = '' OR instr(lower(title), lower(?1)) > 0 OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(items.tags) THEN items.tags ELSE '[]' END) WHERE instr(lower(json_each.value), lower(?1)) > 0) OR instr(lower(body), lower(?1)) > 0 ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    let rows = query
        .query_map([query_text], |row| {
            let tags: String = row.get(5)?;
            let url: String = row.get(1)?;
            Ok(Item {
                id: row.get(0)?,
                content_type: content_kind::ContentKind::from_stored(
                    &row.get::<_, String>(9)?,
                    &url,
                ),
                url,
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
    item_id: i64,
    body: String,
    created_at: String,
    updated_at: String,
    anchor_text: String,
    start_offset: Option<i64>,
    end_offset: Option<i64>,
    element_index: Option<i64>,
}

fn list_notes_in_db(conn: &Connection, item_id: Option<i64>) -> Result<Vec<ReaderNote>, String> {
    let mut stmt = conn.prepare("SELECT id, item_id, body, created_at, updated_at, anchor_text, start_offset, end_offset, element_index FROM reader_notes WHERE (?1 IS NULL OR item_id = ?1) ORDER BY item_id DESC, start_offset IS NULL, start_offset, id").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([item_id], |row| {
            Ok(ReaderNote {
                id: row.get(0)?,
                item_id: row.get(1)?,
                body: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                anchor_text: row.get(5)?,
                start_offset: row.get(6)?,
                end_offset: row.get(7)?,
                element_index: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_reader_notes(app: tauri::AppHandle, item_id: i64) -> Result<Vec<ReaderNote>, String> {
    list_notes_in_db(&database(&app)?, Some(item_id))
}

#[tauri::command]
fn list_all_reader_notes(app: tauri::AppHandle) -> Result<Vec<ReaderNote>, String> {
    list_notes_in_db(&database(&app)?, None)
}

#[derive(Deserialize)]
struct AnnotationAnchor {
    text: String,
    start: i64,
    end: i64,
    element_index: Option<i64>,
}

fn add_annotation_in_db(
    conn: &Connection,
    item_id: i64,
    body: &str,
    anchor: AnnotationAnchor,
) -> Result<(), String> {
    let body = body.trim();
    if body.is_empty() || body.chars().count() > 10000 {
        return Err("批注不能为空，且不能超过 10000 字".into());
    }
    if anchor.start < 0
        || anchor.end < anchor.start
        || anchor.end > 4 * 1024 * 1024
        || anchor.text.chars().count() > 10000
        || anchor
            .element_index
            .is_some_and(|i| !(0..=100000).contains(&i))
        || (anchor.element_index.is_none()
            && (anchor.start == anchor.end || anchor.text.is_empty()))
    {
        return Err("选中的内容无效或过长".into());
    }
    let changed = conn.execute("INSERT INTO reader_notes (item_id, body, anchor_text, start_offset, end_offset, element_index) SELECT id, ?1, ?2, ?3, ?4, ?5 FROM items WHERE id = ?6", params![body, anchor.text, anchor.start, anchor.end, anchor.element_index, item_id]).map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("找不到这条收藏".into());
    }
    Ok(())
}

#[tauri::command]
fn add_annotation(
    app: tauri::AppHandle,
    item_id: i64,
    body: String,
    anchor: AnnotationAnchor,
) -> Result<(), String> {
    add_annotation_in_db(&database(&app)?, item_id, &body, anchor)
}

fn edit_note_in_db(conn: &Connection, id: i64, item_id: i64, body: &str) -> Result<(), String> {
    let body = body.trim();
    if body.is_empty() || body.chars().count() > 10000 {
        return Err("批注不能为空，且不能超过 10000 字".into());
    }
    let changed = conn.execute("UPDATE reader_notes SET body = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND item_id = ?3", params![body, id, item_id]).map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("找不到这条笔记".into());
    }
    Ok(())
}

#[tauri::command]
fn edit_reader_note(
    app: tauri::AppHandle,
    id: i64,
    item_id: i64,
    body: String,
) -> Result<(), String> {
    edit_note_in_db(&database(&app)?, id, item_id, &body)
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
    #[serde(default)]
    source_note: Option<String>,
    #[serde(default)]
    images: Option<Vec<assets::LocalImage>>,
    #[serde(default)]
    source_incomplete: Option<bool>,
}

fn validate_item_metadata(title: &str, summary: &str) -> Result<(), String> {
    if title.trim().is_empty() || title.trim().chars().count() > 500 {
        return Err("标题不能为空，且不能超过 500 个字符".into());
    }
    if summary.chars().count() > 2000 {
        return Err("摘要不能超过 2000 个字符".into());
    }
    Ok(())
}

#[tauri::command]
fn save_item(app: tauri::AppHandle, item: SaveItem) -> Result<(), String> {
    save_item_in_db(&database(&app)?, item)
}

#[derive(Deserialize)]
struct NewNoteArticle {
    title: String,
    summary: String,
    tags: Vec<String>,
    body: String,
}

fn create_note_article_in_db(conn: &Connection, note: NewNoteArticle) -> Result<(), String> {
    validate_item_metadata(&note.title, &note.summary)?;
    if note.body.len() > 2 * 1024 * 1024 {
        return Err("正文过长".into());
    }
    let tags = serde_json::to_string(&analysis::normalize_manual_tags(note.tags)?)
        .map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO items (url, title, summary, tags, body, content_type) VALUES (NULL, ?1, ?2, ?3, ?4, 'note')", params![note.title.trim(), note.summary.trim(), tags, note.body]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_note_article(app: tauri::AppHandle, note: NewNoteArticle) -> Result<(), String> {
    create_note_article_in_db(&database(&app)?, note)
}

fn save_item_in_db(conn: &Connection, item: SaveItem) -> Result<(), String> {
    let parsed = Url::parse(item.url.trim()).map_err(|_| "请输入有效的网址".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("仅支持 HTTP 或 HTTPS 网址".into());
    }
    let title = item.title.trim();
    validate_item_metadata(title, &item.summary)?;
    let tags = analysis::normalize_manual_tags(item.tags)?;
    let tags = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    let body = item.body.unwrap_or_default();
    if body.len() > 2 * 1024 * 1024 {
        return Err("正文过长".into());
    }
    let source_note = item.source_note.unwrap_or_default();
    if source_note.chars().count() > 1000 {
        return Err("内容提示过长".into());
    }
    let source_incomplete = item.source_incomplete.unwrap_or(!source_note.is_empty());
    let images = item.images.unwrap_or_default();
    if images.len() > 24 {
        return Err("图片数量超过限制".into());
    }
    let mut decoded = Vec::new();
    let mut total_size = 0;
    for image in images {
        let bytes = assets::validate(&image)?;
        total_size += bytes.len();
        if total_size > 8 * 1024 * 1024 {
            return Err("图片总大小超过限制".into());
        }
        if decoded
            .iter()
            .any(|(source, _, _): &(String, String, Vec<u8>)| source == &image.source)
        {
            return Err("图片地址重复".into());
        }
        decoded.push((image.source, image.mime, bytes));
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let old_body: Option<String> = tx
        .query_row(
            "SELECT body FROM items WHERE url = ?1",
            [parsed.as_str()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let replace_source =
        !body.is_empty() && (!source_incomplete || old_body.as_deref().unwrap_or("").is_empty());
    tx.execute(
        "INSERT INTO items (url, title, summary, tags, body, source_note, content_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?8) ON CONFLICT(url) DO UPDATE SET title=excluded.title, summary=excluded.summary, tags=excluded.tags, content_type=excluded.content_type, body=CASE WHEN excluded.body = '' OR (?7 AND items.body <> '') THEN items.body ELSE excluded.body END, source_note=CASE WHEN excluded.body = '' OR (?7 AND items.body <> '') THEN items.source_note ELSE excluded.source_note END",
        params![parsed.as_str(), title, item.summary.trim(), tags, body, source_note, source_incomplete, content_kind::detect(parsed.as_str()).as_str()],
    ).map_err(|e| e.to_string())?;
    if replace_source {
        let id: i64 = tx
            .query_row(
                "SELECT id FROM items WHERE url = ?1",
                [parsed.as_str()],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        replace_images(&tx, id, &decoded)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn replace_images(
    conn: &Connection,
    item_id: i64,
    images: &[(String, String, Vec<u8>)],
) -> Result<(), String> {
    conn.execute("DELETE FROM item_images WHERE item_id = ?1", [item_id])
        .map_err(|e| e.to_string())?;
    for (source, mime, data) in images {
        conn.execute(
            "INSERT INTO item_images (item_id, source, mime, data) VALUES (?1, ?2, ?3, ?4)",
            params![item_id, source, mime, data],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Deserialize)]
struct EditItem {
    id: i64,
    title: String,
    summary: String,
    tags: Vec<String>,
    #[serde(default)]
    body: Option<String>,
}

fn edit_item_in_db(conn: &Connection, item: EditItem) -> Result<(), String> {
    validate_item_metadata(&item.title, &item.summary)?;
    let tags = analysis::normalize_manual_tags(item.tags)?;
    let tags = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    if item
        .body
        .as_ref()
        .is_some_and(|body| body.len() > 2 * 1024 * 1024)
    {
        return Err("正文过长".into());
    }
    let count = conn
        .execute(
            "UPDATE items SET title = ?1, summary = ?2, tags = ?3, body = CASE WHEN content_type = 'note' AND ?5 IS NOT NULL THEN ?5 ELSE body END WHERE id = ?4",
            params![item.title.trim(), item.summary.trim(), tags, item.id, item.body],
        )
        .map_err(|e| e.to_string())?;
    if count == 0 {
        return Err("找不到这条收藏".into());
    }
    Ok(())
}

#[tauri::command]
fn edit_item(app: tauri::AppHandle, item: EditItem) -> Result<(), String> {
    edit_item_in_db(&database(&app)?, item)
}

fn create_custom_tag_in_db(conn: &Connection, name: &str) -> Result<(), String> {
    let normalized = analysis::normalize_manual_tags(vec![name.to_string()])?;
    let name = normalized.first().ok_or("标签不能为空")?;
    conn.execute(
        "INSERT INTO custom_tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
        [name],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_custom_tag(app: tauri::AppHandle, name: String) -> Result<(), String> {
    create_custom_tag_in_db(&database(&app)?, &name)
}

fn delete_desktop_tag_in_db(conn: &mut Connection, name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("标签不能为空".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let rows = {
        let mut stmt = tx
            .prepare("SELECT id, tags FROM items WHERE json_valid(tags)")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    for (id, raw_tags) in rows {
        let Ok(serde_json::Value::Array(mut tags)) =
            serde_json::from_str::<serde_json::Value>(&raw_tags)
        else {
            continue;
        };
        let old_len = tags.len();
        tags.retain(|tag| {
            !tag.as_str()
                .is_some_and(|value| value.eq_ignore_ascii_case(name))
        });
        if tags.len() != old_len {
            let new_tags = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE items SET tags = ?1 WHERE id = ?2",
                params![new_tags, id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.execute(
        "DELETE FROM custom_tags WHERE name = ?1 COLLATE NOCASE",
        [name],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_desktop_tag(app: tauri::AppHandle, name: String) -> Result<(), String> {
    delete_desktop_tag_in_db(&mut database(&app)?, &name)
}

#[tauri::command]
fn list_desktop_tags(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let conn = database(&app)?;
    list_desktop_tags_in_db(&conn)
}

fn list_desktop_tags_in_db(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare("SELECT name FROM custom_tags UNION ALL SELECT json_each.value FROM items, json_each(CASE WHEN json_valid(items.tags) THEN items.tags ELSE '[]' END) WHERE json_each.type = 'text'")
        .map_err(|e| e.to_string())?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut unique: Vec<String> = Vec::new();
    for name in names {
        if !name.trim().is_empty()
            && !unique
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(&name))
        {
            unique.push(name);
        }
    }
    Ok(unique)
}

fn set_item_tags_in_db(conn: &Connection, id: i64, tags: Vec<String>) -> Result<(), String> {
    let tags = analysis::normalize_manual_tags(tags)?;
    let tags = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    let count = conn
        .execute(
            "UPDATE items SET tags = ?1 WHERE id = ?2",
            params![tags, id],
        )
        .map_err(|e| e.to_string())?;
    if count == 0 {
        return Err("找不到这条收藏".into());
    }
    Ok(())
}

#[tauri::command]
fn set_item_tags(app: tauri::AppHandle, id: i64, tags: Vec<String>) -> Result<(), String> {
    set_item_tags_in_db(&database(&app)?, id, tags)
}

#[derive(Serialize)]
struct ReaderItem {
    id: i64,
    url: String,
    title: String,
    summary: String,
    body: String,
    source_note: String,
    images: Vec<assets::LocalImage>,
}

#[tauri::command]
fn get_reader_item_in_db(conn: &Connection, id: i64) -> Result<ReaderItem, String> {
    let (url, title, summary, body, source_note): (String, String, String, String, String) = conn
        .query_row(
            "SELECT coalesce(url, ''), title, summary, body, source_note FROM items WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|_| "找不到这条收藏".to_string())?;
    let mut stmt = conn
        .prepare("SELECT source, mime, data FROM item_images WHERE item_id = ?1")
        .map_err(|e| e.to_string())?;
    let images = stmt
        .query_map([id], |row| {
            let bytes: Vec<u8> = row.get(2)?;
            Ok(assets::LocalImage {
                source: row.get(0)?,
                mime: row.get(1)?,
                data: STANDARD.encode(bytes),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(ReaderItem {
        id,
        url,
        title,
        summary,
        body,
        source_note,
        images,
    })
}

#[tauri::command]
fn get_reader_item(app: tauri::AppHandle, id: i64) -> Result<ReaderItem, String> {
    get_reader_item_in_db(&database(&app)?, id)
}

#[tauri::command]
async fn fetch_reader_content(
    app: tauri::AppHandle,
    id: i64,
    force: Option<bool>,
) -> Result<ReaderItem, String> {
    let existing = get_reader_item_in_db(&database(&app)?, id)?;
    if existing.url.is_empty() {
        return Err("手写文章没有原网页，不能重新获取。".into());
    }
    if !existing.body.trim().is_empty() && !force.unwrap_or(false) {
        return Ok(existing);
    }
    let key = read_key(&app)?;
    let source = if !key.is_empty()
        && content_kind::detect(&existing.url) == content_kind::ContentKind::Article
    {
        let settings = get_ai_settings(app.clone())?;
        let result = analysis::analyze(&existing.url, &settings.model, &key, &[]).await?;
        analysis::Source {
            title: result.title,
            body: result.body,
            warning: result.warning,
            images: result.images,
            incomplete: result.source_incomplete,
        }
    } else {
        analysis::fetch_source(&existing.url).await?
    };
    if source.body.trim().is_empty() {
        return Err(source
            .warning
            .unwrap_or_else(|| "没有可读取的原始内容，请打开原网页。".into()));
    }
    if source.incomplete && !existing.body.trim().is_empty() {
        return Err(format!(
            "新内容不完整，已保留原有正文和图片：{}",
            source.warning.unwrap_or_default()
        ));
    }
    let decoded: Vec<_> = source
        .images
        .iter()
        .map(|image| {
            Ok((
                image.source.clone(),
                image.mime.clone(),
                assets::validate(image)?,
            ))
        })
        .collect::<Result<_, String>>()?;
    let mut conn = database(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let changed = tx
        .execute(
            "UPDATE items SET body = ?1, source_note = ?2 WHERE id = ?3 AND url = ?4 AND body = ?5",
            params![
                source.body,
                source.warning.unwrap_or_default(),
                id,
                existing.url,
                existing.body
            ],
        )
        .map_err(|e| e.to_string())?;
    if changed > 0 {
        replace_images(&tx, id, &decoded)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    get_reader_item_in_db(&database(&app)?, id)
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
fn render_markdown(body: String, images: Vec<assets::LocalImage>) -> Result<String, String> {
    if body.len() > 2 * 1024 * 1024 {
        return Err("正文过长，无法渲染".into());
    }
    markdown::render(&body, &images)
}

#[tauri::command]
fn delete_item(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let mut conn = database(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM reader_notes WHERE item_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM item_images WHERE item_id = ?1", [id])
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
            create_note_article,
            edit_item,
            delete_item,
            get_ai_settings,
            save_ai_settings,
            analyze_url,
            classify_url,
            get_reader_item,
            fetch_reader_content,
            open_original,
            render_markdown,
            set_item_state,
            list_reader_notes,
            list_all_reader_notes,
            add_annotation,
            edit_reader_note,
            add_reader_note,
            delete_reader_note,
            create_custom_tag,
            delete_desktop_tag,
            list_desktop_tags,
            set_item_tags
        ])
        .run(tauri::generate_context!())
        .expect("无法启动拾藏桌面应用");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn annotation_migration_order_edit_and_legacy_notes() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE reader_notes (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO reader_notes(item_id,body) VALUES (1,'旧笔记');").unwrap();
        initialize_database(&conn).unwrap();
        conn.execute("INSERT INTO items (id, url, title, body) VALUES (1, 'https://example.com', '文章', '正文')", []).unwrap();
        for (text, start) in [("后", 20), ("前", 3)] {
            add_annotation_in_db(
                &conn,
                1,
                text,
                AnnotationAnchor {
                    text: text.into(),
                    start,
                    end: start + 1,
                    element_index: None,
                },
            )
            .unwrap();
        }
        let notes = list_notes_in_db(&conn, Some(1)).unwrap();
        assert_eq!(
            notes.iter().map(|n| n.body.as_str()).collect::<Vec<_>>(),
            ["前", "后", "旧笔记"]
        );
        edit_note_in_db(&conn, notes[0].id, 1, "修改").unwrap();
        let updated = list_notes_in_db(&conn, Some(1)).unwrap();
        assert_eq!(updated[0].body, "修改");
        assert!(!updated[0].updated_at.is_empty());
        assert_eq!(updated[0].anchor_text, "前");
        assert!(edit_note_in_db(&conn, notes[0].id, 2, "错误文章").is_err());
        assert!(add_annotation_in_db(
            &conn,
            1,
            "笔记",
            AnnotationAnchor {
                text: "".into(),
                start: 0,
                end: 0,
                element_index: None
            }
        )
        .is_err());
    }

    #[test]
    fn migrates_types_and_saves_multiple_editable_notes_without_urls() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE items (id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO items(id,url,title) VALUES(7,'https://github.com/a/b','项目');").unwrap();
        initialize_database(&conn).unwrap();
        initialize_database(&conn).unwrap();
        for title in ["第一篇", "第二篇"] {
            create_note_article_in_db(
                &conn,
                NewNoteArticle {
                    title: title.into(),
                    summary: "简介".into(),
                    tags: vec!["学习".into()],
                    body: "# 独立正文\n内容".into(),
                },
            )
            .unwrap();
        }
        let all = search_items(&conn, "").unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!(
            all.iter().find(|i| i.id == 7).unwrap().content_type,
            content_kind::ContentKind::Repo
        );
        let note = all.iter().find(|i| i.title == "第一篇").unwrap();
        assert_eq!(note.content_type, content_kind::ContentKind::Note);
        assert_eq!(note.url, "");
        edit_item_in_db(
            &conn,
            EditItem {
                id: note.id,
                title: "改后".into(),
                summary: "".into(),
                tags: vec![],
                body: Some("更新后的正文".into()),
            },
        )
        .unwrap();
        assert_eq!(
            get_reader_item_in_db(&conn, note.id).unwrap().body,
            "更新后的正文"
        );
        assert_eq!(search_items(&conn, "更新后的正文").unwrap().len(), 1);
        assert_eq!(
            conn.query_row("SELECT count(*) FROM items WHERE url IS NULL", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
    }

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

    #[test]
    fn custom_tags_persist_and_manual_assignment_preserves_item() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        create_custom_tag_in_db(&conn, "  Rust  ").unwrap();
        create_custom_tag_in_db(&conn, "rust").unwrap();
        let count: i64 = conn
            .query_row("SELECT count(*) FROM custom_tags", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert!(create_custom_tag_in_db(&conn, " ").is_err());
        conn.execute("INSERT INTO items(id, url, title, body, archived) VALUES (1, 'https://example.com', '标题', '正文', 1)", []).unwrap();
        set_item_tags_in_db(
            &conn,
            1,
            vec![
                " Rust ".into(),
                "rust".into(),
                "学习".into(),
                "技术".into(),
                "设计".into(),
            ],
        )
        .unwrap();
        let items = search_items(&conn, "学习").unwrap();
        assert_eq!(items[0].tags, vec!["Rust", "学习", "技术", "设计"]);
        assert!(items[0].archived);
        let available = list_desktop_tags_in_db(&conn).unwrap();
        assert_eq!(
            available
                .iter()
                .filter(|tag| tag.eq_ignore_ascii_case("rust"))
                .count(),
            1
        );
        assert!(available.contains(&"学习".to_string()));
        conn.execute("DELETE FROM items WHERE id = 1", []).unwrap();
        assert!(list_desktop_tags_in_db(&conn)
            .unwrap()
            .contains(&"Rust".to_string()));
        assert!(set_item_tags_in_db(&conn, 99, vec![]).is_err());
    }

    #[test]
    fn deleting_tag_removes_all_bindings_without_changing_other_content() {
        let mut conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        create_custom_tag_in_db(&conn, "Rust").unwrap();
        conn.execute("INSERT INTO items (id, url, title, body, tags, archived) VALUES (1, 'https://a.example', '标题', '正文', ?1, 1), (2, 'https://b.example', '其他', '', ?2, 0)", params![r#"["Rust","学习"]"#, r#"["rust","工具"]"#]).unwrap();
        delete_desktop_tag_in_db(&mut conn, "RUST").unwrap();
        assert!(!list_desktop_tags_in_db(&conn)
            .unwrap()
            .iter()
            .any(|tag| tag.eq_ignore_ascii_case("rust")));
        let item = search_items(&conn, "标题").unwrap().remove(0);
        assert_eq!(item.tags, vec!["学习"]);
        assert!(item.archived);
        let body: String = conn
            .query_row("SELECT body FROM items WHERE id = 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(body, "正文");
        assert_eq!(search_items(&conn, "工具").unwrap()[0].tags, vec!["工具"]);
    }

    #[test]
    fn deleting_tag_rolls_back_if_any_item_update_fails() {
        let mut conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        create_custom_tag_in_db(&conn, "测试").unwrap();
        conn.execute("INSERT INTO items (id, url, title, tags) VALUES (1, 'https://a.example', '一', ?1), (2, 'https://b.example', '二', ?1)", [r#"["测试"]"#]).unwrap();
        conn.execute_batch("CREATE TRIGGER block_update BEFORE UPDATE ON items WHEN OLD.id = 2 BEGIN SELECT RAISE(ABORT, 'blocked'); END;").unwrap();
        assert!(delete_desktop_tag_in_db(&mut conn, "测试").is_err());
        assert_eq!(search_items(&conn, "测试").unwrap().len(), 2);
        assert!(list_desktop_tags_in_db(&conn)
            .unwrap()
            .contains(&"测试".to_string()));
    }

    #[test]
    fn saves_source_for_all_types_and_keeps_existing_item_state() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        for (url, expected_body) in [
            ("https://github.com/a/b", "正文"),
            ("https://www.youtube.com/watch?v=abc", "正文"),
            ("https://www.bilibili.com/video/BV123", "正文"),
            ("https://example.com/article", "正文"),
        ] {
            save_item_in_db(
                &conn,
                SaveItem {
                    url: url.into(),
                    title: "标题".into(),
                    summary: "摘要".into(),
                    tags: vec![],
                    body: Some("正文".into()),
                    source_note: None,
                    images: None,
                    source_incomplete: None,
                },
            )
            .unwrap();
            let body: String = conn
                .query_row("SELECT body FROM items WHERE url = ?1", [url], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(body, expected_body, "{url}");
        }
        conn.execute("UPDATE items SET archived=1, liked=1, body='旧正文' WHERE url='https://github.com/a/b'", []).unwrap();
        save_item_in_db(
            &conn,
            SaveItem {
                url: "https://github.com/a/b".into(),
                title: "新标题".into(),
                summary: "".into(),
                tags: vec![],
                body: Some(String::new()),
                source_note: Some("未获取到 README".into()),
                images: None,
                source_incomplete: None,
            },
        )
        .unwrap();
        let (body, archived, liked): (String, bool, bool) = conn
            .query_row(
                "SELECT body, archived, liked FROM items WHERE url='https://github.com/a/b'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!((body.as_str(), archived, liked), ("旧正文", true, true));
        let note: String = conn
            .query_row(
                "SELECT source_note FROM items WHERE url='https://github.com/a/b'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(note.is_empty());
    }

    #[test]
    fn keeps_source_warning_with_fallback_and_clears_it_after_full_content() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        let item = |body: &str, note: Option<&str>| SaveItem {
            url: "https://github.com/a/b".into(),
            title: "项目".into(),
            summary: String::new(),
            tags: vec![],
            body: Some(body.into()),
            source_note: note.map(str::to_string),
            images: None,
            source_incomplete: None,
        };
        save_item_in_db(&conn, item("公开简介", Some("README 不可用"))).unwrap();
        let saved: (String, String) = conn
            .query_row("SELECT body, source_note FROM items", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        assert_eq!(saved, ("公开简介".into(), "README 不可用".into()));
        save_item_in_db(&conn, item("# README", None)).unwrap();
        let saved: (String, String) = conn
            .query_row("SELECT body, source_note FROM items", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        assert_eq!(saved, ("# README".into(), String::new()));
        save_item_in_db(&conn, item("不完整简介", Some("README 不可用"))).unwrap();
        let saved: (String, String) = conn
            .query_row("SELECT body, source_note FROM items", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        assert_eq!(saved, ("# README".into(), String::new()));
        let mut complete = item("## 正文", Some("AI 格式校验失败，已保留本地转换结果"));
        complete.source_incomplete = Some(false);
        save_item_in_db(&conn, complete).unwrap();
        let body: String = conn
            .query_row("SELECT body FROM items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(body, "## 正文");
    }

    #[test]
    fn edits_metadata_without_replacing_original_or_reading_state() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        conn.execute("INSERT INTO items (id, url, title, summary, tags, body, source_note, archived, liked, created_at) VALUES (1, 'https://example.com/a', '旧标题', '旧简介', '[]', '原文', '原来源提示', 1, 1, '2020-01-01')", []).unwrap();
        edit_item_in_db(
            &conn,
            EditItem {
                id: 1,
                title: " 新标题 ".into(),
                summary: " 新简介 ".into(),
                tags: vec!["Rust".into(), "rust".into(), "学习".into()],
                body: None,
            },
        )
        .unwrap();
        let row: (String, String, String, String, String, bool, bool, String) = conn.query_row(
            "SELECT title, summary, tags, body, source_note, archived, liked, created_at FROM items WHERE id = 1", [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
        ).unwrap();
        assert_eq!(
            row,
            (
                "新标题".into(),
                "新简介".into(),
                r#"["Rust","学习"]"#.into(),
                "原文".into(),
                "原来源提示".into(),
                true,
                true,
                "2020-01-01".into()
            )
        );
        assert!(edit_item_in_db(
            &conn,
            EditItem {
                id: 1,
                title: " ".into(),
                summary: "".into(),
                tags: vec![],
                body: None,
            }
        )
        .is_err());
        assert_eq!(get_reader_item_in_db(&conn, 1).unwrap().title, "新标题");
    }

    #[test]
    fn empty_content_can_be_saved_and_read_without_network() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        save_item_in_db(
            &conn,
            SaveItem {
                url: "https://example.com/empty".into(),
                title: "手工标题".into(),
                summary: "".into(),
                tags: vec![],
                body: None,
                source_note: None,
                images: None,
                source_incomplete: None,
            },
        )
        .unwrap();
        let item = get_reader_item_in_db(&conn, 1).unwrap();
        assert_eq!(item.title, "手工标题");
        assert!(item.body.is_empty());
        assert!(get_reader_item_in_db(&conn, 999).is_err());
    }

    #[test]
    fn saves_images_atomically_with_their_markdown() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_database(&conn).unwrap();
        let image = assets::LocalImage {
            source: "pic.png".into(),
            mime: "image/png".into(),
            data: "iVBORw0KGgo=".into(),
        };
        let item = |body: &str, note: Option<&str>, images: Vec<assets::LocalImage>| SaveItem {
            url: "https://example.com/a".into(),
            title: "标题".into(),
            summary: "".into(),
            tags: vec![],
            body: Some(body.into()),
            source_note: note.map(str::to_string),
            images: Some(images),
            source_incomplete: None,
        };
        save_item_in_db(&conn, item("![图](pic.png)", None, vec![image.clone()])).unwrap();
        let saved = get_reader_item_in_db(&conn, 1).unwrap();
        assert_eq!(saved.body, "![图](pic.png)");
        assert_eq!(saved.images.len(), 1);
        assert_eq!(saved.images[0].data, image.data);
        save_item_in_db(&conn, item("不完整", Some("部分图片失败"), vec![])).unwrap();
        let saved = get_reader_item_in_db(&conn, 1).unwrap();
        assert_eq!(saved.body, "![图](pic.png)");
        assert_eq!(saved.images.len(), 1);
        let invalid = assets::LocalImage {
            source: "bad".into(),
            mime: "image/png".into(),
            data: "bm90LWltYWdl".into(),
        };
        assert!(save_item_in_db(&conn, item("新正文", None, vec![invalid])).is_err());
        assert_eq!(
            get_reader_item_in_db(&conn, 1).unwrap().body,
            "![图](pic.png)"
        );
        save_item_in_db(&conn, item("新正文", None, vec![])).unwrap();
        assert!(get_reader_item_in_db(&conn, 1).unwrap().images.is_empty());
    }
}
