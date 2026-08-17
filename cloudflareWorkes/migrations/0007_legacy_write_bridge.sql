-- Keep writes from the legacy mini program visible after FAMILY_MODE is
-- enabled. These triggers can be removed in the later family-only release.
CREATE TRIGGER bridge_legacy_dishes_family_insert
AFTER INSERT ON dishes
WHEN NEW.familyId IS NULL AND EXISTS (
  SELECT 1 FROM families WHERE id = 'legacy-family' AND status = 'active'
)
BEGIN
  UPDATE dishes SET familyId = 'legacy-family' WHERE id = NEW.id;
END;

CREATE TRIGGER bridge_legacy_appointments_family_insert
AFTER INSERT ON appointments
WHEN NEW.familyId IS NULL AND EXISTS (
  SELECT 1 FROM families WHERE id = 'legacy-family' AND status = 'active'
)
BEGIN
  UPDATE appointments SET familyId = 'legacy-family' WHERE id = NEW.id;
END;

CREATE TRIGGER bridge_legacy_reviews_family_insert
AFTER INSERT ON reviews
WHEN NEW.familyId IS NULL AND EXISTS (
  SELECT 1 FROM families WHERE id = 'legacy-family' AND status = 'active'
)
BEGIN
  UPDATE reviews SET familyId = 'legacy-family' WHERE id = NEW.id;
END;

CREATE TRIGGER bridge_legacy_inventory_family_insert
AFTER INSERT ON inventory_items
WHEN NEW.familyId IS NULL AND EXISTS (
  SELECT 1 FROM families WHERE id = 'legacy-family' AND status = 'active'
)
BEGIN
  UPDATE inventory_items SET familyId = 'legacy-family' WHERE id = NEW.id;
END;
