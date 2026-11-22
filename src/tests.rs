use super::*;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use tower::ServiceExt;

fn setup() -> (Connection, Actor) {
    let mut db = Connection::open_in_memory().unwrap();
    initialize(&mut db).unwrap();
    db.execute("INSERT INTO admins(id,login_id,password_hash,full_name,role) VALUES(1,'director','unused','Директор','director')",[]).unwrap();
    (
        db,
        Actor {
            id: 1,
            kind: "admins".into(),
            role: "director".into(),
            name: "Директор".into(),
        },
    )
}
fn item(db: &mut Connection, a: &Actor) -> Value {
    stock::handle(
        db,
        "POST",
        &["api", "cartridges"],
        &json!({"barcode":"000123","model":"HP 85A","min_stock":2}),
        a,
    )
    .unwrap()
}
fn movement(kind: &str, n: i64) -> Value {
    json!({"barcode":"000123","kind":kind,"quantity":n,"destination":"Бухгалтерия, 204","request_id":uuid::Uuid::new_v4().to_string()})
}
fn balance(db: &Connection) -> i64 {
    one(db, "SELECT stock FROM cartridges", &[]).unwrap()["stock"]
        .as_i64()
        .unwrap()
}

#[test]
fn migrations_are_repeatable() {
    let (mut db, _) = setup();
    initialize(&mut db).unwrap();
    assert_eq!(
        rows(&db, "SELECT * FROM schema_migrations", &[])
            .unwrap()
            .len(),
        4
    );
}
#[test]
fn receipt_issue_return_and_audit() {
    let (mut db, a) = setup();
    item(&mut db, &a);
    stock::movement(&mut db, &movement("receipt", 5), &a).unwrap();
    stock::movement(&mut db, &movement("issue", 1), &a).unwrap();
    stock::movement(&mut db, &movement("return", 1), &a).unwrap();
    assert_eq!(balance(&db), 5);
    let log = rows(&db, "SELECT * FROM cartridge_movements ORDER BY id", &[]).unwrap();
    assert_eq!(log.len(), 3);
    assert_eq!(log[1]["balance_after"], 4);
    assert_eq!(log[1]["admin_id"], 1);
}
#[test]
fn empty_stock_cannot_be_issued() {
    let (mut db, a) = setup();
    item(&mut db, &a);
    assert_eq!(
        stock::movement(&mut db, &movement("issue", 1), &a)
            .unwrap_err()
            .status,
        409
    );
    assert_eq!(balance(&db), 0);
    assert!(
        rows(&db, "SELECT * FROM cartridge_movements", &[])
            .unwrap()
            .is_empty()
    );
}
#[test]
fn repeated_request_does_not_change_stock() {
    let (mut db, a) = setup();
    item(&mut db, &a);
    let b = movement("receipt", 4);
    stock::movement(&mut db, &b, &a).unwrap();
    assert_eq!(stock::movement(&mut db, &b, &a).unwrap()["duplicate"], true);
    assert_eq!(balance(&db), 4);
    let mut other = b.clone();
    other["quantity"] = json!(8);
    assert_eq!(
        stock::movement(&mut db, &other, &a).unwrap_err().status,
        409
    );
}
#[test]
fn leading_zeroes_and_multiple_barcodes() {
    let (mut db, a) = setup();
    let c = item(&mut db, &a);
    stock::handle(
        &mut db,
        "POST",
        &["api", "cartridges", &c["id"].to_string(), "barcodes"],
        &json!({"barcode":"000999","batch_note":"Новая партия"}),
        &a,
    )
    .unwrap();
    let mut receipt = movement("receipt", 3);
    receipt["barcode"] = json!("000999");
    stock::movement(&mut db, &receipt, &a).unwrap();
    stock::movement(&mut db, &movement("issue", 1), &a).unwrap();
    assert_eq!(balance(&db), 2);
    assert_eq!(rows(&db, "SELECT * FROM cartridges", &[]).unwrap().len(), 1);
}
#[test]
fn unknown_barcode_and_invalid_quantities() {
    let (mut db, a) = setup();
    assert_eq!(
        stock::movement(&mut db, &movement("receipt", 3), &a)
            .unwrap_err()
            .status,
        404
    );
    item(&mut db, &a);
    for n in [0, -1, 1000001] {
        assert_eq!(
            stock::movement(&mut db, &movement("receipt", n), &a)
                .unwrap_err()
                .status,
            400
        );
    }
    assert_eq!(
        stock::movement(&mut db, &movement("issue", 2), &a)
            .unwrap_err()
            .status,
        400
    );
    let mut b = movement("receipt", 1);
    b["quantity"] = json!(1.5);
    assert_eq!(stock::movement(&mut db, &b, &a).unwrap_err().status, 400);
}
#[test]
fn issue_requires_destination() {
    let (mut db, a) = setup();
    item(&mut db, &a);
    stock::movement(&mut db, &movement("receipt", 2), &a).unwrap();
    let mut b = movement("issue", 1);
    b["destination"] = json!("  ");
    assert_eq!(stock::movement(&mut db, &b, &a).unwrap_err().status, 400);
    assert_eq!(balance(&db), 2);
}
#[test]
fn invalid_printer_rolls_back() {
    let (mut db, a) = setup();
    item(&mut db, &a);
    let mut b = movement("receipt", 2);
    b["printer_id"] = json!(999);
    assert_eq!(stock::movement(&mut db, &b, &a).unwrap_err().status, 404);
    assert_eq!(balance(&db), 0);
}
#[test]
fn history_is_immutable() {
    let (mut db, a) = setup();
    item(&mut db, &a);
    stock::movement(&mut db, &movement("receipt", 1), &a).unwrap();
    assert!(db.execute("DELETE FROM cartridge_movements", []).is_err());
    assert!(
        db.execute("UPDATE cartridge_movements SET quantity=9", [])
            .is_err()
    );
}
#[test]
fn concurrent_issue_of_last_item() {
    let path = std::env::temp_dir().join(format!("oit-test-{}.sqlite3", uuid::Uuid::new_v4()));
    let mut db = Connection::open(&path).unwrap();
    initialize(&mut db).unwrap();
    db.execute("INSERT INTO admins(id,login_id,password_hash,full_name,role) VALUES(1,'a','x','A','admin')",[]).unwrap();
    let a = Actor {
        id: 1,
        kind: "admins".into(),
        role: "admin".into(),
        name: "A".into(),
    };
    item(&mut db, &a);
    stock::movement(&mut db, &movement("receipt", 1), &a).unwrap();
    let barrier = Arc::new(std::sync::Barrier::new(2));
    let handles: Vec<_> = (0..2)
        .map(|_| {
            let path = path.clone();
            let a = a.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut conn = Connection::open(path).unwrap();
                conn.busy_timeout(std::time::Duration::from_secs(5))
                    .unwrap();
                conn.execute_batch("PRAGMA foreign_keys=ON").unwrap();
                barrier.wait();
                stock::movement(&mut conn, &movement("issue", 1), &a).is_ok()
            })
        })
        .collect();
    let successes = handles
        .into_iter()
        .map(|h| h.join().unwrap())
        .filter(|b| *b)
        .count();
    assert_eq!(successes, 1);
    assert_eq!(balance(&db), 0);
    drop(db);
    let _ = std::fs::remove_file(path);
}
#[test]
fn backup_restores_balances_and_history() {
    let (mut db, a) = setup();
    item(&mut db, &a);
    stock::movement(&mut db, &movement("receipt", 6), &a).unwrap();
    let path = std::env::temp_dir().join(format!("oit-backup-{}.sqlite3", uuid::Uuid::new_v4()));
    db.backup("main", &path, None).unwrap();
    let restored = Connection::open(&path).unwrap();
    assert_eq!(balance(&restored), 6);
    assert_eq!(
        rows(&restored, "SELECT * FROM cartridge_movements", &[])
            .unwrap()
            .len(),
        1
    );
    drop(restored);
    std::fs::remove_file(path).unwrap();
}
#[test]
fn portal_workflow_preserves_original_sections() {
    let (mut db, a) = setup();
    let q = HashMap::new();
    let ticket = portal::handle(
        &mut db,
        "POST",
        &["api", "tickets"],
        &q,
        json!({"problem":"Нет печати","location":"204","employee":"Иванов"}),
        &a,
    )
    .unwrap();
    let tid = ticket["ticketId"].to_string();
    portal::handle(
        &mut db,
        "POST",
        &["api", "tickets", &tid, "comments"],
        &q,
        json!({"comment_text":"Проверено","is_public":false}),
        &a,
    )
    .unwrap();
    let task = portal::handle(
        &mut db,
        "POST",
        &["api", "tasks"],
        &q,
        json!({"title":"Заменить картридж","assigned_to":1}),
        &a,
    )
    .unwrap();
    portal::handle(
        &mut db,
        "PUT",
        &["api", "tasks", &task["task"]["id"].to_string(), "status"],
        &q,
        json!({"status":"completed"}),
        &a,
    )
    .unwrap();
    assert_eq!(
        portal::handle(
            &mut db,
            "GET",
            &["api", "tasks", "archive"],
            &q,
            json!({}),
            &a
        )
        .unwrap()
        .as_array()
        .unwrap()
        .len(),
        1
    );
    let report = portal::handle(
        &mut db,
        "POST",
        &["api", "reports"],
        &q,
        json!({"title":"Сводка","report_data":{"total":1}}),
        &a,
    )
    .unwrap();
    assert_eq!(report["report"]["title"], "Сводка");
    for typ in ["computers", "laptops", "printers"] {
        portal::handle(
            &mut db,
            "POST",
            &["api", "inventory", typ],
            &q,
            json!({"inventory_number":"N001"}),
            &a,
        )
        .unwrap();
    }
    let sw = portal::handle(
        &mut db,
        "POST",
        &["api", "switches"],
        &q,
        json!({"inventory_number":"SW01","ports_count":24}),
        &a,
    )
    .unwrap();
    portal::handle(
        &mut db,
        "POST",
        &["api", "switches", &sw["switch"]["id"].to_string(), "ports"],
        &q,
        json!({"port_number":1}),
        &a,
    )
    .unwrap();
    let switches = portal::handle(&mut db, "GET", &["api", "switches"], &q, json!({}), &a).unwrap();
    assert_eq!(switches[0]["ports"][0]["port_number"], 1);
}
#[test]
fn users_cannot_see_internal_comments_or_others_tickets() {
    let (mut db, a) = setup();
    db.execute(
        "INSERT INTO users(id,login_id,password_hash,full_name) VALUES(1,'user','x','User')",
        [],
    )
    .unwrap();
    let u = Actor {
        id: 1,
        kind: "users".into(),
        role: "user".into(),
        name: "User".into(),
    };
    let q = HashMap::new();
    let t = portal::handle(
        &mut db,
        "POST",
        &["api", "tickets"],
        &q,
        json!({"problem":"Test","employee":"U","location":"1"}),
        &u,
    )
    .unwrap();
    portal::handle(
        &mut db,
        "POST",
        &["api", "tickets", &t["ticketId"].to_string(), "comments"],
        &q,
        json!({"comment_text":"Internal","is_public":false}),
        &a,
    )
    .unwrap();
    let data = portal::handle(&mut db, "GET", &["api", "tickets"], &q, json!({}), &u).unwrap();
    assert!(data[0]["comments"].as_array().unwrap().is_empty());
    assert!(
        portal::handle(
            &mut db,
            "GET",
            &["api", "inventory", "printers"],
            &q,
            json!({}),
            &u
        )
        .is_err()
    );
}

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    body: Value,
    cookie: Option<&str>,
) -> (StatusCode, Value, HeaderMap) {
    let mut r = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if let Some(c) = cookie {
        r = r.header("cookie", c);
    }
    let response = app
        .clone()
        .oneshot(r.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        headers,
    )
}
#[tokio::test]
async fn authentication_roles_logout_and_password_redaction() {
    let (db, _) = setup();
    let hash = bcrypt::hash("test-password-123", 4).unwrap();
    db.execute("UPDATE admins SET password_hash=?", [&hash])
        .unwrap();
    db.execute(
        "INSERT INTO users(login_id,password_hash,full_name) VALUES('user',?,'Пользователь')",
        [&hash],
    )
    .unwrap();
    let app = router(App {
        db: Arc::new(Mutex::new(db)),
        secure_cookie: false,
    });
    assert_eq!(
        call(&app, "GET", "/api/cartridges", json!({}), None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let (s, user, h) = call(
        &app,
        "POST",
        "/api/users/login",
        json!({"login_id":"user","password":"test-password-123"}),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert!(user.get("password_hash").is_none());
    let cookie = h["set-cookie"].to_str().unwrap().split(';').next().unwrap();
    assert_eq!(
        call(&app, "GET", "/api/cartridges", json!({}), Some(cookie))
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/users/create",
            json!({"created_by":1}),
            Some(cookie)
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (s, _, h) = call(
        &app,
        "POST",
        "/api/admins/login",
        json!({"login_id":"director","password":"test-password-123"}),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let cookie = h["set-cookie"].to_str().unwrap().split(';').next().unwrap();
    let (s, data, _) = call(&app, "GET", "/api/users/all", json!({}), Some(cookie)).await;
    assert_eq!(s, StatusCode::OK);
    assert!(data[0].get("password_hash").is_none());
    assert_eq!(
        call(
            &app,
            "DELETE",
            "/api/admins/1?admin_role=director",
            json!({}),
            Some(cookie)
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    call(&app, "POST", "/api/logout", json!({}), Some(cookie)).await;
    assert_eq!(
        call(&app, "GET", "/api/me", json!({}), Some(cookie))
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
#[tokio::test]
async fn csrf_and_static_file_boundaries() {
    let (db, _) = setup();
    let app = router(App {
        db: Arc::new(Mutex::new(db)),
        secure_cookie: true,
    });
    let request = Request::builder()
        .method("POST")
        .uri("/api/logout")
        .header("origin", "https://evil.test")
        .header("host", "portal.test")
        .header("content-type", "application/json")
        .body(Body::from("{}"))
        .unwrap();
    assert_eq!(
        app.clone().oneshot(request).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    for path in ["/.env", "/data/oit.sqlite3", "/legacy/server.js"] {
        assert_eq!(
            call(&app, "GET", path, json!({}), None).await.0,
            StatusCode::NOT_FOUND
        );
    }
}
