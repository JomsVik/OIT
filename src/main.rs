mod db;
mod portal;
mod stock;

use axum::{
    Json, Router,
    body::Bytes,
    extract::{OriginalUri, State},
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
};
use db::*;
use rusqlite::Connection;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[derive(Debug)]
pub struct Error {
    status: u16,
    message: String,
}
pub type Result<T> = std::result::Result<T, Error>;
impl Error {
    pub fn new(status: u16, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}
impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        eprintln!("Database: {e}");
        if let rusqlite::Error::SqliteFailure(ref code, _) = e {
            if code.code == rusqlite::ErrorCode::ConstraintViolation {
                return Self::new(
                    409,
                    "Конфликт данных: проверьте уникальность, связи и допустимые значения",
                );
            }
        }
        Self::new(500, "Ошибка базы данных; подробности в журнале сервера")
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (
            StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            Json(json!({"error":self.message})),
        )
            .into_response()
    }
}
#[derive(Clone)]
struct App {
    db: Arc<Mutex<Connection>>,
    secure_cookie: bool,
}
#[derive(Clone)]
pub struct Actor {
    id: i64,
    kind: String,
    role: String,
    name: String,
}
impl Actor {
    fn admin(&self) -> Result<()> {
        if self.kind == "admins" {
            Ok(())
        } else {
            Err(Error::new(403, "Нужны права администратора"))
        }
    }
    fn manager(&self) -> Result<()> {
        self.admin()?;
        if ["director", "super_admin"].contains(&self.role.as_str()) {
            Ok(())
        } else {
            Err(Error::new(403, "Нужны права руководителя"))
        }
    }
    fn director(&self) -> Result<()> {
        self.admin()?;
        if self.role == "director" {
            Ok(())
        } else {
            Err(Error::new(403, "Нужны права директора"))
        }
    }
}
fn token_hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
fn required(b: &Value, key: &str) -> Result<String> {
    let s = b[key].as_str().unwrap_or("").trim();
    if s.is_empty() || s.len() > 10000 {
        Err(Error::new(
            400,
            format!("Заполните поле {key} (до 10000 байт)"),
        ))
    } else {
        Ok(s.to_string())
    }
}
fn id(s: &str) -> Result<i64> {
    s.parse::<i64>()
        .ok()
        .filter(|n| *n > 0)
        .ok_or_else(|| Error::new(400, "Неверный идентификатор"))
}
fn password(b: &Value) -> Result<String> {
    let s = b["password"].as_str().unwrap_or("");
    if !(12..=72).contains(&s.len()) {
        return Err(Error::new(400, "Пароль должен содержать от 12 до 72 байт"));
    }
    bcrypt::hash(s, 12).map_err(|_| Error::new(500, "Ошибка хеширования"))
}
fn actor(db: &Connection, headers: &HeaderMap) -> Result<Actor> {
    let cookie = headers
        .get("cookie")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    let token = cookie
        .split(';')
        .find_map(|v| v.trim().strip_prefix("oit_session="))
        .unwrap_or("");
    let session = one(
        db,
        "SELECT * FROM sessions WHERE token_hash=? AND expires_at>unixepoch()",
        &[json!(token_hash(token))],
    )
    .map_err(|_| Error::new(401, "Войдите в систему"))?;
    let kind = session["account_type"].as_str().unwrap_or("");
    if !["admins", "users"].contains(&kind) {
        return Err(Error::new(401, "Сессия недействительна"));
    }
    let account = one(
        db,
        &format!("SELECT * FROM {kind} WHERE id=?"),
        &[session["account_id"].clone()],
    )
    .map_err(|_| Error::new(401, "Учётная запись недоступна"))?;
    Ok(Actor {
        id: account["id"].as_i64().unwrap(),
        kind: kind.into(),
        role: account["role"].as_str().unwrap_or("user").into(),
        name: account["full_name"].as_str().unwrap_or("").into(),
    })
}
fn public_account(mut v: Value) -> Value {
    if let Some(o) = v.as_object_mut() {
        o.remove("password_hash");
    }
    v
}

fn dispatch(
    db: &mut Connection,
    method: &str,
    path: &str,
    q: &HashMap<String, String>,
    headers: &HeaderMap,
    mut b: Value,
) -> Result<(Value, Option<String>)> {
    let p: Vec<&str> = path.trim_matches('/').split('/').collect();
    let ok = |v| Ok((v, None));
    if path == "/api/health" && method == "GET" {
        db.query_row("SELECT 1", [], |r| r.get::<_, i64>(0))?;
        return ok(json!({"status":"ok","version":env!("CARGO_PKG_VERSION")}));
    }
    if p.len() == 3 && ["admins", "users"].contains(&p[1]) && p[2] == "login" && method == "POST" {
        let login = required(&b, "login_id")?;
        let login_key = token_hash(&format!("{}:{login}", p[1]));
        db.execute(
            "DELETE FROM login_attempts WHERE window_start<unixepoch()-900",
            [],
        )?;
        let attempts = db.query_row(
            "SELECT coalesce(sum(attempts),0) FROM login_attempts WHERE login_hash=?",
            [&login_key],
            |r| r.get::<_, i64>(0),
        )?;
        if attempts >= 10 {
            return Err(Error::new(
                429,
                "Слишком много попыток входа. Повторите через 15 минут",
            ));
        }
        let pass = b["password"].as_str().unwrap_or("");
        if pass.len() > 72 {
            return Err(Error::new(401, "Неверный логин или пароль"));
        }
        // Always verify a hash, including for unknown accounts, to reduce login enumeration.
        let account = one(
            db,
            &format!("SELECT * FROM {} WHERE login_id=?", p[1]),
            &[json!(login)],
        )
        .ok();
        let dummy = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5D7YbTY5x0NfG0.V6bJHnk1hOeHr0XK";
        let hash = account
            .as_ref()
            .and_then(|v| v["password_hash"].as_str())
            .unwrap_or(dummy);
        let valid = bcrypt::verify(pass, hash).unwrap_or(false);
        if !valid || account.is_none() || login.starts_with("DELETED_") {
            db.execute("INSERT INTO login_attempts VALUES (?,1,unixepoch()) ON CONFLICT(login_hash) DO UPDATE SET attempts=attempts+1",[&login_key])?;
            return Err(Error::new(401, "Неверный логин или пароль"));
        }
        db.execute("DELETE FROM login_attempts WHERE login_hash=?", [login_key])?;
        let account = account.unwrap();
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        db.execute("DELETE FROM sessions WHERE expires_at<=unixepoch()", [])?;
        db.execute(
            "INSERT INTO sessions VALUES (?,?,?,unixepoch()+28800)",
            rusqlite::params![token_hash(&token), account["id"].as_i64(), p[1]],
        )?;
        let mut v = public_account(account);
        v["success"] = json!(true);
        return Ok((
            v,
            Some(format!(
                "oit_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800"
            )),
        ));
    }
    if path == "/api/logout" && method == "POST" {
        if let Some(c) = headers
            .get("cookie")
            .and_then(|v| v.to_str().ok())
            .and_then(|c| {
                c.split(';')
                    .find_map(|v| v.trim().strip_prefix("oit_session="))
            })
        {
            db.execute("DELETE FROM sessions WHERE token_hash=?", [token_hash(c)])?;
        }
        return Ok((
            json!({"success":true}),
            Some("oit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0".into()),
        ));
    }
    let a = actor(db, headers)?;
    if path == "/api/me" && method == "GET" {
        return ok(json!({"id":a.id,"kind":a.kind,"role":a.role,"full_name":a.name}));
    }
    if p.get(1) == Some(&"cartridges") {
        a.admin()?;
        return ok(stock::handle(db, method, &p, &b, &a)?);
    }
    if p.len() >= 2 && ["admins", "users"].contains(&p[1]) {
        let table = p[1];
        if method == "GET" && (p.len() == 2 || p.get(2) == Some(&"all")) {
            a.admin()?;
            if table == "users" || p.get(2) == Some(&"all") {
                a.director()?;
            }
            let data = rows(
                db,
                &format!(
                    "SELECT t.*,a.full_name AS created_by_name FROM {table} t LEFT JOIN admins a ON t.created_by=a.id ORDER BY t.id"
                ),
                &[],
            )?;
            return ok(json!(
                data.into_iter().map(public_account).collect::<Vec<_>>()
            ));
        }
        a.director()?;
        if method == "POST" && p.get(2) == Some(&"create") {
            required(&b, "login_id")?;
            required(&b, "full_name")?;
            b["password_hash"] = json!(password(&b)?);
            b["created_by"] = json!(a.id);
            if table == "admins" && b.get("role").is_none() {
                b["role"] = json!("admin");
            }
            let v = public_account(insert(
                db,
                table,
                &[
                    "login_id",
                    "password_hash",
                    "full_name",
                    "role",
                    "phone_number",
                    "color_theme",
                    "department",
                    "position",
                    "created_by",
                ]
                .into_iter()
                .filter(|f| {
                    if table == "users" {
                        !["role", "phone_number", "color_theme"].contains(f)
                    } else {
                        !["department", "position"].contains(f)
                    }
                })
                .collect::<Vec<_>>(),
                &b,
            )?);
            return ok(if table == "admins" {
                json!({"success":true,"admin":v})
            } else {
                json!({"success":true,"user":v})
            });
        }
        let target = id(p.get(2).unwrap_or(&""))?;
        let current = one(
            db,
            &format!("SELECT * FROM {table} WHERE id=?"),
            &[json!(target)],
        )?;
        if table == "admins"
            && current["role"] == "director"
            && (method == "DELETE" || (b.get("role").is_some() && b["role"] != "director"))
        {
            let n = db.query_row(
                "SELECT count(*) FROM admins WHERE role='director'",
                [],
                |r| r.get::<_, i64>(0),
            )?;
            if n <= 1 {
                return Err(Error::new(
                    409,
                    "Нельзя удалить или понизить последнего директора",
                ));
            }
        }
        if method == "DELETE" {
            if table == "admins" && target == a.id {
                return Err(Error::new(400, "Нельзя удалить самого себя"));
            }
            db.execute(&format!("DELETE FROM {table} WHERE id=?"), [target])?;
        } else if method == "PUT" {
            if p.get(3) == Some(&"password") {
                b["password_hash"] = json!(password(&b)?);
                update(db, table, &["password_hash"], target, &b)?;
            } else {
                let fields = if table == "admins" {
                    vec!["full_name", "role", "phone_number", "color_theme"]
                } else {
                    vec!["full_name", "department", "position"]
                };
                if b.get("full_name").is_some() {
                    required(&b, "full_name")?;
                }
                update(db, table, &fields, target, &b)?;
            }
        } else {
            return Err(Error::new(405, "Метод не поддерживается"));
        }
        db.execute(
            "DELETE FROM sessions WHERE account_type=? AND account_id=?",
            rusqlite::params![table, target],
        )?;
        return ok(json!({"success":true}));
    }
    ok(portal::handle(db, method, &p, q, b, &a)?)
}

async fn api(
    State(app): State<App>,
    method: Method,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if method != Method::GET && method != Method::HEAD {
        if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
            let host = headers
                .get("host")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if origin != format!("http://{host}") && origin != format!("https://{host}") {
                return Error::new(403, "Запрос с другого сайта запрещён").into_response();
            }
        }
        if !body.is_empty()
            && !headers
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .starts_with("application/json")
        {
            return Error::new(415, "Ожидается application/json").into_response();
        }
    }
    let b = if body.is_empty() {
        json!({})
    } else {
        match serde_json::from_slice::<Value>(&body) {
            Ok(v) if v.is_object() => v,
            _ => return Error::new(400, "Некорректный JSON").into_response(),
        }
    };
    let q: HashMap<String, String> = match serde_urlencoded::from_str(uri.query().unwrap_or("")) {
        Ok(v) => v,
        Err(_) => return Error::new(400, "Неверные параметры запроса").into_response(),
    };
    let secure = app.secure_cookie;
    let result = tokio::task::spawn_blocking(move || {
        let mut db = app
            .db
            .lock()
            .map_err(|_| Error::new(500, "База недоступна"))?;
        dispatch(&mut db, method.as_str(), uri.path(), &q, &headers, b)
    })
    .await;
    let mut response = match result {
        Ok(Ok((v, cookie))) => {
            let mut r = Json(v).into_response();
            if let Some(mut c) = cookie {
                if secure {
                    c.push_str("; Secure");
                }
                r.headers_mut().insert("set-cookie", c.parse().unwrap());
            }
            r
        }
        Ok(Err(e)) => e.into_response(),
        Err(e) => {
            eprintln!("Worker: {e}");
            Error::new(500, "Внутренняя ошибка").into_response()
        }
    };
    response
        .headers_mut()
        .insert("cache-control", "no-store".parse().unwrap());
    response
        .headers_mut()
        .insert("x-content-type-options", "nosniff".parse().unwrap());
    response
}
async fn assets(OriginalUri(uri): OriginalUri) -> Response {
    let (content, kind) = match uri.path() {
        "/" | "/index.html" => (include_str!("../index.html"), "text/html; charset=utf-8"),
        "/style.css" => (include_str!("../style.css"), "text/css; charset=utf-8"),
        "/app.js" => (include_str!("../app.js"), "text/javascript; charset=utf-8"),
        "/cartridges.js" => (
            include_str!("../cartridges.js"),
            "text/javascript; charset=utf-8",
        ),
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    (
        [
            ("content-type", kind),
            ("x-content-type-options", "nosniff"),
            ("x-frame-options", "DENY"),
            ("referrer-policy", "same-origin"),
        ],
        content,
    )
        .into_response()
}
fn router(app: App) -> Router {
    Router::new()
        .route("/api/{*path}", any(api))
        .fallback(assets)
        .layer(axum::extract::DefaultBodyLimit::max(256 * 1024))
        .with_state(app)
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "data/oit.sqlite3".into());
    if std::env::args().nth(1).as_deref() == Some("backup")
        && !std::path::Path::new(&path).is_file()
    {
        return Err("База для резервного копирования не найдена; проверьте DATABASE_PATH".into());
    }
    if let Some(parent) = std::path::Path::new(&path)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }
    let mut db = Connection::open(&path)?;
    initialize(&mut db).map_err(|e| e.message)?;
    if std::env::args().nth(1).as_deref() == Some("backup") {
        let dest = std::env::args()
            .nth(2)
            .ok_or("Укажите путь: oit-portal backup backups/oit.sqlite3")?;
        if std::path::Path::new(&dest).exists() {
            return Err("Файл резервной копии уже существует".into());
        }
        db.backup("main", &dest, None)?;
        println!("Backup saved: {dest}");
        return Ok(());
    }
    let count = db.query_row("SELECT count(*) FROM admins", [], |r| r.get::<_, i64>(0))?;
    if count == 0 {
        let login = std::env::var("BOOTSTRAP_LOGIN").unwrap_or_else(|_| "director".into());
        let pass = std::env::var("BOOTSTRAP_PASSWORD")
            .map_err(|_| "Задайте BOOTSTRAP_PASSWORD (12–72 байта) для первого запуска")?;
        let hash = password(&json!({"password":pass})).map_err(|e| e.message)?;
        db.execute(
            "INSERT INTO admins(login_id,password_hash,full_name,role) VALUES (?,?,?,'director')",
            rusqlite::params![login, hash, "Директор"],
        )?;
    }
    let address = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let app = App {
        db: Arc::new(Mutex::new(db)),
        secure_cookie: std::env::var("COOKIE_SECURE").as_deref() == Ok("true"),
    };
    let listener = tokio::net::TcpListener::bind(&address).await?;
    println!("IT Portal: http://{address}");
    axum::serve(listener, router(app))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests;
