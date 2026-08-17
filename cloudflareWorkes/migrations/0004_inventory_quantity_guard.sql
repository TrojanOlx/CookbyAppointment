CREATE TRIGGER enforce_inventory_nonnegative_insert
BEFORE INSERT ON inventory_items WHEN NEW.quantity IS NOT NULL AND NEW.quantity < 0
BEGIN SELECT RAISE(ABORT, 'inventory quantity cannot be negative'); END;

CREATE TRIGGER enforce_inventory_nonnegative_update
BEFORE UPDATE OF quantity ON inventory_items WHEN NEW.quantity IS NOT NULL AND NEW.quantity < 0
BEGIN SELECT RAISE(ABORT, 'inventory quantity cannot be negative'); END;
