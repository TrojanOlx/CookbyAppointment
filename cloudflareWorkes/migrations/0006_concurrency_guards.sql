-- Serialize application-level workflows that span multiple D1 statements.
CREATE TABLE operation_locks (
  scope TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expiresAt INTEGER NOT NULL
);
CREATE INDEX idx_operation_locks_expiry ON operation_locks(expiresAt);

CREATE UNIQUE INDEX idx_shopping_single_active
ON shopping_lists(familyId)
WHERE status = 'active';

-- A purchased shopping item may create at most one inventory row.
ALTER TABLE inventory_items ADD COLUMN sourceShoppingItemId TEXT;
CREATE UNIQUE INDEX idx_inventory_source_shopping_item
ON inventory_items(sourceShoppingItemId)
WHERE sourceShoppingItemId IS NOT NULL;

-- Idempotency keys are scoped to one concrete operation/resource.
CREATE TABLE idempotency_keys_v2 (
  familyId TEXT NOT NULL,
  userId TEXT NOT NULL,
  key TEXT NOT NULL,
  operation TEXT NOT NULL,
  responseStatus INTEGER,
  responseBody TEXT,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (familyId, userId, operation, key)
);
INSERT INTO idempotency_keys_v2 (
  familyId, userId, key, operation, responseStatus, responseBody, createdAt
)
SELECT familyId, userId, key, operation, responseStatus, responseBody, createdAt
FROM idempotency_keys;
DROP TABLE idempotency_keys;
ALTER TABLE idempotency_keys_v2 RENAME TO idempotency_keys;

-- V1 clients still write NULL familyId while FAMILY_MODE is off. Update-time
-- guards remain in 0005; insert guards return in the family-only release.
DROP TRIGGER IF EXISTS enforce_dishes_family_insert;
DROP TRIGGER IF EXISTS enforce_appointments_family_insert;
DROP TRIGGER IF EXISTS enforce_reviews_family_insert;
DROP TRIGGER IF EXISTS enforce_inventory_family_insert;
