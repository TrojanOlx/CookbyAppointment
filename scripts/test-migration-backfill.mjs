import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { unstable_splitSqlQuery } from 'wrangler';

const root = new URL('..', import.meta.url);
const migrationsDirectory = new URL('cloudflareWorkes/migrations/', root);
const migrationFiles = readdirSync(migrationsDirectory)
  .filter(name => name.endsWith('.sql'))
  .sort();

function assert(condition, message, details) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
}

function migrationSql(name) {
  return readFileSync(new URL(name, migrationsDirectory), 'utf8');
}

function applyMigration(db, name) {
  const statements = unstable_splitSqlQuery(migrationSql(name));
  assert(statements.length > 0, 'Wrangler did not split migration statements', { name });
  for (const statement of statements) {
    const executable = statement
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    if (executable) db.prepare(statement).run();
  }
}

const db = new DatabaseSync(':memory:');
applyMigration(db, '0000_legacy_baseline.sql');
db.exec(`
  INSERT INTO users (
    id, openid, nickName, gender, country, province, city, language,
    isAdmin, createTime, updateTime
  ) VALUES
    ('e57743c5-7d24-4435-97eb-9a6d0dfffd23', 'openid-owner', 'Trojan-X', 0, '', '', '', 'zh_CN', 1, 1, 1),
    ('8f1e0e34-7dff-4687-8c69-657e12efeee9', 'openid-member', 'balabalabiubiu', 0, '', '', '', 'zh_CN', 0, 2, 2),
    ('other-user', 'openid-other', '其他用户', 0, '', '', '', 'zh_CN', 0, 3, 3);

  INSERT INTO dishes (
    id, name, type, spicy, notice, remark, reference, createTime, updateTime
  ) VALUES ('legacy-dish', '旧菜谱', '其他', '不辣', '', '', '', 1, 1);
  INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
  VALUES ('legacy-ingredient', 'legacy-dish', '豆腐', '1块', 1, 1);

  INSERT INTO appointments (
    id, userId, openid, date, mealType, status, remarks, createTime, updateTime
  ) VALUES
    ('shared-appointment', '8f1e0e34-7dff-4687-8c69-657e12efeee9', 'openid-member', '2026-08-17', '晚餐', '待确认', '', 1, 1),
    ('other-appointment', 'other-user', 'openid-other', '2026-08-17', '晚餐', '待确认', '', 1, 1);
  INSERT INTO appointment_dishes (id, appointmentId, dishId, createTime) VALUES
    ('shared-link', 'shared-appointment', 'legacy-dish', 1),
    ('other-link', 'other-appointment', 'legacy-dish', 1);
  INSERT INTO reviews (
    id, appointmentId, userId, openid, dishId, rating, content, createTime, updateTime
  ) VALUES ('other-review', 'other-appointment', 'other-user', 'openid-other', 'legacy-dish', 5, '', 1, 1);
`);

for (const name of migrationFiles.slice(1)) applyMigration(db, name);

const counts = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM families) AS families,
    (SELECT COUNT(*) FROM family_members) AS members,
    (SELECT COUNT(*) FROM shopping_lists WHERE status = 'active') AS shoppingLists,
    (SELECT COUNT(*) FROM dishes) AS dishes,
    (SELECT COUNT(*) FROM ingredients) AS ingredients,
    (SELECT COUNT(*) FROM recipe_templates WHERE status = 'active') AS recipeTemplates,
    (SELECT COUNT(*) FROM recipe_template_ingredients) AS templateIngredients,
    (SELECT COUNT(*) FROM platform_admins WHERE userId = 'e57743c5-7d24-4435-97eb-9a6d0dfffd23' AND status = 'active') AS platformAdmins,
    (SELECT COUNT(*) FROM users WHERE status = 'active') AS activeUsers
`).get();
assert(
  counts.families === 2
    && counts.members === 3
    && counts.shoppingLists === 2
    && counts.dishes === 2
    && counts.ingredients === 2
    && counts.recipeTemplates === 10
    && counts.templateIngredients === 31
    && counts.platformAdmins === 1
    && counts.activeUsers === 3,
  'legacy backfill counts are incorrect',
  counts,
);

const templateCoverage = db.prepare(`
  SELECT type, COUNT(*) AS count
  FROM recipe_templates
  WHERE status = 'active'
  GROUP BY type
  ORDER BY type
`).all();
assert(
  templateCoverage.length === 5 && templateCoverage.every(row => row.count === 2),
  'public recipe templates do not cover every menu category evenly',
  templateCoverage,
);

const sharedMembers = db.prepare(`
  SELECT userId, role FROM family_members
  WHERE familyId = 'legacy-family' ORDER BY userId
`).all();
assert(
  sharedMembers.some(row => row.userId === 'e57743c5-7d24-4435-97eb-9a6d0dfffd23' && row.role === 'owner')
    && sharedMembers.some(row => row.userId === '8f1e0e34-7dff-4687-8c69-657e12efeee9' && row.role === 'member')
    && sharedMembers.length === 2,
  'confirmed shared household mapping is incorrect',
  sharedMembers,
);

const otherMembership = db.prepare(`
  SELECT familyId, role FROM family_members WHERE userId = 'other-user'
`).get();
assert(
  otherMembership.familyId === 'legacy-family-other-user' && otherMembership.role === 'owner',
  'independent legacy user did not receive a personal household',
  otherMembership,
);

const tenantViolations = db.prepare(`
  SELECT
    (SELECT COUNT(*)
     FROM appointment_dishes ad
     JOIN appointments ap ON ap.id = ad.appointmentId
     JOIN dishes d ON d.id = ad.dishId
     WHERE ap.familyId <> d.familyId) AS appointmentDishes,
    (SELECT COUNT(*)
     FROM reviews r JOIN dishes d ON d.id = r.dishId
     WHERE r.familyId <> d.familyId) AS reviews
`).get();
assert(
  tenantViolations.appointmentDishes === 0 && tenantViolations.reviews === 0,
  'legacy dish relations cross household boundaries',
  tenantViolations,
);

db.exec(`
  INSERT INTO users (
    id, openid, nickName, gender, country, province, city, language,
    isAdmin, createTime, updateTime
  ) VALUES ('compat-user', 'openid-compat', '兼容用户', 0, '', '', '', 'zh_CN', 0, 4, 4);
  INSERT INTO dishes (
    id, name, type, spicy, notice, remark, reference,
    creatorId, creatorOpenid, createTime, updateTime
  ) VALUES ('compat-dish', '兼容菜谱', '其他', '不辣', '', '', '', 'compat-user', 'openid-compat', 4, 4);
`);
const compatibility = db.prepare(`
  SELECT d.familyId, fm.role
  FROM dishes d
  JOIN family_members fm ON fm.familyId = d.familyId AND fm.userId = 'compat-user'
  WHERE d.id = 'compat-dish'
`).get();
assert(
  compatibility.familyId.startsWith('legacy-family-') && compatibility.role === 'owner',
  'legacy compatibility write was not assigned to a personal household',
  compatibility,
);

db.exec(`
  UPDATE families SET status = 'dissolved', dissolvedAt = 5
  WHERE id = 'legacy-family-other-user';
  INSERT INTO inventory_items (
    id, userId, openid, name, amount, category, status, remarks, createTime, updateTime
  ) VALUES ('post-dissolve-stock', 'other-user', 'openid-other', '新家庭库存', '1个', '其他', '正常', '', 5, 5);
`);
const postDissolveFamily = db.prepare(`
  SELECT i.familyId, f.status, fm.role
  FROM inventory_items i
  JOIN families f ON f.id = i.familyId
  JOIN family_members fm ON fm.familyId = f.id AND fm.userId = i.userId
  WHERE i.id = 'post-dissolve-stock'
`).get();
assert(
  postDissolveFamily.familyId !== 'legacy-family-other-user'
    && postDissolveFamily.status === 'active'
    && postDissolveFamily.role === 'owner',
  'legacy write was routed into a dissolved household',
  postDissolveFamily,
);

db.exec(`
  INSERT INTO appointments (
    id, userId, openid, date, mealType, status, remarks, createTime, updateTime
  ) VALUES ('compat-cross-appointment', 'other-user', 'openid-other', '2026-08-18', '晚餐', '待确认', '', 6, 6);
  INSERT INTO appointment_dishes (id, appointmentId, dishId, createTime)
  VALUES ('compat-cross-link', 'compat-cross-appointment', 'legacy-dish', 6);
  INSERT INTO reviews (
    id, appointmentId, userId, openid, dishId, rating, content, createTime, updateTime
  ) VALUES ('compat-cross-review', 'compat-cross-appointment', 'other-user', 'openid-other', 'legacy-dish', 5, '', 6, 6);
`);
const compatibilityViolations = db.prepare(`
  SELECT
    (SELECT COUNT(*)
     FROM appointment_dishes ad
     JOIN appointments ap ON ap.id = ad.appointmentId
     JOIN dishes d ON d.id = ad.dishId
     WHERE ap.familyId <> d.familyId) AS appointmentDishes,
    (SELECT COUNT(*)
     FROM reviews r JOIN dishes d ON d.id = r.dishId
     WHERE r.familyId <> d.familyId) AS reviews
`).get();
assert(
  compatibilityViolations.appointmentDishes === 0 && compatibilityViolations.reviews === 0,
  'legacy compatibility relations cross household boundaries',
  compatibilityViolations,
);

const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all();
assert(foreignKeyViolations.length === 0, 'migration introduced foreign key violations', foreignKeyViolations);

const userFileColumns = db.prepare('PRAGMA table_info(user_files)').all().map(column => column.name);
assert(
  ['id', 'userId', 'objectKey', 'contentType', 'size', 'purpose', 'deletedAt']
    .every(column => userFileColumns.includes(column)),
  'personal avatar file table is incomplete',
  userFileColumns,
);

const familyFileColumns = db.prepare('PRAGMA table_info(family_files)').all().map(column => column.name);
assert(
  ['targetType', 'targetId', 'attachedAt', 'expiresAt'].every(column => familyFileColumns.includes(column)),
  'family upload binding columns are incomplete',
  familyFileColumns,
);

console.log('Production-style migration backfill checks passed (12 assertions).');
