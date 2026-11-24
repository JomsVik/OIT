use crate::{Error, Result};
use rusqlite::{
    Connection, params_from_iter,
    types::{Value as SqlValue, ValueRef},
};
use serde_json::{Value, json};

pub fn initialize(db: &mut Connection) -> Result<()> {
    db.busy_timeout(std::time::Duration::from_secs(10))?;
    db.execute_batch(
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);",
    )?;
    for (version, sql) in [
        (1, include_str!("../migrations/001_initial.sql")),
        (2, include_str!("../migrations/002_cartridges.sql")),
        (3, include_str!("../migrations/003_login_limits.sql")),
        (4, include_str!("../migrations/004_audit_snapshot.sql")),
        (5, include_str!("../migrations/005_portal_fixes.sql")),
        (6, include_str!("../migrations/006_import_inventory.sql")),
    ] {
        if db.query_row(
            "SELECT count(*) FROM schema_migrations WHERE version=?",
            [version],
            |r| r.get::<_, i64>(0),
        )? == 0
        {
            let tx = db.transaction()?;
            tx.execute_batch(sql)?;
            tx.execute("INSERT INTO schema_migrations VALUES (?)", [version])?;
            tx.commit()?;
        }
    }
    Ok(())
}

pub fn sql_value(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) if n.is_i64() => SqlValue::Integer(n.as_i64().unwrap()),
        Value::Number(n) => SqlValue::Real(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => SqlValue::Text(s.clone()),
        _ => SqlValue::Text(v.to_string()),
    }
}

pub fn rows(db: &Connection, sql: &str, values: &[Value]) -> Result<Vec<Value>> {
    let mut stmt = db.prepare(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let data = stmt
        .query_map(params_from_iter(values.iter().map(sql_value)), |row| {
            let mut obj = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let v = match row.get_ref(i)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(n)
                        if name == "is_public" || (name == "status" && (n == 0 || n == 1)) =>
                    {
                        json!(n != 0)
                    }
                    ValueRef::Integer(n) => json!(n),
                    ValueRef::Real(n) => json!(n),
                    ValueRef::Text(s) => json!(String::from_utf8_lossy(s)),
                    ValueRef::Blob(_) => Value::Null,
                };
                obj.insert(name.clone(), v);
            }
            Ok(Value::Object(obj))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(data)
}

pub fn one(db: &Connection, sql: &str, values: &[Value]) -> Result<Value> {
    rows(db, sql, values)?
        .into_iter()
        .next()
        .ok_or_else(|| Error::new(404, "Запись не найдена"))
}

// Table and field identifiers come exclusively from constants in the API, never from request text.
pub fn insert(db: &Connection, table: &str, fields: &[&str], body: &Value) -> Result<Value> {
    let fields: Vec<&str> = fields
        .iter()
        .copied()
        .filter(|f| body.get(*f).is_some())
        .collect();
    if fields.is_empty() {
        return Err(Error::new(400, "Нет данных"));
    }
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({}) RETURNING *",
        fields.join(","),
        vec!["?"; fields.len()].join(",")
    );
    let values: Vec<Value> = fields.iter().map(|f| body[*f].clone()).collect();
    one(db, &sql, &values)
}

pub fn update(
    db: &Connection,
    table: &str,
    fields: &[&str],
    id: i64,
    body: &Value,
) -> Result<Value> {
    let fields: Vec<&str> = fields
        .iter()
        .copied()
        .filter(|f| body.get(*f).is_some())
        .collect();
    if fields.is_empty() {
        return Err(Error::new(400, "Нет данных"));
    }
    let mut values: Vec<Value> = fields.iter().map(|f| body[*f].clone()).collect();
    values.push(json!(id));
    one(
        db,
        &format!(
            "UPDATE {table} SET {} WHERE id=? RETURNING *",
            fields
                .iter()
                .map(|f| format!("{f}=?"))
                .collect::<Vec<_>>()
                .join(",")
        ),
        &values,
    )
}
