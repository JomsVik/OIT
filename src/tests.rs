use super::*;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use tower::ServiceExt;

#[test]
fn receipt_discards_installation_fields_and_keyboard_layout_is_converted() {
    let (mut db, a) = setup();
    assert_eq!(stock::normalize_barcode("РЗ-85Ф"), "HP-85A");
    assert_eq!(stock::normalize_barcode("сфкекшвпу123"), "cartridge123");
    stock::handle(
        &mut db,
        "POST",
        &["api", "cartridges"],
        &json!({"barcode":"РЗ-85Ф","model":"HP"}),
        &a,
    )
    .unwrap();
    let m=stock::movement(&mut db,&json!({"barcode":"HP-85A","kind":"receipt","quantity":2,"destination":"Must not be stored","printer_id":999,"request_id":uuid::Uuid::new_v4().to_string()}),&a).unwrap();
    assert_eq!(m["movement"]["destination"], "");
    assert!(m["movement"]["printer_id"].is_null());
    stock::movement(&mut db,&json!({"barcode":"РЗ-85Ф","kind":"issue","destination":"204","request_id":uuid::Uuid::new_v4().to_string()}),&a).unwrap();
    assert_eq!(balance(&db), 1);
}

#[test]
fn deleting_cartridge_preserves_history_and_protects_stock() {
    let (mut db, a) = setup();
    let c = item(&mut db, &a);
    let cid = c["id"].to_string();
    stock::movement(&mut db, &movement("receipt", 1), &a).unwrap();
    assert_eq!(
        stock::handle(
            &mut db,
            "DELETE",
            &["api", "cartridges", &cid],
            &json!({}),
            &a
        )
        .unwrap_err()
        .status,
        409
    );
    stock::movement(&mut db, &movement("issue", 1), &a).unwrap();
    let mut ordinary = a.clone();
    ordinary.role = "admin".into();
    assert_eq!(
        stock::handle(
            &mut db,
            "DELETE",
            &["api", "cartridges", &cid],
            &json!({}),
            &ordinary
        )
        .unwrap_err()
        .status,
        403
    );
    stock::handle(
        &mut db,
        "DELETE",
        &["api", "cartridges", &cid],
        &json!({}),
        &a,
    )
    .unwrap();
    assert!(
        stock::handle(&mut db, "GET", &["api", "cartridges"], &json!({}), &a)
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        rows(&db, "SELECT * FROM cartridge_movements", &[])
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        stock::movement(&mut db, &movement("receipt", 1), &a)
            .unwrap_err()
            .status,
        404
    );
}

#[test]
fn completion_is_private_on_every_user_endpoint_and_never_a_comment() {
    let (mut db, a) = setup();
    let q = HashMap::new();
    db.execute(
        "INSERT INTO users(id,login_id,password_hash,full_name) VALUES(1,'u','x','User')",
        [],
    )
    .unwrap();
    let u = Actor {
        id: 1,
        kind: "users".into(),
        role: "user".into(),
        name: "User".into(),
    };
    let t = portal::handle(
        &mut db,
        "POST",
        &["api", "tickets"],
        &q,
        json!({"problem":"Test","employee":"U","location":"1"}),
        &u,
    )
    .unwrap();
    let tid = t["ticketId"].to_string();
    assert_eq!(
        portal::handle(
            &mut db,
            "PUT",
            &["api", "tickets", &tid, "complete"],
            &q,
            json!({}),
            &a
        )
        .unwrap_err()
        .status,
        400
    );
    portal::handle(
        &mut db,
        "POST",
        &["api", "tickets", &tid, "comments"],
        &q,
        json!({"comment_text":"Public reply","is_public":true}),
        &a,
    )
    .unwrap();
    portal::handle(
        &mut db,
        "PUT",
        &["api", "tickets", &tid, "complete"],
        &q,
        json!({"completion_details":"Private repair details"}),
        &a,
    )
    .unwrap();
    let admin = portal::handle(
        &mut db,
        "GET",
        &["api", "tickets"],
        &HashMap::from([("archived".into(), "true".into())]),
        json!({}),
        &a,
    )
    .unwrap();
    assert_eq!(admin[0]["completion_details"], "Private repair details");
    assert_eq!(admin[0]["comments"].as_array().unwrap().len(), 1);
    let list = portal::handle(
        &mut db,
        "GET",
        &["api", "tickets"],
        &HashMap::from([("archived".into(), "true".into())]),
        json!({}),
        &u,
    )
    .unwrap();
    let single = portal::handle(
        &mut db,
        "GET",
        &[
            "api",
            "ticket",
            "track",
            t["trackingToken"].as_str().unwrap(),
        ],
        &q,
        json!({}),
        &u,
    )
    .unwrap();
    let bulk = portal::handle(
        &mut db,
        "POST",
        &["api", "tickets", "track"],
        &q,
        json!({"tokens":[t["trackingToken"]]}),
        &u,
    )
    .unwrap();
    for record in [&list[0], &single, &bulk[0]] {
        assert!(record.get("completion_details").is_none());
        assert!(record.get("executor_name").is_none());
        assert!(!record.to_string().contains("Private repair details"));
    }
}

#[test]
fn monitor_inventory_roundtrip() {
    let (mut db, a) = setup();
    let q = HashMap::new();
    let m=portal::handle(&mut db,"POST",&["api","inventory","monitors"],&q,json!({"inventory_number":"MON-1","model":"Dell","diagonal":"24","resolution":"1920x1080","serial_number":"SN1"}),&a).unwrap();
    let mid = m["id"].to_string();
    portal::handle(
        &mut db,
        "PUT",
        &["api", "inventory", "monitors", &mid],
        &q,
        json!({"location":"204"}),
        &a,
    )
    .unwrap();
    let data = portal::handle(
        &mut db,
        "GET",
        &["api", "inventory", "monitors"],
        &q,
        json!({}),
        &a,
    )
    .unwrap();
    assert_eq!(data[0]["location"], "204");
    assert_eq!(data[0]["serial_number"], "SN1");
    portal::handle(
        &mut db,
        "DELETE",
        &["api", "inventory", "monitors", &mid],
        &q,
        json!({}),
        &a,
    )
    .unwrap();
}

#[test]
fn database_export_is_a_valid_snapshot_without_active_sessions() {
    let (mut db, a) = setup();
    item(&mut db, &a);
    db.execute(
        "INSERT INTO sessions VALUES (?,1,'admins',unixepoch()+3600)",
        [token_hash("export-test")],
    )
    .unwrap();
    let headers = HeaderMap::from_iter([(
        "cookie".parse().unwrap(),
        "oit_session=export-test".parse().unwrap(),
    )]);
    let bytes = export_database(&db, &headers).unwrap();
    assert!(bytes.starts_with(b"SQLite format 3\0"));
    let path =
        std::env::temp_dir().join(format!("oit-export-test-{}.sqlite3", uuid::Uuid::new_v4()));
    std::fs::write(&path, bytes).unwrap();
    let copy = Connection::open(&path).unwrap();
    assert_eq!(
        rows(&copy, "SELECT * FROM cartridges", &[]).unwrap().len(),
        1
    );
    assert!(
        rows(&copy, "SELECT * FROM sessions", &[])
            .unwrap()
            .is_empty()
    );
    drop(copy);
    std::fs::remove_file(path).unwrap();
    assert_eq!(rows(&db, "SELECT * FROM sessions", &[]).unwrap().len(), 1);
    db.execute("UPDATE admins SET role='admin' WHERE id=1", [])
        .unwrap();
    assert_eq!(export_database(&db, &headers).unwrap_err().status, 403);
}

#[test]
fn upgrade_moves_old_completion_comments_to_private_result() {
    let mut db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);")
        .unwrap();
    for (version, sql) in [
        (1, include_str!("../migrations/001_initial.sql")),
        (2, include_str!("../migrations/002_cartridges.sql")),
        (3, include_str!("../migrations/003_login_limits.sql")),
        (4, include_str!("../migrations/004_audit_snapshot.sql")),
    ] {
        db.execute_batch(sql).unwrap();
        db.execute("INSERT INTO schema_migrations VALUES(?)", [version])
            .unwrap();
    }
    db.execute("INSERT INTO admins(id,login_id,password_hash,full_name,role) VALUES(1,'d','x','Technician','director')",[]).unwrap();
    db.execute("INSERT INTO tickets(id,problem_desc,location,employee_info,tracking_token,status,executor_name,completed_at) VALUES(1,'p','l','u','token',1,'Technician','2026-11-23T10:00:01Z')",[]).unwrap();
    db.execute("INSERT INTO ticket_comments(ticket_id,admin_id,comment_text,is_public,created_at) VALUES(1,1,'Repair result',1,'2026-11-23T10:00:00Z')",[]).unwrap();
    initialize(&mut db).unwrap();
    assert_eq!(
        one(&db, "SELECT completion_details FROM tickets", &[]).unwrap()["completion_details"],
        "Repair result"
    );
    assert_eq!(
        one(&db, "SELECT is_public FROM ticket_comments", &[]).unwrap()["is_public"],
        false
    );
}

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
        5
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
    stock::movement(&mut db, &movement("receipt", 2), &a).unwrap();
    let mut b = movement("issue", 1);
    b["printer_id"] = json!(999);
    assert_eq!(stock::movement(&mut db, &b, &a).unwrap_err().status, 404);
    assert_eq!(balance(&db), 2);
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
