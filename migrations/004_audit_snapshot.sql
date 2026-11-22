ALTER TABLE cartridge_movements ADD COLUMN scanned_barcode TEXT NOT NULL DEFAULT '';
ALTER TABLE cartridge_movements ADD COLUMN actor_name TEXT NOT NULL DEFAULT '';
UPDATE cartridge_movements SET actor_name=coalesce((SELECT full_name FROM admins WHERE id=admin_id),'Удалённая учётная запись');
DROP TRIGGER cartridge_movements_no_update;
CREATE TRIGGER cartridge_movements_no_update BEFORE UPDATE ON cartridge_movements
 WHEN NEW.id <> OLD.id OR NEW.request_id <> OLD.request_id OR NEW.cartridge_id <> OLD.cartridge_id OR NEW.kind <> OLD.kind
 OR NEW.quantity <> OLD.quantity OR NEW.balance_after <> OLD.balance_after OR NEW.destination <> OLD.destination
 OR NEW.note <> OLD.note OR NEW.created_at <> OLD.created_at OR NEW.scanned_barcode <> OLD.scanned_barcode
 OR NEW.actor_name <> OLD.actor_name
 BEGIN SELECT RAISE(ABORT,'Movement history is immutable'); END;
