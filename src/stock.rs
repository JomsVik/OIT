use crate::{db::*, *};

pub fn normalize_barcode(s: &str) -> String {
    let ru = "ёйцукенгшщзхъфывапролджэячсмитьбю";
    let en = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.";
    s.trim()
        .chars()
        .map(|c| {
            let lower = c.to_lowercase().next().unwrap_or(c);
            if let Some(i) = ru.chars().position(|r| r == lower) {
                let mapped = en.chars().nth(i).unwrap();
                if c.is_uppercase() {
                    match mapped {
                        '[' => '{',
                        ']' => '}',
                        ';' => ':',
                        '\'' => '"',
                        ',' => '<',
                        '.' => '>',
                        '`' => '~',
                        _ => mapped.to_ascii_uppercase(),
                    }
                } else {
                    mapped
                }
            } else {
                c
            }
        })
        .collect()
}
fn barcode(b: &Value) -> Result<String> {
    let s = normalize_barcode(&required(b, "barcode")?);
    if s.len() > 128 || s.chars().any(char::is_control) {
        return Err(Error::new(
            400,
            "Штрихкод: от 1 до 128 байт, без управляющих символов",
        ));
    }
    Ok(s)
}
fn quantity(b: &Value, key: &str, default: i64, min: i64) -> Result<i64> {
    match b.get(key) {
        None => Ok(default),
        Some(v) => v
            .as_i64()
            .filter(|n| *n >= min && *n <= 1_000_000)
            .ok_or_else(|| Error::new(400, format!("{key}: целое число от {min} до 1000000"))),
    }
}
pub fn handle(db: &mut Connection, m: &str, p: &[&str], b: &Value, a: &Actor) -> Result<Value> {
    if p.len() == 2 {
        if m == "GET" {
            let mut items = rows(
                db,
                "SELECT * FROM cartridges WHERE archived_at IS NULL ORDER BY model,id",
                &[],
            )?;
            for item in &mut items {
                item["barcodes"] = json!(rows(
                    db,
                    "SELECT barcode,batch_note FROM cartridge_barcodes WHERE cartridge_id=? ORDER BY barcode",
                    &[item["id"].clone()]
                )?);
                item["low_stock"] = json!(item["stock"].as_i64() <= item["min_stock"].as_i64());
            }
            return Ok(json!(items));
        }
        if m == "POST" {
            let code = barcode(b)?;
            let model = required(b, "model")?;
            let min = quantity(b, "min_stock", 0, 0)?;
            let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
            let item = insert(
                &tx,
                "cartridges",
                &["barcode", "model", "compatible_printers", "min_stock"],
                &json!({"barcode":code,"model":model,"compatible_printers":b["compatible_printers"].as_str().unwrap_or(""),"min_stock":min}),
            )?;
            tx.execute(
                "INSERT INTO cartridge_barcodes(barcode,cartridge_id) VALUES (?,?)",
                rusqlite::params![code, item["id"].as_i64()],
            )?;
            tx.commit()?;
            return Ok(item);
        }
    }
    if p.get(2) == Some(&"movements") {
        if m == "GET" {
            return Ok(json!(rows(
                db,
                "SELECT m.*,c.model,c.barcode,m.actor_name AS admin_name,p.inventory_number AS printer_inventory_number FROM cartridge_movements m JOIN cartridges c ON c.id=m.cartridge_id LEFT JOIN inventory_printers p ON p.id=m.printer_id ORDER BY m.id DESC LIMIT 500",
                &[]
            )?));
        }
        if m == "POST" {
            return movement(db, b, a);
        }
    }
    let target = id(p.get(2).unwrap_or(&""))?;
    let item = one(
        db,
        "SELECT * FROM cartridges WHERE id=? AND archived_at IS NULL",
        &[json!(target)],
    )?;
    if p.len() == 3 && m == "DELETE" {
        a.manager()?;
        if item["stock"].as_i64().unwrap_or(0) != 0 {
            return Err(Error::new(
                409,
                "Удалить можно карточку с нулевым остатком. Сначала проведите фактическую выдачу оставшихся картриджей.",
            ));
        }
        db.execute(
            "UPDATE cartridges SET archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
            [target],
        )?;
        return Ok(json!({"success":true}));
    }
    if p.get(3) == Some(&"barcodes") && m == "POST" {
        let code = barcode(b)?;
        one(db, "SELECT id FROM cartridges WHERE id=?", &[json!(target)])?;
        db.execute(
            "INSERT INTO cartridge_barcodes(barcode,cartridge_id,batch_note) VALUES (?,?,?)",
            rusqlite::params![code, target, b["batch_note"].as_str().unwrap_or("")],
        )?;
        return Ok(json!({"success":true}));
    }
    if p.len() == 3 && m == "PUT" {
        required(b, "model")?;
        let min = quantity(b, "min_stock", 0, 0)?;
        return update(
            db,
            "cartridges",
            &["model", "compatible_printers", "min_stock"],
            target,
            &json!({"model":b["model"],"compatible_printers":b["compatible_printers"].as_str().unwrap_or(""),"min_stock":min}),
        );
    }
    Err(Error::new(404, "Маршрут не найден"))
}

pub fn movement(db: &mut Connection, b: &Value, a: &Actor) -> Result<Value> {
    let code = barcode(b)?;
    let request = required(b, "request_id")?;
    if uuid::Uuid::parse_str(&request).is_err() {
        return Err(Error::new(400, "request_id должен быть UUID"));
    }
    let kind = required(b, "kind")?;
    if !["receipt", "issue", "return"].contains(&kind.as_str()) {
        return Err(Error::new(400, "Неизвестный вид операции"));
    }
    let qty = quantity(b, "quantity", 1, 1)?;
    if kind == "issue" && qty != 1 {
        return Err(Error::new(400, "Выдача списывает ровно один картридж"));
    }
    let destination = if kind == "issue" {
        required(b, "destination")?
    } else {
        String::new()
    };
    let note = b["note"].as_str().unwrap_or("");
    let printer = if kind != "issue" {
        Value::Null
    } else {
        match b.get("printer_id") {
            None | Some(Value::Null) => Value::Null,
            Some(v) => json!(
                v.as_i64()
                    .filter(|n| *n > 0)
                    .ok_or_else(|| Error::new(400, "Некорректный принтер"))?
            ),
        }
    };
    let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let item=one(&tx,"SELECT c.* FROM cartridges c JOIN cartridge_barcodes b ON b.cartridge_id=c.id WHERE b.barcode=? AND c.archived_at IS NULL",&[json!(code)]).map_err(|e|if e.status==404 {Error::new(404,"Штрихкод не зарегистрирован или карточка удалена. Создайте карточку или добавьте код к существующей модели")}else{e})?;
    if let Some(existing) = rows(
        &tx,
        "SELECT * FROM cartridge_movements WHERE request_id=?",
        &[json!(request)],
    )?
    .into_iter()
    .next()
    {
        if existing["cartridge_id"] != item["id"]
            || existing["kind"] != kind
            || existing["quantity"] != qty
            || existing["destination"] != destination
            || existing["printer_id"] != printer
            || existing["note"] != note
            || existing["admin_id"] != a.id
            || existing["scanned_barcode"] != code
        {
            return Err(Error::new(
                409,
                "Этот request_id уже использован для другой операции",
            ));
        }
        return Ok(json!({"success":true,"duplicate":true,"movement":existing}));
    }
    if !printer.is_null() {
        one(
            &tx,
            "SELECT id FROM inventory_printers WHERE id=?",
            &[printer.clone()],
        )?;
    }
    let delta = if kind == "issue" { -qty } else { qty };
    let changed = tx.execute(
        "UPDATE cartridges SET stock=stock+? WHERE id=? AND stock+? BETWEEN 0 AND 1000000",
        rusqlite::params![delta, item["id"].as_i64(), delta],
    )?;
    if changed == 0 {
        return Err(Error::new(
            409,
            if delta < 0 {
                "Нет картриджей на складе"
            } else {
                "Превышен максимальный остаток"
            },
        ));
    }
    let balance = one(
        &tx,
        "SELECT stock FROM cartridges WHERE id=?",
        &[item["id"].clone()],
    )?["stock"]
        .clone();
    let movement = insert(
        &tx,
        "cartridge_movements",
        &[
            "request_id",
            "cartridge_id",
            "kind",
            "quantity",
            "balance_after",
            "destination",
            "printer_id",
            "note",
            "admin_id",
            "scanned_barcode",
            "actor_name",
        ],
        &json!({"request_id":request,"cartridge_id":item["id"],"kind":kind,"quantity":qty,"balance_after":balance,"destination":destination,"printer_id":printer,"note":note,"admin_id":a.id,"scanned_barcode":code,"actor_name":a.name}),
    )?;
    tx.commit()?;
    Ok(json!({"success":true,"duplicate":false,"movement":movement}))
}
