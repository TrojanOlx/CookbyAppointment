-- Enforce tenant invariants for future writes while keeping legacy columns for
-- one compatibility release.
CREATE TRIGGER enforce_dishes_family_update
BEFORE UPDATE OF familyId ON dishes WHEN NEW.familyId IS NULL
BEGIN SELECT RAISE(ABORT, 'dishes.familyId is required'); END;

CREATE TRIGGER enforce_appointments_family_update
BEFORE UPDATE OF familyId ON appointments WHEN NEW.familyId IS NULL
BEGIN SELECT RAISE(ABORT, 'appointments.familyId is required'); END;

CREATE TRIGGER enforce_reviews_family_update
BEFORE UPDATE OF familyId ON reviews WHEN NEW.familyId IS NULL
BEGIN SELECT RAISE(ABORT, 'reviews.familyId is required'); END;

CREATE TRIGGER enforce_inventory_family_update
BEFORE UPDATE OF familyId ON inventory_items WHEN NEW.familyId IS NULL
BEGIN SELECT RAISE(ABORT, 'inventory_items.familyId is required'); END;

CREATE UNIQUE INDEX idx_family_single_active_owner
ON family_members(familyId)
WHERE role = 'owner' AND status = 'active';
