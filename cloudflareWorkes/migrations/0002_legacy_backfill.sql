-- Additive legacy backfill. Production must be backed up and this migration
-- must be rehearsed against that backup before it is applied remotely.
--
-- The original database was already used by unrelated accounts. Trojan-X and
-- balabalabiubiu are one household; every other existing account starts in an
-- independent household. The preferred production IDs have a deterministic
-- fallback so fresh and staging databases remain portable.
CREATE TABLE _legacy_family_assignments (
  userId TEXT PRIMARY KEY,
  familyId TEXT NOT NULL,
  role TEXT NOT NULL
);

INSERT OR IGNORE INTO families (
  id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt
)
SELECT
  'legacy-family',
  iif(
    id = 'e57743c5-7d24-4435-97eb-9a6d0dfffd23',
    'Trojan-X 的家庭',
    COALESCE(NULLIF(nickName, ''), '我的') || '的家庭'
  ),
  'Asia/Shanghai', 20, 'active', id,
  COALESCE(createTime, CAST(unixepoch('now') AS INTEGER) * 1000),
  CAST(unixepoch('now') AS INTEGER) * 1000
FROM users
ORDER BY
  (id = 'e57743c5-7d24-4435-97eb-9a6d0dfffd23') DESC,
  (isAdmin = 1) DESC,
  createTime ASC,
  id ASC
LIMIT 1;

INSERT INTO _legacy_family_assignments (userId, familyId, role)
SELECT
  u.id,
  iif(
    u.id = f.createdBy OR (
      u.id = '8f1e0e34-7dff-4687-8c69-657e12efeee9'
      AND f.createdBy = 'e57743c5-7d24-4435-97eb-9a6d0dfffd23'
    ),
    'legacy-family',
    'legacy-family-' || u.id
  ),
  iif(
    u.id = '8f1e0e34-7dff-4687-8c69-657e12efeee9'
      AND f.createdBy = 'e57743c5-7d24-4435-97eb-9a6d0dfffd23',
    'member',
    'owner'
  )
FROM users u
JOIN families f ON f.id = 'legacy-family';

INSERT OR IGNORE INTO families (
  id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt
)
SELECT
  a.familyId,
  COALESCE(NULLIF(u.nickName, ''), '我的') || '的家庭',
  'Asia/Shanghai', 20, 'active', u.id,
  COALESCE(u.createTime, CAST(unixepoch('now') AS INTEGER) * 1000),
  CAST(unixepoch('now') AS INTEGER) * 1000
FROM _legacy_family_assignments a
JOIN users u ON u.id = a.userId
WHERE a.familyId <> 'legacy-family';

INSERT OR IGNORE INTO family_members (
  familyId, userId, role, status, joinedAt, updatedAt
)
SELECT
  a.familyId, a.userId, a.role, 'active',
  COALESCE(u.createTime, CAST(unixepoch('now') AS INTEGER) * 1000),
  CAST(unixepoch('now') AS INTEGER) * 1000
FROM _legacy_family_assignments a
JOIN users u ON u.id = a.userId;

UPDATE dishes
SET familyId = COALESCE(
  (SELECT a.familyId FROM _legacy_family_assignments a WHERE a.userId = dishes.creatorId),
  'legacy-family'
)
WHERE familyId IS NULL AND EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');

UPDATE appointments
SET familyId = COALESCE(
  (SELECT a.familyId FROM _legacy_family_assignments a WHERE a.userId = appointments.userId),
  'legacy-family'
)
WHERE familyId IS NULL AND EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');

UPDATE reviews
SET familyId = COALESCE(
  (SELECT ap.familyId FROM appointments ap WHERE ap.id = reviews.appointmentId),
  (SELECT a.familyId FROM _legacy_family_assignments a WHERE a.userId = reviews.userId),
  'legacy-family'
)
WHERE familyId IS NULL AND EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');

UPDATE inventory_items
SET familyId = COALESCE(
  (SELECT a.familyId FROM _legacy_family_assignments a WHERE a.userId = inventory_items.userId),
  'legacy-family'
)
WHERE familyId IS NULL AND EXISTS (SELECT 1 FROM families WHERE id = 'legacy-family');

-- An appointment or review in a personal household may reference a dish whose
-- legacy creator cannot be mapped. Clone the dish into the consuming family so
-- no V2 relation crosses a tenant boundary.
CREATE TABLE legacy_dish_clones (
  sourceDishId TEXT NOT NULL,
  targetFamilyId TEXT NOT NULL,
  clonedDishId TEXT NOT NULL UNIQUE,
  PRIMARY KEY (sourceDishId, targetFamilyId)
);

INSERT OR IGNORE INTO legacy_dish_clones (
  sourceDishId, targetFamilyId, clonedDishId
)
SELECT DISTINCT
  ad.dishId,
  ap.familyId,
  'legacy-clone-' || lower(hex(randomblob(16)))
FROM appointment_dishes ad
JOIN appointments ap ON ap.id = ad.appointmentId
JOIN dishes d ON d.id = ad.dishId
WHERE ap.familyId <> d.familyId;

INSERT OR IGNORE INTO legacy_dish_clones (
  sourceDishId, targetFamilyId, clonedDishId
)
SELECT DISTINCT
  r.dishId,
  r.familyId,
  'legacy-clone-' || lower(hex(randomblob(16)))
FROM reviews r
JOIN dishes d ON d.id = r.dishId
WHERE r.familyId <> d.familyId;

INSERT INTO dishes (
  id, name, type, spicy, images, steps, notice, remark, reference,
  creatorId, creatorOpenid, createTime, updateTime, familyId
)
SELECT
  c.clonedDishId, d.name, d.type, d.spicy, d.images, d.steps,
  d.notice, d.remark, d.reference, f.createdBy, u.openid,
  d.createTime, d.updateTime, c.targetFamilyId
FROM legacy_dish_clones c
JOIN dishes d ON d.id = c.sourceDishId
JOIN families f ON f.id = c.targetFamilyId
JOIN users u ON u.id = f.createdBy;

INSERT INTO ingredients (
  id, dishId, name, amount, createTime, updateTime,
  ingredientId, quantity, unit, legacyAmount
)
SELECT
  'legacy-clone-ingredient-' || lower(hex(randomblob(16))),
  c.clonedDishId,
  i.name, i.amount, i.createTime, i.updateTime,
  i.ingredientId, i.quantity, i.unit, COALESCE(i.legacyAmount, i.amount)
FROM legacy_dish_clones c
JOIN ingredients i ON i.dishId = c.sourceDishId;

UPDATE appointment_dishes
SET dishId = (
  SELECT c.clonedDishId
  FROM appointments ap
  JOIN legacy_dish_clones c
    ON c.sourceDishId = appointment_dishes.dishId
   AND c.targetFamilyId = ap.familyId
  WHERE ap.id = appointment_dishes.appointmentId
)
WHERE EXISTS (
  SELECT 1
  FROM appointments ap
  JOIN legacy_dish_clones c
    ON c.sourceDishId = appointment_dishes.dishId
   AND c.targetFamilyId = ap.familyId
  WHERE ap.id = appointment_dishes.appointmentId
);

UPDATE reviews
SET dishId = (
  SELECT c.clonedDishId
  FROM legacy_dish_clones c
  WHERE c.sourceDishId = reviews.dishId
    AND c.targetFamilyId = reviews.familyId
)
WHERE EXISTS (
  SELECT 1 FROM legacy_dish_clones c
  WHERE c.sourceDishId = reviews.dishId
    AND c.targetFamilyId = reviews.familyId
);

UPDATE ingredients
SET legacyAmount = amount
WHERE legacyAmount IS NULL AND amount IS NOT NULL;

UPDATE inventory_items
SET legacyAmount = amount
WHERE legacyAmount IS NULL AND amount IS NOT NULL;

INSERT OR IGNORE INTO shopping_lists (
  id, familyId, status, createdAt, updatedAt
)
SELECT
  'shopping-' || id, id, 'active',
  CAST(unixepoch('now') AS INTEGER) * 1000,
  CAST(unixepoch('now') AS INTEGER) * 1000
FROM families
WHERE status = 'active';

DROP TABLE _legacy_family_assignments;
