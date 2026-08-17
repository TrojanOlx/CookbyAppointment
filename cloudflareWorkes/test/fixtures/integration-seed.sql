PRAGMA foreign_keys = ON;

DELETE FROM operation_locks WHERE scope LIKE '%it-%';
DELETE FROM idempotency_keys WHERE familyId LIKE 'it-%';
DELETE FROM family_invitations WHERE familyId LIKE 'it-%';
DELETE FROM shopping_item_sources
WHERE itemId IN (SELECT id FROM shopping_list_items WHERE id LIKE 'it-%')
   OR appointmentId LIKE 'it-%';
DELETE FROM shopping_list_items
WHERE id LIKE 'it-%' OR shoppingListId IN (SELECT id FROM shopping_lists WHERE id LIKE 'it-%');
DELETE FROM appointment_diners WHERE appointmentId LIKE 'it-%';
DELETE FROM appointment_dishes WHERE appointmentId LIKE 'it-%';
DELETE FROM reviews WHERE id LIKE 'it-%' OR familyId LIKE 'it-%';
DELETE FROM appointments WHERE id LIKE 'it-%';
DELETE FROM ingredients WHERE id LIKE 'it-%' OR dishId LIKE 'it-%';
DELETE FROM dishes WHERE id LIKE 'it-%';
DELETE FROM inventory_items WHERE id LIKE 'it-%' OR familyId LIKE 'it-%';
DELETE FROM family_files WHERE id LIKE 'it-%' OR familyId LIKE 'it-%';
DELETE FROM audit_events WHERE id LIKE 'it-%' OR familyId LIKE 'it-%';
DELETE FROM family_members WHERE familyId LIKE 'it-%';
DELETE FROM shopping_lists WHERE id LIKE 'it-%' OR familyId LIKE 'it-%';
DELETE FROM families WHERE id LIKE 'it-%';
DELETE FROM user_sessions WHERE id LIKE 'it-%';
DELETE FROM ingredient_catalog WHERE id LIKE 'it-%';
DELETE FROM api_rate_limits WHERE scope LIKE '%it-%';
DELETE FROM users WHERE id LIKE 'it-%';

INSERT OR REPLACE INTO users (id, openid, nickName, avatarUrl, gender, country, province, city, language, isAdmin, createTime, updateTime)
VALUES
  ('it-owner-a', 'openid-owner-a', '家庭A主人', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000),
  ('it-owner-b', 'openid-owner-b', '家庭B主人', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000),
  ('it-member-a', 'openid-member-a', '家庭A成员', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000),
  ('it-shared', 'openid-shared', '重叠成员', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000),
  ('it-rejoin', 'openid-rejoin', '重新加入成员', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000),
  ('it-invitee', 'openid-invitee', '待邀请成员', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000),
  ('it-dissolved', 'openid-dissolved', '已解散家庭成员', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000),
  ('it-limit-owner', 'openid-limit-owner', '人数上限家庭主', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000),
  ('it-limit-a', 'openid-limit-a', '人数上限成员A', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000),
  ('it-limit-b', 'openid-limit-b', '人数上限成员B', '', 0, '', '', '', 'zh_CN', 0, 1700000000000, 1700000000000);

INSERT OR REPLACE INTO families (id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt)
VALUES
  ('it-family-a', '集成家庭A', 'Asia/Shanghai', 20, 'active', 'it-owner-a', 1700000000000, 1700000000000),
  ('it-family-b', '集成家庭B', 'Asia/Shanghai', 20, 'active', 'it-owner-b', 1700000000000, 1700000000000),
  ('it-family-dissolved', '已解散家庭', 'Asia/Shanghai', 20, 'dissolved', 'it-dissolved', 1700000000000, 1700000000000),
  ('it-family-limit', '人数上限家庭', 'Asia/Shanghai', 2, 'active', 'it-limit-owner', 1700000000000, 1700000000000);

INSERT OR REPLACE INTO family_members (familyId, userId, role, status, joinedAt, updatedAt)
VALUES
  ('it-family-a', 'it-owner-a', 'owner', 'active', 1700000000000, 1700000000000),
  ('it-family-a', 'it-member-a', 'member', 'active', 1700000000000, 1700000000000),
  ('it-family-a', 'it-shared', 'member', 'active', 1700000000000, 1700000000000),
  ('it-family-a', 'it-rejoin', 'member', 'left', 1700000000000, 1700000000000),
  ('it-family-b', 'it-owner-b', 'owner', 'active', 1700000000000, 1700000000000),
  ('it-family-b', 'it-shared', 'chef', 'active', 1700000000000, 1700000000000),
  ('it-family-dissolved', 'it-dissolved', 'owner', 'active', 1700000000000, 1700000000000),
  ('it-family-limit', 'it-limit-owner', 'owner', 'active', 1700000000000, 1700000000000);

INSERT OR REPLACE INTO user_sessions (id, userId, tokenHash, createdAt, expiresAt, lastSeenAt)
VALUES
  ('it-session-owner-a', 'it-owner-a', '9bf6312ec64f6e50c45cd0e5fa498ea1e97a1f0287e4d88c5eab6f11e6ce72d4', 1700000000000, 4102444800000, 1700000000000),
  ('it-session-owner-b', 'it-owner-b', 'bd7e2cea2c303bd7832983732ba94eec79b1901e5081e2ce8c52eb3974ec428b', 1700000000000, 4102444800000, 1700000000000),
  ('it-session-member-a', 'it-member-a', '6ce0711b7f3f72217f1e16fbb0975f78870b8c35d0eda63ed5e32f294b657c7b', 1700000000000, 4102444800000, 1700000000000),
  ('it-session-shared', 'it-shared', 'c3bc939b8b5809350371c563c13d4c9eb5fcc4b4f19feef84d24a6cb2cd02c5a', 1700000000000, 4102444800000, 1700000000000),
  ('it-session-rejoin', 'it-rejoin', '8ad767a031ec939b61b8d30a9912256b5cd8c8caeb6f1cf1497514ed1687ce10', 1700000000000, 4102444800000, 1700000000000),
  ('it-session-invitee', 'it-invitee', '3aee677c476910a803dcaef94838fd16042bcf9cd0004a080d49e051b3261259', 1700000000000, 4102444800000, 1700000000000),
  ('it-session-dissolved', 'it-dissolved', 'a3be1c0d4b2121e9ba6ba73e4ecb211158d5ed4668b34922c5a96e39f9ba4510', 1700000000000, 4102444800000, 1700000000000),
  ('it-session-limit-owner', 'it-limit-owner', '8d42bc3f3207d45c93f236536ea146ee8ec06e6b6ec9e109ade3ff7f70ac303b', 1700000000000, 4102444800000, 1700000000000),
  ('it-session-limit-a', 'it-limit-a', '24faa8803ad1e4b946e3ad04996e2d3f3ec5d8374376b62cc35233114c67dc1a', 1700000000000, 4102444800000, 1700000000000),
  ('it-session-limit-b', 'it-limit-b', '8e99ef794b674cb18ac511a29eaa81ae101df622ab1bf66c325fb9acb3b6fea6', 1700000000000, 4102444800000, 1700000000000);

INSERT INTO family_invitations (id, familyId, role, tokenHash, createdBy, createdAt, expiresAt)
VALUES (
  'it-invite-expired', 'it-family-a', 'member',
  '0e6f05e3118197510262475b1cf1102a721370972801a1a32b2f065426dbd2e1',
  'it-owner-a', 1700000000000, 1700000001000
);

INSERT OR REPLACE INTO family_files (
  id, familyId, objectKey, name, contentType, size, purpose, uploadedBy, createdAt, deletedAt
)
VALUES (
  'it-file-a', 'it-family-a', 'families/it-family-a/test/dish.jpg', 'dish.jpg',
  'image/jpeg', 128, 'dish', 'it-owner-a', 1700000000000, NULL
);

INSERT OR REPLACE INTO dishes (id, name, type, spicy, images, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime, familyId)
VALUES
  ('it-dish-a', '家庭A菜品', '家常菜', '不辣', '["/api/file/download?id=it-file-a"]', '[]', '', '', '', 'it-owner-a', 'openid-owner-a', 1700000000000, 1700000000000, 'it-family-a'),
  ('it-dish-b', '家庭B菜品', '家常菜', '不辣', '["/api/file/download?id=it-file-a"]', '[]', '', '', '', 'it-owner-b', 'openid-owner-b', 1700000000000, 1700000000000, 'it-family-b'),
  ('it-dish-mixed', '混合食材菜品', '家常菜', '不辣', '[]', '[]', '', '', '', 'it-limit-owner', 'openid-limit-owner', 1700000000000, 1700000000000, 'it-family-limit');

INSERT OR REPLACE INTO ingredient_catalog (id, canonicalName, category, defaultUnit, createdAt, updatedAt)
VALUES
  ('it-ingredient-potato', '土豆', '蔬菜', 'kg', 1700000000000, 1700000000000),
  ('it-ingredient-tofu', '豆腐', '豆制品', 'kg', 1700000000000, 1700000000000);

INSERT OR REPLACE INTO ingredients (
  id, dishId, name, amount, createTime, updateTime, ingredientId, quantity, unit, legacyAmount
)
VALUES (
  'it-dish-a-potato', 'it-dish-a', '土豆', '0.25kg', 1700000000000, 1700000000000,
  'it-ingredient-potato', 0.25, 'kg', NULL
), (
  'it-dish-a-onion', 'it-dish-a', '洋葱', '0.5kg', 1700000000000, 1700000000000,
  NULL, 0.5, 'kg', NULL
), (
  'it-dish-mixed-catalog', 'it-dish-mixed', '豆腐', '1kg', 1700000000000, 1700000000000,
  'it-ingredient-tofu', 1, 'kg', NULL
), (
  'it-dish-mixed-legacy', 'it-dish-mixed', '豆腐', '1kg', 1700000000000, 1700000000000,
  NULL, 1, 'kg', NULL
);

INSERT OR REPLACE INTO appointments (
  id, userId, openid, date, mealType, status, remarks, createTime, updateTime,
  familyId, preferenceWarnings, warningsAcknowledged
)
VALUES (
  'it-appointment-a', 'it-owner-a', 'openid-owner-a', '2026-08-17', '晚餐', '已确认', '',
  1700000000000, 1700000000000, 'it-family-a', '[]', 1
), (
  'it-appointment-idempotent-b', 'it-owner-a', 'openid-owner-a', '2026-08-18', '午餐', '待确认', '',
  1700000000000, 1700000000000, 'it-family-a', '[]', 0
), (
  'it-appointment-idempotent-c', 'it-owner-a', 'openid-owner-a', '2026-08-19', '晚餐', '已确认', '',
  1700000000000, 1700000000000, 'it-family-a', '[]', 1
), (
  'it-appointment-lock-b', 'it-owner-b', 'openid-owner-b', '2026-08-20', '晚餐', '待确认', '',
  1700000000000, 1700000000000, 'it-family-b', '[]', 0
), (
  'it-appointment-mixed', 'it-limit-owner', 'openid-limit-owner', '2026-08-21', '午餐', '已确认', '',
  1700000000000, 1700000000000, 'it-family-limit', '[]', 1
);

INSERT OR REPLACE INTO appointment_dishes (id, appointmentId, dishId, createTime)
VALUES
  ('it-appointment-dish-a', 'it-appointment-a', 'it-dish-a', 1700000000000),
  ('it-appointment-dish-idempotent-b', 'it-appointment-idempotent-b', 'it-dish-a', 1700000000000),
  ('it-appointment-dish-idempotent-c', 'it-appointment-idempotent-c', 'it-dish-a', 1700000000000),
  ('it-appointment-dish-lock-b', 'it-appointment-lock-b', 'it-dish-b', 1700000000000),
  ('it-appointment-dish-mixed', 'it-appointment-mixed', 'it-dish-mixed', 1700000000000);

INSERT OR REPLACE INTO inventory_items (
  id, userId, openid, name, amount, category, status, putInDate, expiryDate, image, remarks,
  createTime, updateTime, familyId, quantity, unit
)
VALUES
  ('it-stock-a', 'it-owner-a', 'openid-owner-a', '土豆', '1kg', '蔬菜', '正常', '2026-08-17', '2026-08-20', NULL, '', 1700000000000, 1700000000000, 'it-family-a', 1, 'kg'),
  ('it-stock-b', 'it-owner-b', 'openid-owner-b', '番茄', '2kg', '蔬菜', '正常', '2026-08-17', '2026-08-20', NULL, '', 1700000000000, 1700000000000, 'it-family-b', 2, 'kg'),
  ('it-stock-mixed', 'it-limit-owner', 'openid-limit-owner', '豆腐', '1kg', '豆制品', '正常', '2026-08-17', '2026-08-20', NULL, '', 1700000000000, 1700000000000, 'it-family-limit', 1, 'kg');

INSERT OR IGNORE INTO shopping_lists (id, familyId, status, createdAt, updatedAt)
VALUES
  ('it-shopping-a', 'it-family-a', 'active', 1700000000000, 1700000000000),
  ('it-shopping-b', 'it-family-b', 'active', 1700000000000, 1700000000000),
  ('it-shopping-limit', 'it-family-limit', 'active', 1700000000000, 1700000000000);

INSERT OR REPLACE INTO shopping_list_items (
  id, shoppingListId, ingredientId, name, quantity, unit, legacyAmount, sourceType,
  assigneeId, checked, purchasedAt, stockedAt, createdBy, createdAt, updatedAt
)
VALUES (
  'it-shopping-stock-a', 'it-shopping-a', NULL, '大米', 1, 'kg', NULL, 'manual',
  NULL, 1, 1700000000000, NULL, 'it-owner-a', 1700000000000, 1700000000000
);

INSERT OR REPLACE INTO operation_locks (scope, token, expiresAt)
VALUES (
  'family:it-family-b:shopping', 'it-shopping-lock',
  CAST(unixepoch('now') AS INTEGER) * 1000 + 60000
);
