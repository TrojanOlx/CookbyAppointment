-- Keep writes from the legacy mini program visible after FAMILY_MODE is
-- enabled. V1 requests have no family header, so an active owner household is
-- preferred. V2 writes already carry familyId and do not enter these triggers.

CREATE TRIGGER bridge_legacy_dishes_family_insert
AFTER INSERT ON dishes
WHEN NEW.familyId IS NULL
BEGIN
  INSERT OR IGNORE INTO families (
    id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt
  )
  SELECT
    'legacy-family-' || lower(hex(u.id)) || '-' || lower(hex(NEW.id)),
    '我的家庭', 'Asia/Shanghai', 20, 'active', u.id,
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM users u
  WHERE u.id = NEW.creatorId
    AND NOT EXISTS (
      SELECT 1
      FROM family_members fm
      JOIN families active_family
        ON active_family.id = fm.familyId AND active_family.status = 'active'
      WHERE fm.userId = u.id AND fm.status = 'active'
    );

  INSERT OR IGNORE INTO family_members (
    familyId, userId, role, status, joinedAt, updatedAt
  )
  SELECT
    'legacy-family-' || lower(hex(u.id)) || '-' || lower(hex(NEW.id)),
    u.id, 'owner', 'active',
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM users u
  WHERE u.id = NEW.creatorId
    AND NOT EXISTS (
      SELECT 1
      FROM family_members fm
      JOIN families active_family
        ON active_family.id = fm.familyId AND active_family.status = 'active'
      WHERE fm.userId = u.id AND fm.status = 'active'
    );

  INSERT OR IGNORE INTO shopping_lists (
    id, familyId, status, createdAt, updatedAt
  )
  SELECT
    'shopping-' || f.id, f.id, 'active',
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM families f
  WHERE f.id = 'legacy-family-' || lower(hex(NEW.creatorId)) || '-' || lower(hex(NEW.id));

  UPDATE dishes
  SET familyId = (
    SELECT fm.familyId
    FROM family_members fm
    JOIN families active_family
      ON active_family.id = fm.familyId AND active_family.status = 'active'
    WHERE fm.userId = NEW.creatorId AND fm.status = 'active'
    ORDER BY
      (fm.role = 'owner') DESC,
      (fm.role = 'admin') DESC,
      (fm.role = 'chef') DESC,
      fm.joinedAt,
      fm.familyId
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER bridge_legacy_appointments_family_insert
AFTER INSERT ON appointments
WHEN NEW.familyId IS NULL
BEGIN
  INSERT OR IGNORE INTO families (
    id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt
  )
  SELECT
    'legacy-family-' || lower(hex(u.id)) || '-' || lower(hex(NEW.id)),
    '我的家庭', 'Asia/Shanghai', 20, 'active', u.id,
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM users u
  WHERE u.id = NEW.userId
    AND NOT EXISTS (
      SELECT 1
      FROM family_members fm
      JOIN families active_family
        ON active_family.id = fm.familyId AND active_family.status = 'active'
      WHERE fm.userId = u.id AND fm.status = 'active'
    );

  INSERT OR IGNORE INTO family_members (
    familyId, userId, role, status, joinedAt, updatedAt
  )
  SELECT
    'legacy-family-' || lower(hex(u.id)) || '-' || lower(hex(NEW.id)),
    u.id, 'owner', 'active',
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM users u
  WHERE u.id = NEW.userId
    AND NOT EXISTS (
      SELECT 1
      FROM family_members fm
      JOIN families active_family
        ON active_family.id = fm.familyId AND active_family.status = 'active'
      WHERE fm.userId = u.id AND fm.status = 'active'
    );

  INSERT OR IGNORE INTO shopping_lists (
    id, familyId, status, createdAt, updatedAt
  )
  SELECT
    'shopping-' || f.id, f.id, 'active',
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM families f
  WHERE f.id = 'legacy-family-' || lower(hex(NEW.userId)) || '-' || lower(hex(NEW.id));

  UPDATE appointments
  SET familyId = (
    SELECT fm.familyId
    FROM family_members fm
    JOIN families active_family
      ON active_family.id = fm.familyId AND active_family.status = 'active'
    WHERE fm.userId = NEW.userId AND fm.status = 'active'
    ORDER BY
      (fm.role = 'owner') DESC,
      (fm.role = 'admin') DESC,
      (fm.role = 'chef') DESC,
      fm.joinedAt,
      fm.familyId
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER bridge_legacy_appointment_dishes_family_insert
AFTER INSERT ON appointment_dishes
BEGIN
  INSERT OR IGNORE INTO legacy_dish_clones (
    sourceDishId, targetFamilyId, clonedDishId
  )
  SELECT
    d.id, ap.familyId, 'legacy-clone-' || lower(hex(randomblob(16)))
  FROM appointments ap
  JOIN dishes d ON d.id = NEW.dishId
  JOIN families f ON f.id = ap.familyId AND f.status = 'active'
  WHERE ap.id = NEW.appointmentId AND ap.familyId <> d.familyId;

  INSERT OR IGNORE INTO dishes (
    id, name, type, spicy, images, steps, notice, remark, reference,
    creatorId, creatorOpenid, createTime, updateTime, familyId
  )
  SELECT
    c.clonedDishId,
    d.name, d.type, d.spicy, d.images, d.steps, d.notice, d.remark, d.reference,
    f.createdBy, u.openid, d.createTime, d.updateTime, ap.familyId
  FROM appointments ap
  JOIN dishes d ON d.id = NEW.dishId
  JOIN legacy_dish_clones c
    ON c.sourceDishId = d.id AND c.targetFamilyId = ap.familyId
  JOIN families f ON f.id = ap.familyId AND f.status = 'active'
  JOIN users u ON u.id = f.createdBy
  WHERE ap.id = NEW.appointmentId AND ap.familyId <> d.familyId;

  INSERT OR IGNORE INTO ingredients (
    id, dishId, name, amount, createTime, updateTime,
    ingredientId, quantity, unit, legacyAmount
  )
  SELECT
    'legacy-clone-ingredient-' || lower(hex(randomblob(16))),
    c.clonedDishId,
    i.name, i.amount, i.createTime, i.updateTime,
    i.ingredientId, i.quantity, i.unit, COALESCE(i.legacyAmount, i.amount)
  FROM appointments ap
  JOIN dishes d ON d.id = NEW.dishId
  JOIN legacy_dish_clones c
    ON c.sourceDishId = d.id AND c.targetFamilyId = ap.familyId
  JOIN ingredients i ON i.dishId = d.id
  JOIN families f ON f.id = ap.familyId AND f.status = 'active'
  WHERE ap.id = NEW.appointmentId
    AND ap.familyId <> d.familyId
    AND NOT EXISTS (SELECT 1 FROM ingredients existing WHERE existing.dishId = c.clonedDishId);

  UPDATE appointment_dishes
  SET dishId = (
    SELECT c.clonedDishId
    FROM appointments ap
    JOIN dishes d ON d.id = NEW.dishId
    JOIN legacy_dish_clones c
      ON c.sourceDishId = d.id AND c.targetFamilyId = ap.familyId
    JOIN families f ON f.id = ap.familyId AND f.status = 'active'
    WHERE ap.id = NEW.appointmentId AND ap.familyId <> d.familyId
  )
  WHERE id = NEW.id AND EXISTS (
    SELECT 1
    FROM appointments ap
    JOIN dishes d ON d.id = NEW.dishId
    JOIN legacy_dish_clones c
      ON c.sourceDishId = d.id AND c.targetFamilyId = ap.familyId
    JOIN dishes cloned
      ON cloned.id = c.clonedDishId AND cloned.familyId = ap.familyId
    JOIN families f ON f.id = ap.familyId AND f.status = 'active'
    WHERE ap.id = NEW.appointmentId AND ap.familyId <> d.familyId
  );
END;

CREATE TRIGGER bridge_legacy_reviews_family_insert
AFTER INSERT ON reviews
WHEN NEW.familyId IS NULL
BEGIN
  INSERT OR IGNORE INTO families (
    id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt
  )
  SELECT
    'legacy-family-' || lower(hex(u.id)) || '-' || lower(hex(NEW.id)),
    '我的家庭', 'Asia/Shanghai', 20, 'active', u.id,
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM users u
  WHERE u.id = NEW.userId
    AND NOT EXISTS (
      SELECT 1
      FROM family_members fm
      JOIN families active_family
        ON active_family.id = fm.familyId AND active_family.status = 'active'
      WHERE fm.userId = u.id AND fm.status = 'active'
    );

  INSERT OR IGNORE INTO family_members (
    familyId, userId, role, status, joinedAt, updatedAt
  )
  SELECT
    'legacy-family-' || lower(hex(u.id)) || '-' || lower(hex(NEW.id)),
    u.id, 'owner', 'active',
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM users u
  WHERE u.id = NEW.userId
    AND NOT EXISTS (
      SELECT 1
      FROM family_members fm
      JOIN families active_family
        ON active_family.id = fm.familyId AND active_family.status = 'active'
      WHERE fm.userId = u.id AND fm.status = 'active'
    );

  INSERT OR IGNORE INTO shopping_lists (
    id, familyId, status, createdAt, updatedAt
  )
  SELECT
    'shopping-' || f.id, f.id, 'active',
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM families f
  WHERE f.id = 'legacy-family-' || lower(hex(NEW.userId)) || '-' || lower(hex(NEW.id));

  UPDATE reviews
  SET familyId = COALESCE(
    (
      SELECT ap.familyId
      FROM appointments ap
      JOIN families appointment_family
        ON appointment_family.id = ap.familyId AND appointment_family.status = 'active'
      WHERE ap.id = NEW.appointmentId
    ),
    (
      SELECT fm.familyId
      FROM family_members fm
      JOIN families active_family
        ON active_family.id = fm.familyId AND active_family.status = 'active'
      WHERE fm.userId = NEW.userId AND fm.status = 'active'
      ORDER BY
        (fm.role = 'owner') DESC,
        (fm.role = 'admin') DESC,
        (fm.role = 'chef') DESC,
        fm.joinedAt,
        fm.familyId
      LIMIT 1
    )
  )
  WHERE id = NEW.id;

  INSERT OR IGNORE INTO legacy_dish_clones (
    sourceDishId, targetFamilyId, clonedDishId
  )
  SELECT
    d.id, r.familyId, 'legacy-clone-' || lower(hex(randomblob(16)))
  FROM reviews r
  JOIN dishes d ON d.id = NEW.dishId
  JOIN families f ON f.id = r.familyId AND f.status = 'active'
  WHERE r.id = NEW.id AND r.familyId <> d.familyId;

  INSERT OR IGNORE INTO dishes (
    id, name, type, spicy, images, steps, notice, remark, reference,
    creatorId, creatorOpenid, createTime, updateTime, familyId
  )
  SELECT
    c.clonedDishId,
    d.name, d.type, d.spicy, d.images, d.steps, d.notice, d.remark, d.reference,
    f.createdBy, u.openid, d.createTime, d.updateTime, r.familyId
  FROM reviews r
  JOIN dishes d ON d.id = NEW.dishId
  JOIN legacy_dish_clones c
    ON c.sourceDishId = d.id AND c.targetFamilyId = r.familyId
  JOIN families f ON f.id = r.familyId AND f.status = 'active'
  JOIN users u ON u.id = f.createdBy
  WHERE r.id = NEW.id AND r.familyId <> d.familyId;

  INSERT OR IGNORE INTO ingredients (
    id, dishId, name, amount, createTime, updateTime,
    ingredientId, quantity, unit, legacyAmount
  )
  SELECT
    'legacy-clone-ingredient-' || lower(hex(randomblob(16))),
    c.clonedDishId,
    i.name, i.amount, i.createTime, i.updateTime,
    i.ingredientId, i.quantity, i.unit, COALESCE(i.legacyAmount, i.amount)
  FROM reviews r
  JOIN dishes d ON d.id = NEW.dishId
  JOIN legacy_dish_clones c
    ON c.sourceDishId = d.id AND c.targetFamilyId = r.familyId
  JOIN ingredients i ON i.dishId = d.id
  JOIN families f ON f.id = r.familyId AND f.status = 'active'
  WHERE r.id = NEW.id
    AND r.familyId <> d.familyId
    AND NOT EXISTS (SELECT 1 FROM ingredients existing WHERE existing.dishId = c.clonedDishId);

  UPDATE reviews
  SET dishId = (
    SELECT c.clonedDishId
    FROM reviews r
    JOIN dishes d ON d.id = NEW.dishId
    JOIN legacy_dish_clones c
      ON c.sourceDishId = d.id AND c.targetFamilyId = r.familyId
    JOIN families f ON f.id = r.familyId AND f.status = 'active'
    WHERE r.id = NEW.id AND r.familyId <> d.familyId
  )
  WHERE id = NEW.id AND EXISTS (
    SELECT 1
    FROM reviews r
    JOIN dishes d ON d.id = NEW.dishId
    JOIN legacy_dish_clones c
      ON c.sourceDishId = d.id AND c.targetFamilyId = r.familyId
    JOIN dishes cloned
      ON cloned.id = c.clonedDishId AND cloned.familyId = r.familyId
    JOIN families f ON f.id = r.familyId AND f.status = 'active'
    WHERE r.id = NEW.id AND r.familyId <> d.familyId
  );
END;

CREATE TRIGGER bridge_legacy_inventory_family_insert
AFTER INSERT ON inventory_items
WHEN NEW.familyId IS NULL
BEGIN
  INSERT OR IGNORE INTO families (
    id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt
  )
  SELECT
    'legacy-family-' || lower(hex(u.id)) || '-' || lower(hex(NEW.id)),
    '我的家庭', 'Asia/Shanghai', 20, 'active', u.id,
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM users u
  WHERE u.id = NEW.userId
    AND NOT EXISTS (
      SELECT 1
      FROM family_members fm
      JOIN families active_family
        ON active_family.id = fm.familyId AND active_family.status = 'active'
      WHERE fm.userId = u.id AND fm.status = 'active'
    );

  INSERT OR IGNORE INTO family_members (
    familyId, userId, role, status, joinedAt, updatedAt
  )
  SELECT
    'legacy-family-' || lower(hex(u.id)) || '-' || lower(hex(NEW.id)),
    u.id, 'owner', 'active',
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM users u
  WHERE u.id = NEW.userId
    AND NOT EXISTS (
      SELECT 1
      FROM family_members fm
      JOIN families active_family
        ON active_family.id = fm.familyId AND active_family.status = 'active'
      WHERE fm.userId = u.id AND fm.status = 'active'
    );

  INSERT OR IGNORE INTO shopping_lists (
    id, familyId, status, createdAt, updatedAt
  )
  SELECT
    'shopping-' || f.id, f.id, 'active',
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM families f
  WHERE f.id = 'legacy-family-' || lower(hex(NEW.userId)) || '-' || lower(hex(NEW.id));

  UPDATE inventory_items
  SET familyId = (
    SELECT fm.familyId
    FROM family_members fm
    JOIN families active_family
      ON active_family.id = fm.familyId AND active_family.status = 'active'
    WHERE fm.userId = NEW.userId AND fm.status = 'active'
    ORDER BY
      (fm.role = 'owner') DESC,
      (fm.role = 'admin') DESC,
      (fm.role = 'chef') DESC,
      fm.joinedAt,
      fm.familyId
    LIMIT 1
  )
  WHERE id = NEW.id;
END;
