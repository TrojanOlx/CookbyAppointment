-- Additive legacy backfill. Production must be backed up and row counts must be
-- compared before this migration is applied remotely.
INSERT OR IGNORE INTO families (
  id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt
)
SELECT
  'legacy-family', '我的家庭', 'Asia/Shanghai', 20, 'active', id,
  COALESCE(createTime, CAST(unixepoch('now') AS INTEGER) * 1000),
  CAST(unixepoch('now') AS INTEGER) * 1000
FROM users
ORDER BY CASE WHEN isAdmin = 1 THEN 0 ELSE 1 END, createTime ASC
LIMIT 1;

INSERT OR IGNORE INTO family_members (familyId, userId, role, status, joinedAt, updatedAt)
SELECT
  'legacy-family', u.id,
  CASE
    WHEN u.id = (SELECT createdBy FROM families WHERE id = 'legacy-family') THEN 'owner'
    WHEN u.isAdmin = 1 THEN 'admin'
    ELSE 'member'
  END,
  'active', COALESCE(u.createTime, CAST(unixepoch('now') AS INTEGER) * 1000),
  CAST(unixepoch('now') AS INTEGER) * 1000
FROM users u
WHERE EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');

UPDATE dishes SET familyId = 'legacy-family'
WHERE familyId IS NULL AND EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');
UPDATE appointments SET familyId = 'legacy-family'
WHERE familyId IS NULL AND EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');
UPDATE reviews SET familyId = 'legacy-family'
WHERE familyId IS NULL AND EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');
UPDATE inventory_items SET familyId = 'legacy-family'
WHERE familyId IS NULL AND EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');
UPDATE ingredients SET legacyAmount = amount WHERE legacyAmount IS NULL AND amount IS NOT NULL;
UPDATE inventory_items SET legacyAmount = amount WHERE legacyAmount IS NULL AND amount IS NOT NULL;

INSERT OR IGNORE INTO shopping_lists (id, familyId, status, createdAt, updatedAt)
SELECT 'shopping-legacy-family', 'legacy-family', 'active',
       CAST(unixepoch('now') AS INTEGER) * 1000,
       CAST(unixepoch('now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');
