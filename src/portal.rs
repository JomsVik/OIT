use crate::{db::*, *};

fn comments(
    db: &Connection,
    table: &str,
    parent: &str,
    target: &Value,
    admin: bool,
) -> Result<Vec<Value>> {
    rows(
        db,
        &format!(
            "SELECT c.*,a.full_name AS admin_name,a.role AS admin_role,u.full_name AS user_name FROM {table} c LEFT JOIN admins a ON a.id=c.admin_id LEFT JOIN users u ON u.id=c.user_id WHERE c.{parent}=? {} ORDER BY c.id",
            if table == "ticket_comments" && !admin {
                "AND c.is_public=1"
            } else {
                ""
            }
        ),
        &[target.clone()],
    )
}
fn tickets(db: &Connection, filter: &str, args: &[Value], admin: bool) -> Result<Vec<Value>> {
    let mut data = rows(
        db,
        &format!(
            "SELECT *,CASE WHEN (julianday('now')-julianday(created_at))*24>=24 THEN 'ticket-urgent-24h' WHEN (julianday('now')-julianday(created_at))*24>=6 THEN 'ticket-urgent-6h' WHEN (julianday('now')-julianday(created_at))*24>=3 THEN 'ticket-warning-3h' WHEN (julianday('now')-julianday(created_at))*24>=1 THEN 'ticket-warning-1h' ELSE 'ticket-normal' END AS current_color FROM tickets WHERE {filter} ORDER BY created_at DESC"
        ),
        args,
    )?;
    for t in &mut data {
        if t["status"] != true || t["color_class"].is_null() {
            t["color_class"] = t["current_color"].clone();
        }
        t["comments"] = json!(comments(
            db,
            "ticket_comments",
            "ticket_id",
            &t["id"],
            admin
        )?);
        t.as_object_mut().unwrap().remove("current_color");
    }
    Ok(data)
}
const TASK_QUERY: &str = "SELECT t.*,a.full_name AS assigned_to_name,a.role AS assigned_to_role,b.full_name AS created_by_name,b.role AS created_by_role,c.full_name AS completed_by_name FROM tasks t LEFT JOIN admins a ON a.id=t.assigned_to LEFT JOIN admins b ON b.id=t.created_by LEFT JOIN admins c ON c.id=t.completed_by";
pub fn handle(
    db: &mut Connection,
    m: &str,
    p: &[&str],
    q: &HashMap<String, String>,
    mut b: Value,
    a: &Actor,
) -> Result<Value> {
    let ok = json!({"success":true});
    if p.get(1) == Some(&"phones") && m == "GET" {
        return Ok(json!(
            rows(
                db,
                "SELECT phone_number FROM admins WHERE phone_number IS NOT NULL",
                &[]
            )?
            .iter()
            .map(|v| v["phone_number"].clone())
            .collect::<Vec<_>>()
        ));
    }
    if p.get(1) == Some(&"ticket") && p.get(2) == Some(&"track") && m == "GET" {
        return tickets(
            db,
            "tracking_token=?",
            &[json!(p.get(3).unwrap_or(&""))],
            false,
        )?
        .into_iter()
        .next()
        .ok_or_else(|| Error::new(404, "Заявка не найдена"));
    }
    if p.get(1) == Some(&"tickets") {
        if p.get(2) == Some(&"track") && m == "POST" {
            let tokens = b["tokens"]
                .as_array()
                .ok_or_else(|| Error::new(400, "Ожидается список tokens"))?;
            if tokens.len() > 100 {
                return Err(Error::new(400, "Не больше 100 кодов за запрос"));
            }
            if tokens.is_empty() {
                return Ok(json!([]));
            }
            return Ok(json!(tickets(
                db,
                &format!("tracking_token IN ({})", vec!["?"; tokens.len()].join(",")),
                tokens,
                false
            )?));
        }
        if p.len() == 2 && m == "GET" {
            let archived = q.get("archived").map(|s| s == "true").unwrap_or(false);
            let data = if a.kind == "admins" {
                tickets(db, "status=?", &[json!(archived)], true)?
            } else {
                tickets(
                    db,
                    "status=? AND user_id=?",
                    &[json!(archived), json!(a.id)],
                    false,
                )?
            };
            return Ok(json!(data));
        }
        if p.len() == 2 && m == "POST" {
            b["problem_desc"] = json!(required(&b, "problem")?);
            b["employee_info"] = json!(required(&b, "employee")?);
            required(&b, "location")?;
            b["tracking_token"] = json!(uuid::Uuid::new_v4().simple().to_string());
            b["user_id"] = if a.kind == "users" {
                json!(a.id)
            } else {
                Value::Null
            };
            let t = insert(
                db,
                "tickets",
                &[
                    "problem_desc",
                    "location",
                    "employee_info",
                    "comment",
                    "urgency",
                    "tracking_token",
                    "user_id",
                ],
                &b,
            )?;
            return Ok(
                json!({"success":true,"ticketId":t["id"],"trackingToken":t["tracking_token"],"color":"ticket-normal"}),
            );
        }
        let target = id(p.get(2).unwrap_or(&""))?;
        let t = one(db, "SELECT * FROM tickets WHERE id=?", &[json!(target)])?;
        if p.get(3) == Some(&"comments") && m == "POST" {
            if a.kind != "admins" && t["user_id"] != a.id {
                return Err(Error::new(403, "Нет доступа к заявке"));
            }
            b["comment_text"] = json!(required(&b, "comment_text")?);
            b["ticket_id"] = json!(target);
            b["admin_id"] = if a.kind == "admins" {
                json!(a.id)
            } else {
                Value::Null
            };
            b["user_id"] = if a.kind == "users" {
                json!(a.id)
            } else {
                Value::Null
            };
            if a.kind != "admins" || b.get("is_public").is_none() {
                b["is_public"] = json!(true);
            }
            let c = insert(
                db,
                "ticket_comments",
                &[
                    "ticket_id",
                    "comment_text",
                    "admin_id",
                    "user_id",
                    "is_public",
                ],
                &b,
            )?;
            return Ok(json!({"success":true,"commentId":c["id"]}));
        }
        a.admin()?;
        if p.get(3) == Some(&"complete") && m == "PUT" {
            if t["status"] == true {
                return Err(Error::new(409, "Заявка уже выполнена"));
            }
            let color = tickets(db, "id=?", &[json!(target)], true)?[0]["color_class"].clone();
            db.execute("UPDATE tickets SET status=1,executor_name=?,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),color_class=? WHERE id=?",rusqlite::params![a.name,color.as_str(),target])?;
            return Ok(json!({"success":true,"color":color}));
        }
        if p.get(3) == Some(&"restore") && m == "PUT" {
            db.execute(
                "UPDATE tickets SET status=0,completed_at=NULL,executor_name=NULL WHERE id=?",
                [target],
            )?;
            return Ok(
                json!({"success":true,"ticket":tickets(db,"id=?",&[json!(target)],true)?[0]}),
            );
        }
        if p.len() == 3 && m == "DELETE" {
            a.manager()?;
            db.execute("DELETE FROM tickets WHERE id=?", [target])?;
            return Ok(ok);
        }
    }
    a.admin()?;
    if p.get(1) == Some(&"tasks") {
        if m == "GET" && (p.len() == 2 || p.get(2) == Some(&"archive")) {
            let cond = if p.len() == 2 {
                "t.status<>'completed'"
            } else {
                "t.status='completed'"
            };
            return Ok(json!(rows(
                db,
                &format!("{TASK_QUERY} WHERE {cond} ORDER BY t.created_at DESC"),
                &[]
            )?));
        }
        if m == "POST" && p.len() == 2 {
            required(&b, "title")?;
            b["created_by"] = json!(a.id);
            normalize_task(&mut b);
            return Ok(
                json!({"success":true,"task":insert(db,"tasks",&["title","description","assigned_to","created_by","priority","due_date"],&b)?}),
            );
        }
        let target = id(p.get(2).unwrap_or(&""))?;
        let task = one(db, "SELECT * FROM tasks WHERE id=?", &[json!(target)])?;
        if p.get(3) == Some(&"comments") {
            if m == "GET" {
                return Ok(json!(comments(
                    db,
                    "task_comments",
                    "task_id",
                    &json!(target),
                    true
                )?));
            }
            if m == "POST" {
                b["comment_text"] = json!(required(&b, "comment_text")?);
                b["task_id"] = json!(target);
                b["admin_id"] = json!(a.id);
                let c = insert(
                    db,
                    "task_comments",
                    &["task_id", "comment_text", "admin_id"],
                    &b,
                )?;
                return Ok(json!({"success":true,"commentId":c["id"]}));
            }
        }
        if p.get(3) == Some(&"status") && m == "PUT" {
            if a.role == "admin" && task["assigned_to"] != a.id {
                return Err(Error::new(403, "Можно менять статус только своих задач"));
            }
            let status = required(&b, "status")?;
            if !["pending", "in_progress", "completed"].contains(&status.as_str()) {
                return Err(Error::new(400, "Неверный статус"));
            }
            db.execute("UPDATE tasks SET status=?,completed_at=CASE WHEN ?='completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END,completed_by=CASE WHEN ?='completed' THEN ? END WHERE id=?",rusqlite::params![status,status,status,a.id,target])?;
            return Ok(
                json!({"success":true,"task":one(db,"SELECT * FROM tasks WHERE id=?",&[json!(target)])?}),
            );
        }
        a.manager()?;
        if m == "PUT" && p.len() == 3 {
            required(&b, "title")?;
            normalize_task(&mut b);
            return Ok(
                json!({"success":true,"task":update(db,"tasks",&["title","description","assigned_to","priority","due_date"],target,&b)?}),
            );
        }
        if m == "DELETE" && p.len() == 3 {
            db.execute("DELETE FROM tasks WHERE id=?", [target])?;
            return Ok(ok);
        }
    }
    if p.get(1) == Some(&"reports") {
        if p.len() == 2 && m == "GET" {
            return Ok(json!(rows(
                db,
                "SELECT r.*,a.full_name AS created_by_name FROM reports r LEFT JOIN admins a ON a.id=r.created_by ORDER BY r.id DESC",
                &[]
            )?));
        }
        if m == "POST" && p.len() == 2 {
            required(&b, "title")?;
            b["created_by"] = json!(a.id);
            return Ok(
                json!({"success":true,"report":insert(db,"reports",&["title","description","report_data","created_by"],&b)?}),
            );
        }
        let target = id(p.get(2).unwrap_or(&""))?;
        let report = one(db, "SELECT * FROM reports WHERE id=?", &[json!(target)])?;
        if m == "PUT" {
            if report["created_by"] != a.id {
                a.manager()?;
            }
            if b.get("title").is_some() {
                required(&b, "title")?;
            }
            let v = update(
                db,
                "reports",
                &["title", "description", "report_data"],
                target,
                &b,
            )?;
            db.execute(
                "UPDATE reports SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
                [target],
            )?;
            return Ok(json!({"success":true,"report":v}));
        }
        if m == "DELETE" {
            a.manager()?;
            db.execute("DELETE FROM reports WHERE id=?", [target])?;
            return Ok(ok);
        }
    }
    let (table, fields, envelope, start) = match p.get(1).copied().unwrap_or("") {
        "inventory" => {
            let kind = p.get(2).copied().unwrap_or("");
            let table = match kind {
                "computers" => "inventory_computers",
                "laptops" => "inventory_laptops",
                "printers" => "inventory_printers",
                _ => return Err(Error::new(400, "Неверный вид инвентаря")),
            };
            let fields = if kind == "printers" {
                vec![
                    "inventory_number",
                    "model",
                    "cartridge",
                    "location",
                    "ip",
                    "comment",
                ]
            } else {
                vec![
                    "inventory_number",
                    "responsible",
                    "location",
                    "cpu",
                    "ram",
                    "storage",
                    "windows_version",
                    "ip_inet",
                    "ip_lan",
                    "mac",
                    "name",
                    "manufacturer",
                ]
            };
            (table, fields, "", 3)
        }
        "switches" => {
            if p.get(3) == Some(&"ports") && m == "POST" {
                b["switch_id"] = json!(id(p[2])?);
                validate_port(db, &b, None)?;
                return Ok(
                    json!({"success":true,"port":insert(db,"switch_ports",&["switch_id","port_number","port_label","destination","status","speed","vlan","comment"],&b)?}),
                );
            }
            (
                "switches",
                vec![
                    "inventory_number",
                    "model",
                    "manufacturer",
                    "ports_count",
                    "ip",
                    "mac",
                    "location",
                    "connection_method",
                    "sn",
                    "comment",
                ],
                "switch",
                2,
            )
        }
        "switch-ports" => (
            "switch_ports",
            vec![
                "port_number",
                "port_label",
                "destination",
                "status",
                "speed",
                "vlan",
                "comment",
            ],
            "port",
            2,
        ),
        _ => return Err(Error::new(404, "Маршрут не найден")),
    };
    if m == "GET" && p.len() == start {
        let mut data = rows(db, &format!("SELECT * FROM {table} ORDER BY id"), &[])?;
        if table == "switches" {
            for sw in &mut data {
                sw["ports"] = json!(rows(
                    db,
                    "SELECT * FROM switch_ports WHERE switch_id=? ORDER BY port_number",
                    &[sw["id"].clone()]
                )?);
            }
        }
        return Ok(json!(data));
    }
    if m == "POST" && p.len() == start {
        if table != "switch_ports" {
            required(&b, "inventory_number")?;
        }
        let v = insert(db, table, &fields, &b)?;
        return Ok(if envelope.is_empty() {
            v
        } else {
            json!({"success":true,envelope:v})
        });
    }
    let target = id(p.get(start).unwrap_or(&""))?;
    one(
        db,
        &format!("SELECT id FROM {table} WHERE id=?"),
        &[json!(target)],
    )?;
    if m == "PUT" {
        if table == "switch_ports" {
            validate_port(db, &b, Some(target))?;
        }
        if b.get("inventory_number").is_some() {
            required(&b, "inventory_number")?;
        }
        let v = update(db, table, &fields, target, &b)?;
        return Ok(if envelope.is_empty() {
            v
        } else {
            json!({"success":true,envelope:v})
        });
    }
    if m == "DELETE" {
        a.manager()?;
        db.execute(&format!("DELETE FROM {table} WHERE id=?"), [target])?;
        return Ok(ok);
    }
    Err(Error::new(405, "Метод не поддерживается"))
}
fn normalize_task(b: &mut Value) {
    for key in ["assigned_to", "due_date"] {
        if b[key] == "" {
            b[key] = Value::Null;
        }
    }
    if let Some(s) = b["assigned_to"].as_str() {
        b["assigned_to"] = s.parse::<i64>().map(|v| json!(v)).unwrap_or(Value::Null);
    }
    if b.get("priority").is_none() {
        b["priority"] = json!("medium");
    }
}
fn validate_port(db: &Connection, b: &Value, target: Option<i64>) -> Result<()> {
    let switch = if let Some(n) = target {
        one(
            db,
            "SELECT switch_id FROM switch_ports WHERE id=?",
            &[json!(n)],
        )?["switch_id"]
            .clone()
    } else {
        b["switch_id"].clone()
    };
    let sw = one(db, "SELECT ports_count FROM switches WHERE id=?", &[switch])?;
    let n = b["port_number"].as_i64().unwrap_or(0);
    if n < 1 || n > sw["ports_count"].as_i64().unwrap_or(0) {
        return Err(Error::new(
            400,
            "Номер порта выходит за пределы коммутатора",
        ));
    }
    Ok(())
}
