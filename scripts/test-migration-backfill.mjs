import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { unstable_splitSqlQuery } from 'wrangler';

const root = new URL('..', import.meta.url);
const migrationsDirectory = new URL('cloudflareWorkes/migrations/', root);
const recipeTemplateAssetsDirectory = new URL('cloudflareWorkes/assets/recipe-templates/v1/', root);
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
    if (executable) db.exec(statement);
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
    ('other-appointment', 'other-user', 'openid-other', '2026-08-17', '晚餐', '待确认', '', 1, 1),
    ('completed-with-diner', 'e57743c5-7d24-4435-97eb-9a6d0dfffd23', 'openid-owner', '2026-08-15', '午餐', '已完成', '', 7, 8),
    ('completed-fallback', 'other-user', 'openid-other', '2026-08-16', '晚餐', '已完成', '', 9, 10);
  INSERT INTO appointment_dishes (id, appointmentId, dishId, createTime) VALUES
    ('shared-link', 'shared-appointment', 'legacy-dish', 1),
    ('other-link', 'other-appointment', 'legacy-dish', 1),
    ('completed-with-diner-link', 'completed-with-diner', 'legacy-dish', 7),
    ('completed-fallback-link', 'completed-fallback', 'legacy-dish', 9);
  INSERT INTO reviews (
    id, appointmentId, userId, openid, dishId, rating, content, createTime, updateTime
  ) VALUES ('other-review', 'other-appointment', 'other-user', 'openid-other', 'legacy-dish', 5, '', 1, 1);
`);

for (const name of migrationFiles.slice(1).filter(name => ![
  '0015_meal_history_achievements.sql',
  '0016_recipe_template_image_fallback.sql',
].includes(name))) {
  applyMigration(db, name);
}
applyMigration(db, '0013_more_recipe_templates.sql');
applyMigration(db, '0014_recipe_template_images.sql');
db.exec(`
  INSERT INTO appointment_diners (appointmentId, userId, preferenceSnapshot, createdAt)
  VALUES ('completed-with-diner', '8f1e0e34-7dff-4687-8c69-657e12efeee9', '[]', 8);

  INSERT INTO users (
    id, openid, nickName, gender, country, province, city, language,
    isAdmin, createTime, updateTime
  ) VALUES
    ('backfill-owner', 'openid-backfill-owner', '回填家庭主', 0, '', '', '', 'zh_CN', 0, 11, 11),
    ('backfill-left', 'openid-backfill-left', '已离开成员', 0, '', '', '', 'zh_CN', 0, 12, 12),
    ('backfill-invalid', 'openid-backfill-invalid', '其他家庭成员', 0, '', '', '', 'zh_CN', 0, 13, 13);

  INSERT INTO families (
    id, name, timezone, memberLimit, status, createdBy, createdAt, updatedAt
  ) VALUES
    ('backfill-family', '回填测试家庭', 'Asia/Shanghai', 20, 'active', 'backfill-owner', 11, 11),
    ('backfill-foreign-family', '其他测试家庭', 'Asia/Shanghai', 20, 'active', 'backfill-invalid', 13, 13);

  INSERT INTO family_members (familyId, userId, role, status, joinedAt, updatedAt)
  VALUES
    ('backfill-family', 'backfill-owner', 'owner', 'active', 11, 11),
    ('backfill-family', 'backfill-left', 'member', 'left', 12, 12),
    ('backfill-foreign-family', 'backfill-invalid', 'member', 'active', 13, 13);

  INSERT INTO dishes (
    id, name, type, spicy, images, steps, notice, remark, reference,
    creatorId, creatorOpenid, createTime, updateTime, familyId
  ) VALUES
    ('backfill-local-dish', '回填本家庭菜', '家常菜', '不辣', '["local.jpg"]', '[]', '', '', '', 'backfill-owner', 'openid-backfill-owner', 11, 11, 'backfill-family'),
    ('backfill-foreign-dish', '回填他家菜', '家常菜', '不辣', '["foreign.jpg"]', '[]', '', '', '', 'backfill-invalid', 'openid-backfill-invalid', 13, 13, 'backfill-foreign-family');

  INSERT INTO appointments (
    id, userId, openid, familyId, date, mealType, status, remarks, createTime, updateTime
  ) VALUES
    ('backfill-left-diner', 'backfill-owner', 'openid-backfill-owner', 'backfill-family', '2026-08-12', '午餐', '已完成', '', 21, 22),
    ('backfill-invalid-diner', 'backfill-owner', 'openid-backfill-owner', 'backfill-family', '2026-08-13', '晚餐', '已完成', '', 23, 24),
    ('backfill-left-owner', 'backfill-left', 'openid-backfill-left', 'backfill-family', '2026-08-14', '早餐', '已完成', '', 25, 26),
    ('dissolved-appointment', 'backfill-invalid', 'openid-backfill-invalid', 'backfill-foreign-family', '2026-08-11', '晚餐', '已完成', '', 27, 28);

  INSERT INTO appointment_dishes (id, appointmentId, dishId, createTime) VALUES
    ('backfill-left-local-link', 'backfill-left-diner', 'backfill-local-dish', 21),
    ('backfill-left-foreign-link', 'backfill-left-diner', 'backfill-local-dish', 21),
    ('backfill-invalid-link', 'backfill-invalid-diner', 'backfill-local-dish', 23),
    ('backfill-left-owner-link', 'backfill-left-owner', 'backfill-local-dish', 25),
    ('dissolved-link', 'dissolved-appointment', 'backfill-foreign-dish', 27);
  -- The legacy bridge only normalizes cross-family links on INSERT.  Updating
  -- an existing link lets this test preserve a deliberately dirty relation.
  UPDATE appointment_dishes
  SET dishId = 'backfill-foreign-dish'
  WHERE id = 'backfill-left-foreign-link';

  INSERT INTO appointment_diners (appointmentId, userId, preferenceSnapshot, createdAt)
  VALUES
    ('backfill-left-diner', 'backfill-left', '[]', 22),
    ('backfill-invalid-diner', 'backfill-invalid', '[]', 24),
    ('dissolved-appointment', 'backfill-invalid', '[]', 28);

  UPDATE families SET status = 'dissolved', dissolvedAt = 28, updatedAt = 28
  WHERE id = 'backfill-foreign-family';
`);
applyMigration(db, '0015_meal_history_achievements.sql');
applyMigration(db, '0016_recipe_template_image_fallback.sql');

const assetManifest = JSON.parse(readFileSync(new URL('manifest.json', recipeTemplateAssetsDirectory), 'utf8'));
const assetIds = new Set(assetManifest.assets.map(asset => asset.fileId));
const templateIds = new Set(assetManifest.assets.map(asset => asset.templateId));
assert(
  assetManifest.version === 1
    && assetManifest.temporary === true
    && assetManifest.assets.length === 30
    && assetIds.size === 30
    && templateIds.size === 30,
  'recipe template image manifest is incomplete',
  { version: assetManifest.version, assets: assetManifest.assets.length, assetIds: assetIds.size, templateIds: templateIds.size },
);
for (const asset of assetManifest.assets) {
  const assetUrl = new URL(asset.fileName, recipeTemplateAssetsDirectory);
  const bytes = readFileSync(assetUrl);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert(
    statSync(assetUrl).size === asset.size
      && sha256 === asset.sha256
      && asset.contentType === 'image/jpeg'
      && asset.objectKey === `platform/recipe-templates/seed/v1/${asset.fileName}`,
    'recipe template image does not match its manifest entry',
    { fileName: asset.fileName, size: bytes.length, sha256 },
  );
}

const counts = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM families) AS families,
    (SELECT COUNT(*) FROM family_members) AS members,
    (SELECT COUNT(*) FROM shopping_lists WHERE status = 'active') AS shoppingLists,
    (SELECT COUNT(*) FROM dishes) AS dishes,
    (SELECT COUNT(*) FROM ingredients) AS ingredients,
    (SELECT COUNT(*) FROM recipe_templates WHERE status = 'active') AS recipeTemplates,
    (SELECT COUNT(*) FROM recipe_template_ingredients) AS templateIngredients,
    (SELECT COUNT(*) FROM platform_files WHERE purpose = 'recipe-template' AND deletedAt IS NULL) AS platformFiles,
    (SELECT COUNT(*) FROM platform_admins WHERE userId = 'e57743c5-7d24-4435-97eb-9a6d0dfffd23' AND status = 'active') AS platformAdmins,
    (SELECT COUNT(*) FROM users WHERE status = 'active') AS activeUsers
`).get();
assert(
  counts.families === 4
    && counts.members === 6
    && counts.shoppingLists === 2
    && counts.dishes === 4
    && counts.ingredients === 2
    && counts.recipeTemplates === 30
    && counts.templateIngredients === 91
    && counts.platformFiles === 30
    && counts.platformAdmins === 1
    && counts.activeUsers === 6,
  'legacy backfill counts are incorrect',
  counts,
);

const templateImageCoverage = db.prepare(`
  SELECT
    COUNT(*) AS imageCount,
    COUNT(DISTINCT rt.id) AS templateCount,
    SUM(CASE WHEN pf.id IS NULL THEN 1 ELSE 0 END) AS missingFiles,
    SUM(CASE WHEN pf.contentType <> 'image/jpeg' OR pf.size <= 0 THEN 1 ELSE 0 END) AS invalidFiles
  FROM recipe_templates rt
  JOIN json_each(CASE WHEN json_valid(rt.images) THEN rt.images ELSE '[]' END) image
  LEFT JOIN platform_files pf
    ON image.value = '/api/platform/template-assets/' || pf.id
    AND pf.deletedAt IS NULL
  WHERE rt.status = 'active'
`).get();
assert(
  templateImageCoverage.imageCount === 30
    && templateImageCoverage.templateCount === 30
    && templateImageCoverage.missingFiles === 0
    && templateImageCoverage.invalidFiles === 0,
  'public recipe template image coverage is incomplete',
  templateImageCoverage,
);

const templateCoverage = db.prepare(`
  SELECT type, COUNT(*) AS count
  FROM recipe_templates
  WHERE status = 'active'
  GROUP BY type
  ORDER BY type
`).all();
assert(
  templateCoverage.length === 5 && templateCoverage.every(row => row.count === 6),
  'public recipe templates do not cover every menu category evenly',
  templateCoverage,
);

const invalidTemplates = db.prepare(`
  SELECT rt.id, rt.templateKey, COUNT(rti.id) AS ingredientCount
  FROM recipe_templates rt
  LEFT JOIN recipe_template_ingredients rti ON rti.templateId = rt.id
  WHERE rt.status = 'active'
  GROUP BY rt.id, rt.templateKey
  HAVING ingredientCount < 2
`).all();
const duplicateTemplateKeys = db.prepare(`
  SELECT templateKey, COUNT(*) AS count
  FROM recipe_templates
  GROUP BY templateKey
  HAVING count > 1
`).all();
assert(
  invalidTemplates.length === 0 && duplicateTemplateKeys.length === 0,
  'public recipe templates must have unique keys and structured ingredients',
  { invalidTemplates, duplicateTemplateKeys },
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
     WHERE ap.familyId <> d.familyId
       AND ad.id NOT LIKE 'backfill-%') AS appointmentDishes,
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
     WHERE ap.familyId <> d.familyId
       AND ad.id NOT LIKE 'backfill-%') AS appointmentDishes,
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

const mealBackfill = db.prepare(`
  SELECT id, appointmentId, date, mealType, frozenAt, legacyBackfilled
  FROM meal_records ORDER BY appointmentId
`).all();
assert(
  mealBackfill.length === 6
    && mealBackfill.every(row => row.id === `appointment:${row.appointmentId}` && row.legacyBackfilled === 1)
    && mealBackfill.some(row => row.appointmentId === 'completed-with-diner' && row.date === '2026-08-15' && row.mealType === '午餐')
    && mealBackfill.some(row => row.appointmentId === 'completed-fallback' && row.date === '2026-08-16' && row.mealType === '晚餐')
    && mealBackfill.some(row => row.appointmentId === 'backfill-left-diner' && row.date === '2026-08-12' && row.mealType === '午餐')
    && mealBackfill.some(row => row.appointmentId === 'backfill-invalid-diner' && row.date === '2026-08-13' && row.mealType === '晚餐')
    && mealBackfill.some(row => row.appointmentId === 'backfill-left-owner' && row.date === '2026-08-14' && row.mealType === '早餐')
    && mealBackfill.some(row => row.appointmentId === 'dissolved-appointment' && row.frozenAt === 28),
  'completed appointments were not deterministically backfilled',
  mealBackfill,
);

const backfilledParticipants = db.prepare(`
  SELECT mr.appointmentId, p.userId, p.legacyFallback, p.frozenAt
  FROM meal_record_participants p
  JOIN meal_records mr ON mr.id = p.mealRecordId
  ORDER BY mr.appointmentId, p.userId
`).all();
const participantBackfillSources = {
  diners: db.prepare('SELECT appointmentId, userId FROM appointment_diners ORDER BY appointmentId, userId').all(),
  appointments: db.prepare("SELECT id, userId, status FROM appointments WHERE id LIKE 'completed-%' OR id LIKE 'backfill-%' ORDER BY id").all(),
};
assert(
  backfilledParticipants.length === 6
    && backfilledParticipants.some(row => row.appointmentId === 'completed-with-diner'
      && row.userId === '8f1e0e34-7dff-4687-8c69-657e12efeee9' && row.legacyFallback === 0 && row.frozenAt === null)
    && backfilledParticipants.some(row => row.appointmentId === 'completed-fallback'
      && row.userId === 'other-user' && row.legacyFallback === 1 && row.frozenAt === null)
    && backfilledParticipants.some(row => row.appointmentId === 'backfill-left-diner'
      && row.userId === 'backfill-left' && row.legacyFallback === 0 && row.frozenAt === 22)
    && backfilledParticipants.some(row => row.appointmentId === 'backfill-invalid-diner'
      && row.userId === 'backfill-owner' && row.legacyFallback === 1 && row.frozenAt === null)
    && backfilledParticipants.some(row => row.appointmentId === 'backfill-left-owner'
      && row.userId === 'backfill-left' && row.legacyFallback === 1 && row.frozenAt === 26)
    && backfilledParticipants.some(row => row.appointmentId === 'dissolved-appointment'
      && row.userId === 'backfill-invalid' && row.legacyFallback === 0 && row.frozenAt === 28)
    && !backfilledParticipants.some(row => row.appointmentId === 'backfill-invalid-diner'
      && row.userId === 'backfill-invalid'),
  'meal history diner assignment or legacy fallback is incorrect',
  { backfilledParticipants, participantBackfillSources },
);

const dirtyDishBackfill = db.prepare(`
  SELECT mr.appointmentId, d.originalDishId, d.nameSnapshot, d.imagesSnapshot
  FROM meal_record_dishes d
  JOIN meal_records mr ON mr.id = d.mealRecordId
  WHERE mr.appointmentId LIKE 'backfill-%'
  ORDER BY mr.appointmentId, d.sortOrder
`).all();
assert(
  dirtyDishBackfill.length === 3
    && dirtyDishBackfill.every(row => row.originalDishId === 'backfill-local-dish')
    && dirtyDishBackfill.every(row => row.nameSnapshot === '回填本家庭菜')
    && dirtyDishBackfill.every(row => row.imagesSnapshot === '["local.jpg"]'),
  'meal dish backfill crossed the family boundary or retained a mutable source row',
  dirtyDishBackfill,
);

const snapshotBeforeRename = db.prepare(`
  SELECT mealRecordId, nameSnapshot, imagesSnapshot
  FROM meal_record_dishes ORDER BY mealRecordId
`).all();
db.exec(`UPDATE dishes SET name = '迁移后改名', images = '["changed.jpg"]';`);
const snapshotAfterRename = db.prepare(`
  SELECT mealRecordId, nameSnapshot, imagesSnapshot
  FROM meal_record_dishes ORDER BY mealRecordId
`).all();
assert(
  snapshotBeforeRename.length === 6
    && JSON.stringify(snapshotAfterRename) === JSON.stringify(snapshotBeforeRename)
    && snapshotAfterRename.filter(row => row.mealRecordId.startsWith('appointment:completed-'))
      .every(row => row.nameSnapshot === '旧菜谱')
    && snapshotAfterRename.filter(row => row.mealRecordId.startsWith('appointment:backfill-'))
      .every(row => row.nameSnapshot === '回填本家庭菜'),
  'meal dish snapshots drifted after source dishes changed',
  { snapshotBeforeRename, snapshotAfterRename },
);

const mealSchemaColumns = Object.fromEntries([
  'meal_records', 'meal_record_dishes', 'meal_record_participants', 'meal_memory_files',
  'user_achievements', 'user_achievement_state',
].map(table => [table, db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name)]));
assert(
  mealSchemaColumns.meal_records.includes('frozenAt')
    && mealSchemaColumns.meal_record_participants.includes('personalHiddenAt')
    && mealSchemaColumns.meal_record_participants.includes('frozenAt')
    && mealSchemaColumns.meal_memory_files.includes('expiresAt')
    && mealSchemaColumns.meal_memory_files.includes('deletedAt'),
  'meal history and achievement schema is incomplete',
  mealSchemaColumns,
);

const mealIndexes = new Set(db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type = 'index' AND name IN ('idx_meal_memory_files_expiry', 'idx_meal_memory_files_deleted')
`).all().map(row => row.name));
assert(
  mealIndexes.has('idx_meal_memory_files_expiry') && mealIndexes.has('idx_meal_memory_files_deleted'),
  'meal memory cleanup indexes are missing',
  [...mealIndexes],
);

const countsBeforeRepeat = {
  records: db.prepare('SELECT COUNT(*) AS count FROM meal_records').get().count,
  dishes: db.prepare('SELECT COUNT(*) AS count FROM meal_record_dishes').get().count,
  participants: db.prepare('SELECT COUNT(*) AS count FROM meal_record_participants').get().count,
  platformFiles: db.prepare("SELECT COUNT(*) AS count FROM platform_files WHERE purpose = 'recipe-template'").get().count,
};
applyMigration(db, '0015_meal_history_achievements.sql');
applyMigration(db, '0016_recipe_template_image_fallback.sql');
const countsAfterRepeat = {
  records: db.prepare('SELECT COUNT(*) AS count FROM meal_records').get().count,
  dishes: db.prepare('SELECT COUNT(*) AS count FROM meal_record_dishes').get().count,
  participants: db.prepare('SELECT COUNT(*) AS count FROM meal_record_participants').get().count,
  platformFiles: db.prepare("SELECT COUNT(*) AS count FROM platform_files WHERE purpose = 'recipe-template'").get().count,
};
assert(
  JSON.stringify(countsAfterRepeat) === JSON.stringify(countsBeforeRepeat),
  'replaying the meal history migration duplicated backfilled rows',
  { countsBeforeRepeat, countsAfterRepeat },
);

const emptyDb = new DatabaseSync(':memory:');
for (const name of migrationFiles) applyMigration(emptyDb, name);
const emptyDatabaseCounts = emptyDb.prepare(`
  SELECT
    (SELECT COUNT(*) FROM users WHERE id = 'system-recipe-template-assets'
      AND status = 'suspended') AS systemUsers,
    (SELECT COUNT(*) FROM platform_files WHERE purpose = 'recipe-template'
      AND deletedAt IS NULL) AS platformFiles,
    (SELECT COUNT(*) FROM recipe_templates WHERE status = 'active'
      AND json_valid(images) AND json_array_length(images) = 1) AS templatesWithImages
`).get();
applyMigration(emptyDb, '0016_recipe_template_image_fallback.sql');
const emptyDatabaseCountsAfterRepeat = emptyDb.prepare(`
  SELECT
    (SELECT COUNT(*) FROM users WHERE id = 'system-recipe-template-assets') AS systemUsers,
    (SELECT COUNT(*) FROM platform_files WHERE purpose = 'recipe-template'
      AND deletedAt IS NULL) AS platformFiles,
    (SELECT COUNT(*) FROM recipe_templates WHERE status = 'active'
      AND json_valid(images) AND json_array_length(images) = 1) AS templatesWithImages
`).get();
assert(
  emptyDatabaseCounts.systemUsers === 1
    && emptyDatabaseCounts.platformFiles === 30
    && emptyDatabaseCounts.templatesWithImages === 30
    && JSON.stringify(emptyDatabaseCountsAfterRepeat) === JSON.stringify(emptyDatabaseCounts),
  'empty environment recipe image fallback is incomplete or non-idempotent',
  { emptyDatabaseCounts, emptyDatabaseCountsAfterRepeat },
);

console.log('Production-style migration backfill checks passed (22 assertions).');
