CREATE TABLE cartridges (
 id INTEGER PRIMARY KEY, barcode TEXT NOT NULL UNIQUE CHECK(length(barcode) BETWEEN 1 AND 128),
 model TEXT NOT NULL CHECK(length(trim(model)) > 0), compatible_printers TEXT NOT NULL DEFAULT '',
 min_stock INTEGER NOT NULL DEFAULT 0 CHECK(min_stock BETWEEN 0 AND 1000000),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 1000000),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE cartridge_movements (
 id INTEGER PRIMARY KEY, request_id TEXT NOT NULL UNIQUE,
 cartridge_id INTEGER NOT NULL REFERENCES cartridges(id),
 kind TEXT NOT NULL CHECK(kind IN ('receipt','issue','return')),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
 balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
 destination TEXT NOT NULL DEFAULT '', printer_id INTEGER REFERENCES inventory_printers(id) ON DELETE SET NULL,
 note TEXT NOT NULL DEFAULT '', admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK(kind <> 'issue' OR (quantity = 1 AND length(trim(destination)) > 0))
);
CREATE TABLE cartridge_barcodes (
 barcode TEXT PRIMARY KEY CHECK(length(barcode) BETWEEN 1 AND 128),
 cartridge_id INTEGER NOT NULL REFERENCES cartridges(id),
 batch_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX cartridge_barcodes_item ON cartridge_barcodes(cartridge_id);
CREATE INDEX cartridge_movements_item ON cartridge_movements(cartridge_id,id);
CREATE TRIGGER cartridge_movements_no_update BEFORE UPDATE ON cartridge_movements
 WHEN NEW.request_id <> OLD.request_id OR NEW.cartridge_id <> OLD.cartridge_id OR NEW.kind <> OLD.kind
 OR NEW.quantity <> OLD.quantity OR NEW.balance_after <> OLD.balance_after OR NEW.destination <> OLD.destination
 OR NEW.note <> OLD.note OR NEW.created_at <> OLD.created_at
 BEGIN SELECT RAISE(ABORT,'Movement history is immutable'); END;
CREATE TRIGGER cartridge_movements_no_delete BEFORE DELETE ON cartridge_movements
 BEGIN SELECT RAISE(ABORT,'Movement history is immutable'); END;
