import { requireCapability, requireFamilyContext, writeAudit } from '../core/auth';
import { collectPreferenceWarnings, compareRecommendations, normalizeIngredientName, normalizeQuantity, parseQuantityText } from '../core/domain';
import { ApiError, json, pagination, parseJsonField, readJson, requiredString } from '../core/http';
import { normalizeImageList } from '../core/media';
import { withOperationLock } from '../core/operationLock';
import { platformAssetIdFromUrl, resolvePlatformAssetUrls } from '../core/platformAssets';
import type { Env, FamilyContext } from '../core/types';

interface IngredientInput {
  id?: unknown;
  expectedUpdateTime?: unknown;
  name?: unknown;
  amount?: unknown;
  ingredientId?: unknown;
  quantity?: unknown;
  unit?: unknown;
}

interface DishInput {
  id?: unknown;
  expectedUpdateTime?: unknown;
  name?: unknown;
  type?: unknown;
  spicy?: unknown;
  images?: unknown;
  steps?: unknown;
  notice?: unknown;
  remark?: unknown;
  reference?: unknown;
  ingredients?: unknown;
}

interface RecipeTemplateRow extends Record<string, unknown> {
  id: string;
  name: string;
  type: string;
  spicy: string;
  images: string;
  steps: string;
  notice: string;
  remark: string;
  reference: string;
}

interface RecipeTemplateIngredientRow extends Record<string, unknown> {
  id: string;
  templateId: string;
  ingredientId: string | null;
  name: string;
  amount: string;
  quantity: number | null;
  unit: string | null;
  legacyAmount: string | null;
}

function withDishLock<T>(env: Env, familyId: string, dishId: string, execute: () => Promise<T>): Promise<T> {
  return withOperationLock(env, `dish:${familyId}:${dishId}`, execute);
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (value === undefined || value === null || value === '') return [];
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = [value]; }
  }
  if (!Array.isArray(parsed)) throw new ApiError(400, 'VALIDATION_ERROR', '数组字段格式错误');
  return parsed.slice(0, maxItems).map(item => requiredString(item, '数组项', maxLength));
}

function mapDish(row: Record<string, unknown>, env: Env): Record<string, unknown> {
  return { ...row, images: normalizeImageList(row.images, env), steps: parseJsonField(row.steps, []) };
}

function templateDishId(familyId: string, templateId: string): string {
  return `template-copy:${familyId}:${templateId}`;
}

interface PlatformFileCopyRow {
  id: string;
  objectKey: string;
  name: string;
  contentType: string;
  size: number;
}

interface PreparedTemplateAssetCopies {
  paths: Map<string, string>;
  statements: D1PreparedStatement[];
  copiedObjectKeys: string[];
}

function templateFamilyFileId(familyId: string, platformFileId: string): string {
  return `template-copy-file:${familyId}:${platformFileId}`;
}

function stableFamilyFilePath(fileId: string): string {
  return `/api/file/download?id=${encodeURIComponent(fileId)}`;
}

async function prepareTemplateAssetCopies(
  env: Env,
  context: FamilyContext,
  templates: RecipeTemplateRow[],
): Promise<PreparedTemplateAssetCopies> {
  const platformFileIds = Array.from(new Set(templates.flatMap(template =>
    parseJsonField<string[]>(template.images, [])
      .map(platformAssetIdFromUrl)
      .filter((id): id is string => Boolean(id)),
  )));
  if (!platformFileIds.length) return { paths: new Map(), statements: [], copiedObjectKeys: [] };

  const placeholders = platformFileIds.map(() => '?').join(',');
  const platformFiles = await env.DB.prepare(`
    SELECT id, objectKey, name, contentType, size
    FROM platform_files WHERE deletedAt IS NULL AND id IN (${placeholders})
  `).bind(...platformFileIds).all<PlatformFileCopyRow>();
  const foundIds = new Set(platformFiles.results.map(file => file.id));
  const missingIds = platformFileIds.filter(id => !foundIds.has(id));
  if (missingIds.length) {
    throw new ApiError(409, 'TEMPLATE_ASSET_MISSING', '模板图片已失效，请联系平台管理员更新模板', { fileIds: missingIds });
  }

  const targetIds = platformFiles.results.map(file => templateFamilyFileId(context.familyId, file.id));
  const existing = await env.DB.prepare(`
    SELECT id, deletedAt FROM family_files
    WHERE familyId = ? AND id IN (${targetIds.map(() => '?').join(',')})
  `).bind(context.familyId, ...targetIds).all<{ id: string; deletedAt: number | null }>();
  const activeTargetIds = new Set(existing.results.filter(file => file.deletedAt === null).map(file => file.id));
  const filesToCopy = platformFiles.results.filter(file => !activeTargetIds.has(templateFamilyFileId(context.familyId, file.id)));
  const usedBytes = await env.DB.prepare(`
    SELECT COALESCE(SUM(size), 0) AS used FROM family_files WHERE familyId = ? AND deletedAt IS NULL
  `).bind(context.familyId).first<number>('used');
  const additionalBytes = filesToCopy.reduce((total, file) => total + Number(file.size || 0), 0);
  const maxUploadBytes = Math.max(1024, Number(env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024));
  const quota = Math.max(maxUploadBytes, Number(env.FAMILY_STORAGE_QUOTA_BYTES || 200 * 1024 * 1024));
  if ((usedBytes || 0) + additionalBytes > quota) {
    throw new ApiError(413, 'FAMILY_STORAGE_QUOTA', '家庭文件空间不足，无法导入模板图片');
  }

  const copiedObjectKeys: string[] = [];
  const statements: D1PreparedStatement[] = [];
  const now = Date.now();
  try {
    for (const file of filesToCopy) {
      const source = await env.FILE_BUCKET.get(file.objectKey);
      if (!source?.body) {
        throw new ApiError(409, 'TEMPLATE_ASSET_MISSING', '模板图片文件不存在，请联系平台管理员更新模板', { fileId: file.id });
      }
      const extensionMatch = file.objectKey.match(/\.[a-zA-Z0-9]{1,8}$/);
      const objectKey = `families/${context.familyId}/recipe-template-copies/${file.id}${extensionMatch?.[0] || ''}`;
      await env.FILE_BUCKET.put(objectKey, source.body, { httpMetadata: { contentType: file.contentType } });
      copiedObjectKeys.push(objectKey);
      const familyFileId = templateFamilyFileId(context.familyId, file.id);
      statements.push(env.DB.prepare(`
        INSERT INTO family_files (id, familyId, objectKey, name, contentType, size, purpose, uploadedBy, createdAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, 'recipe-template-copy', ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET objectKey = excluded.objectKey, name = excluded.name,
          contentType = excluded.contentType, size = excluded.size, purpose = excluded.purpose,
          uploadedBy = excluded.uploadedBy, createdAt = excluded.createdAt, deletedAt = NULL
      `).bind(
        familyFileId, context.familyId, objectKey, file.name, file.contentType,
        file.size, context.user.id, now,
      ));
    }
  } catch (error) {
    await Promise.all(copiedObjectKeys.map(objectKey => env.FILE_BUCKET.delete(objectKey)));
    throw error;
  }

  const paths = new Map(platformFiles.results.map(file => {
    const familyFileId = templateFamilyFileId(context.familyId, file.id);
    return [file.id, stableFamilyFilePath(familyFileId)];
  }));
  return { paths, statements, copiedObjectKeys };
}

async function mapRecipeTemplate(
  request: Request,
  env: Env,
  row: RecipeTemplateRow,
  ingredients: RecipeTemplateIngredientRow[],
): Promise<Record<string, unknown>> {
  const images = parseJsonField<unknown[]>(row.images, []).filter((item): item is string => typeof item === 'string');
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    spicy: row.spicy,
    notice: row.notice,
    remark: row.remark,
    reference: row.reference,
    imported: Number(row.imported || 0) === 1,
    images: await resolvePlatformAssetUrls(request, env, images),
    steps: parseJsonField<string[]>(row.steps, []),
    ingredients,
  };
}

async function resolveCatalog(env: Env, name: string, requestedId?: unknown): Promise<string> {
  const normalized = normalizeIngredientName(name);
  if (typeof requestedId === 'string' && requestedId) {
    const requested = await env.DB.prepare(`
      SELECT c.id, c.canonicalName, group_concat(a.alias, '|') AS aliases
      FROM ingredient_catalog c LEFT JOIN ingredient_aliases a ON a.ingredientId = c.id
      WHERE c.id = ? GROUP BY c.id
    `).bind(requestedId).first<{ id: string; canonicalName: string; aliases: string | null }>();
    const names = requested ? [requested.canonicalName, ...(requested.aliases || '').split('|')] : [];
    if (requested && names.some(value => value && normalizeIngredientName(value) === normalized)) return requested.id;
  }
  const existing = await env.DB.prepare(`
    SELECT c.id FROM ingredient_catalog c
    LEFT JOIN ingredient_aliases a ON a.ingredientId = c.id
    WHERE lower(replace(c.canonicalName, ' ', '')) = ? OR lower(replace(a.alias, ' ', '')) = ? LIMIT 1
  `).bind(normalized, normalized).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO ingredient_catalog (id, canonicalName, category, createdAt, updatedAt)
    VALUES (?, ?, '其他', ?, ?)
  `).bind(id, name, now, now).run();
  return id;
}

async function normalizeIngredient(env: Env, input: IngredientInput): Promise<{
  id: string; name: string; ingredientId: string; quantity: number | null; unit: string | null; amount: string; legacyAmount: string | null;
}> {
  const name = requiredString(input.name, '食材名称', 80);
  const ingredientId = await resolveCatalog(env, name, input.ingredientId);
  const amount = typeof input.amount === 'string' ? input.amount.trim().slice(0, 100) : '';
  if (Object.prototype.hasOwnProperty.call(input, 'amount')) {
    if (!amount) throw new ApiError(400, 'INVALID_QUANTITY', '食材必须提供结构化数量或文字用量');
    const parsed = parseQuantityText(amount);
    return {
      id: typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID(),
      name,
      ingredientId,
      quantity: parsed ? parsed.quantity : null,
      unit: parsed ? parsed.unit : null,
      amount,
      legacyAmount: parsed ? null : amount,
    };
  }
  let quantity = typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity >= 0 ? input.quantity : null;
  let unit = typeof input.unit === 'string' && input.unit.trim() ? input.unit.trim().slice(0, 20) : null;
  if ((quantity === null) !== (unit === null)) throw new ApiError(400, 'INVALID_QUANTITY', '食材 quantity 和 unit 必须同时提供');
  if (quantity === null || unit === null) throw new ApiError(400, 'INVALID_QUANTITY', '食材必须提供结构化数量或文字用量');
  let legacyAmount: string | null = null;
  if (!normalizeQuantity(quantity, unit)) {
    legacyAmount = `${quantity}${unit}`;
    quantity = null;
    unit = null;
  }
  return {
    id: typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID(),
    name, ingredientId, quantity, unit,
    amount: legacyAmount || `${quantity}${unit}`,
    legacyAmount,
  };
}

async function listDishes(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const type = url.searchParams.get('type');
  const keyword = url.searchParams.get('keyword');
  const conditions = ['familyId = ?'];
  const bindings: unknown[] = [context.familyId];
  if (type) { conditions.push('type = ?'); bindings.push(type); }
  if (keyword) { conditions.push('name LIKE ?'); bindings.push(`%${keyword}%`); }
  const where = conditions.join(' AND ');
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM dishes WHERE ${where}`).bind(...bindings),
    env.DB.prepare(`SELECT * FROM dishes WHERE ${where} ORDER BY createTime DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, offset),
  ]);
  return json({
    total: Number((count.results[0] as { total?: unknown } | undefined)?.total || 0),
    list: (rows.results as Array<Record<string, unknown>>).map(row => mapDish(row, env)), page, pageSize,
  });
}

async function listRecipeTemplates(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const url = new URL(request.url);
  const { page, pageSize, offset } = pagination(url);
  const type = url.searchParams.get('type');
  const conditions = ["status = 'active'"];
  const countBindings: unknown[] = [];
  const rowBindings: unknown[] = [context.familyId, context.familyId];
  if (type) {
    conditions.push('type = ?');
    countBindings.push(type);
    rowBindings.push(type);
  }
  const where = conditions.join(' AND ');
  const [countResult, templateResult] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM recipe_templates WHERE ${where}`).bind(...countBindings),
    env.DB.prepare(`
      SELECT t.*,
        EXISTS (
          SELECT 1 FROM dishes d
          WHERE d.id = 'template-copy:' || ? || ':' || t.id AND d.familyId = ?
        ) AS imported
      FROM recipe_templates t
      WHERE ${where}
      ORDER BY t.sortOrder ASC, t.createdAt ASC
      LIMIT ? OFFSET ?
    `).bind(...rowBindings, pageSize, offset),
  ]);
  const templates = templateResult.results as RecipeTemplateRow[];
  if (!templates.length) {
    return json({ total: Number((countResult.results[0] as { total?: unknown } | undefined)?.total || 0), list: [], page, pageSize });
  }
  const placeholders = templates.map(() => '?').join(',');
  const ingredientResult = await env.DB.prepare(`
    SELECT * FROM recipe_template_ingredients
    WHERE templateId IN (${placeholders})
    ORDER BY templateId ASC, sortOrder ASC
  `).bind(...templates.map(template => template.id)).all<RecipeTemplateIngredientRow>();
  return json({
    total: Number((countResult.results[0] as { total?: unknown } | undefined)?.total || 0),
    list: await Promise.all(templates.map(template => mapRecipeTemplate(
      request,
      env,
      template,
      ingredientResult.results.filter(item => item.templateId === template.id),
    ))),
    page,
    pageSize,
  });
}

async function importRecipeTemplates(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'dish.manage');
  const body = await readJson<{ templateIds?: unknown }>(request);
  if (!Array.isArray(body.templateIds) || !body.templateIds.length || body.templateIds.length > 50) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请选择 1 至 50 个菜谱模板');
  }
  const templateIds = Array.from(new Set(body.templateIds.map(value => requiredString(value, '模板ID', 100))));

  return withOperationLock(env, `family:${context.familyId}:template-import`, async () => {
    const placeholders = templateIds.map(() => '?').join(',');
    const templateResult = await env.DB.prepare(`
      SELECT * FROM recipe_templates WHERE id IN (${placeholders}) AND status = 'active'
      ORDER BY sortOrder ASC, createdAt ASC
    `).bind(...templateIds).all<RecipeTemplateRow>();
    const templates = templateResult.results;
    if (templates.length !== templateIds.length) {
      const found = new Set(templates.map(template => template.id));
      throw new ApiError(404, 'RECIPE_TEMPLATE_NOT_FOUND', '部分菜谱模板不存在或已下架', {
        templateIds: templateIds.filter(id => !found.has(id)),
      });
    }

    const dishIds = templates.map(template => templateDishId(context.familyId, template.id));
    const existingResult = await env.DB.prepare(`
      SELECT id FROM dishes WHERE familyId = ? AND id IN (${dishIds.map(() => '?').join(',')})
    `).bind(context.familyId, ...dishIds).all<{ id: string }>();
    const existingDishIds = new Set(existingResult.results.map(row => row.id));
    const alreadyImported = templates
      .filter(template => existingDishIds.has(templateDishId(context.familyId, template.id)))
      .map(template => template.id);
    const pendingTemplates = templates.filter(template => !existingDishIds.has(templateDishId(context.familyId, template.id)));
    if (!pendingTemplates.length) return json({ count: 0, imported: [], alreadyImported });

    return withOperationLock(env, `family:${context.familyId}:storage`, async () => {
      const pendingIds = pendingTemplates.map(template => template.id);
      const ingredientResult = await env.DB.prepare(`
        SELECT * FROM recipe_template_ingredients
        WHERE templateId IN (${pendingIds.map(() => '?').join(',')})
        ORDER BY templateId ASC, sortOrder ASC
      `).bind(...pendingIds).all<RecipeTemplateIngredientRow>();
      const assetCopies = await prepareTemplateAssetCopies(env, context, pendingTemplates);
      const now = Date.now();
      const statements: D1PreparedStatement[] = assetCopies.statements.slice();
      for (const template of pendingTemplates) {
        const dishId = templateDishId(context.familyId, template.id);
        const images = parseJsonField<string[]>(template.images, []).map(image => {
          const platformFileId = platformAssetIdFromUrl(image);
          return platformFileId ? (assetCopies.paths.get(platformFileId) || '') : image;
        }).filter(Boolean);
        statements.push(env.DB.prepare(`
          INSERT OR IGNORE INTO dishes (
            id, name, type, spicy, images, steps, notice, remark, reference,
            creatorId, creatorOpenid, createTime, updateTime, familyId
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          dishId, template.name, template.type, template.spicy, JSON.stringify(images), template.steps,
          template.notice, template.remark, template.reference,
          context.user.id, context.user.openid, now, now, context.familyId,
        ));
        for (const item of ingredientResult.results.filter(row => row.templateId === template.id)) {
          statements.push(env.DB.prepare(`
            INSERT OR IGNORE INTO ingredients (
              id, dishId, name, amount, createTime, updateTime, ingredientId, quantity, unit, legacyAmount
            ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM dishes WHERE id = ? AND familyId = ?)
          `).bind(
            `template-copy-ingredient:${context.familyId}:${item.id}`,
            dishId, item.name, item.amount, now, now, item.ingredientId, item.quantity, item.unit, item.legacyAmount,
            dishId, context.familyId,
          ));
        }
      }
      statements.push(env.DB.prepare(`
        INSERT INTO audit_events (id, familyId, actorUserId, action, targetType, targetId, details, createdAt)
        VALUES (?, ?, ?, 'recipe_templates.imported', 'family', ?, ?, ?)
      `).bind(
        crypto.randomUUID(), context.familyId, context.user.id, context.familyId,
        JSON.stringify({ templateIds: pendingIds }), now,
      ));
      try {
        await env.DB.batch(statements);
      } catch (error) {
        await Promise.all(assetCopies.copiedObjectKeys.map(objectKey => env.FILE_BUCKET.delete(objectKey)));
        throw error;
      }
      return json({
        count: pendingTemplates.length,
        imported: pendingTemplates.map(template => ({
          templateId: template.id,
          dishId: templateDishId(context.familyId, template.id),
        })),
        alreadyImported,
      }, 201);
    });
  });
}

async function getDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少菜品ID');
  const dish = await env.DB.prepare('SELECT * FROM dishes WHERE id = ? AND familyId = ?')
    .bind(id, context.familyId).first<Record<string, unknown>>();
  if (!dish) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
  const ingredients = await env.DB.prepare('SELECT * FROM ingredients WHERE dishId = ? ORDER BY createTime ASC')
    .bind(id).all();
  return json({ ...mapDish(dish, env), ingredients: ingredients.results });
}

async function insertIngredients(env: Env, dishId: string, inputs: IngredientInput[], now: number): Promise<void> {
  const normalized = await normalizeIngredients(env, inputs);
  if (!normalized.length) return;
  await env.DB.batch(normalized.map(item => prepareIngredientInsert(env, dishId, item, now)));
}

type NormalizedIngredient = Awaited<ReturnType<typeof normalizeIngredient>>;

async function normalizeIngredients(env: Env, inputs: IngredientInput[]): Promise<NormalizedIngredient[]> {
  const normalized: NormalizedIngredient[] = [];
  for (const input of inputs) normalized.push(await normalizeIngredient(env, input));
  return normalized;
}

function prepareIngredientInsert(env: Env, dishId: string, item: NormalizedIngredient, now: number) {
  return env.DB.prepare(`
    INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime, ingredientId, quantity, unit, legacyAmount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(item.id, dishId, item.name, item.amount, now, now, item.ingredientId, item.quantity, item.unit, item.legacyAmount);
}

function parseIngredientInputs(value: unknown): IngredientInput[] {
  if (value === undefined || value === null) return [];
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { throw new ApiError(400, 'VALIDATION_ERROR', '食材列表格式错误'); }
  }
  if (!Array.isArray(parsed) || parsed.length > 100) throw new ApiError(400, 'VALIDATION_ERROR', '食材列表格式错误');
  return parsed as IngredientInput[];
}

async function addDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'dish.manage');
  const data = await readJson<DishInput>(request, 256 * 1024);
  const id = crypto.randomUUID();
  const now = Date.now();
  const dish = {
    id, name: requiredString(data.name, '菜品名称', 80), type: requiredString(data.type, '菜品类型', 40),
    spicy: typeof data.spicy === 'string' && data.spicy.trim() ? data.spicy.trim().slice(0, 20) : '不辣',
    images: stringList(data.images, 20, 1000), steps: stringList(data.steps, 100, 1000),
    notice: typeof data.notice === 'string' ? data.notice.slice(0, 1000) : '',
    remark: typeof data.remark === 'string' ? data.remark.slice(0, 1000) : '',
    reference: typeof data.reference === 'string' ? data.reference.slice(0, 1000) : '',
  };
  await env.DB.prepare(`
    INSERT INTO dishes (
      id, name, type, spicy, images, steps, notice, remark, reference,
      creatorId, creatorOpenid, createTime, updateTime, familyId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, dish.name, dish.type, dish.spicy, JSON.stringify(dish.images), JSON.stringify(dish.steps),
    dish.notice, dish.remark, dish.reference, context.user.id, context.user.openid, now, now, context.familyId,
  ).run();
  try {
    await insertIngredients(env, id, parseIngredientInputs(data.ingredients), now);
  } catch (error) {
    await env.DB.prepare('DELETE FROM dishes WHERE id = ? AND familyId = ?').bind(id, context.familyId).run();
    throw error;
  }
  await writeAudit(env, context, 'dish.created', 'dish', id, { name: dish.name });
  return getDish(new Request(`${new URL(request.url).origin}/api/dish/detail?id=${id}`, { headers: request.headers }), env);
}

async function updateDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'dish.manage');
  const data = await readJson<DishInput>(request, 256 * 1024);
  const id = requiredString(data.id, '菜品ID');
  return withDishLock(env, context.familyId, id, async () => {
  const current = await env.DB.prepare('SELECT * FROM dishes WHERE id = ? AND familyId = ?').bind(id, context.familyId).first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
  const currentUpdateTime = Number(current.updateTime);
  const expectedUpdateTime = data.expectedUpdateTime === undefined ? currentUpdateTime : Number(data.expectedUpdateTime);
  if (!Number.isFinite(expectedUpdateTime) || expectedUpdateTime < 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', '菜品版本无效');
  }
  if (expectedUpdateTime !== currentUpdateTime) {
    throw new ApiError(409, 'DISH_CHANGED', '菜品已被其他操作修改，请刷新后重试');
  }
  const next = {
    name: data.name === undefined ? current.name : requiredString(data.name, '菜品名称', 80),
    type: data.type === undefined ? current.type : requiredString(data.type, '菜品类型', 40),
    spicy: data.spicy === undefined ? current.spicy : requiredString(data.spicy, '辣度', 20),
    images: data.images === undefined ? parseJsonField(current.images, []) : stringList(data.images, 20, 1000),
    steps: data.steps === undefined ? parseJsonField(current.steps, []) : stringList(data.steps, 100, 1000),
    notice: data.notice === undefined ? current.notice : typeof data.notice === 'string' ? data.notice.slice(0, 1000) : '',
    remark: data.remark === undefined ? current.remark : typeof data.remark === 'string' ? data.remark.slice(0, 1000) : '',
    reference: data.reference === undefined ? current.reference : typeof data.reference === 'string' ? data.reference.slice(0, 1000) : '',
  };
  const now = Math.max(Date.now(), currentUpdateTime + 1);
  const hasField = (field: string) => Object.prototype.hasOwnProperty.call(data, field);
  const normalizedIngredients = data.ingredients === undefined
    ? null
    : await normalizeIngredients(env, parseIngredientInputs(data.ingredients));
  const statements = [env.DB.prepare(`
    UPDATE dishes SET
      name = CASE WHEN ? = 1 THEN ? ELSE name END,
      type = CASE WHEN ? = 1 THEN ? ELSE type END,
      spicy = CASE WHEN ? = 1 THEN ? ELSE spicy END,
      images = CASE WHEN ? = 1 THEN ? ELSE images END,
      steps = CASE WHEN ? = 1 THEN ? ELSE steps END,
      notice = CASE WHEN ? = 1 THEN ? ELSE notice END,
      remark = CASE WHEN ? = 1 THEN ? ELSE remark END,
      reference = CASE WHEN ? = 1 THEN ? ELSE reference END,
      updateTime = ?
    WHERE id = ? AND familyId = ? AND updateTime = ?
  `).bind(
    hasField('name') ? 1 : 0, next.name,
    hasField('type') ? 1 : 0, next.type,
    hasField('spicy') ? 1 : 0, next.spicy,
    hasField('images') ? 1 : 0, JSON.stringify(next.images),
    hasField('steps') ? 1 : 0, JSON.stringify(next.steps),
    hasField('notice') ? 1 : 0, next.notice,
    hasField('remark') ? 1 : 0, next.remark,
    hasField('reference') ? 1 : 0, next.reference,
    now, id, context.familyId, expectedUpdateTime,
  )];
  if (normalizedIngredients) {
    statements.push(env.DB.prepare(`
      DELETE FROM ingredients WHERE dishId = ? AND EXISTS (
        SELECT 1 FROM dishes WHERE id = ? AND familyId = ? AND updateTime = ?
      )
    `).bind(id, id, context.familyId, now));
    statements.push(...normalizedIngredients.map(item => env.DB.prepare(`
      INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime, ingredientId, quantity, unit, legacyAmount)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM dishes WHERE id = ? AND familyId = ? AND updateTime = ?
      )
    `).bind(
      item.id, id, item.name, item.amount, now, now, item.ingredientId, item.quantity, item.unit, item.legacyAmount,
      id, context.familyId, now,
    )));
  }
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes) throw new ApiError(409, 'DISH_CHANGED', '菜品已被其他操作修改，请刷新后重试');
  await writeAudit(env, context, 'dish.updated', 'dish', id);
    return getDish(new Request(`${new URL(request.url).origin}/api/dish/detail?id=${id}`, { headers: request.headers }), env);
  });
}

async function deleteDish(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'dish.manage');
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少菜品ID');
  return withDishLock(env, context.familyId, id, async () => {
  const used = await env.DB.prepare(`
    SELECT 1 FROM appointment_dishes ad JOIN appointments a ON a.id = ad.appointmentId
    WHERE ad.dishId = ? AND a.familyId = ? AND a.status NOT IN ('已取消', 'cancelled') LIMIT 1
  `).bind(id, context.familyId).first();
  if (used) throw new ApiError(409, 'DISH_IN_USE', '菜品仍被预约使用，不能删除');
  const results = await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM ingredients WHERE dishId = ? AND EXISTS (
        SELECT 1 FROM dishes WHERE id = ? AND familyId = ?
      )
    `).bind(id, id, context.familyId),
    env.DB.prepare('DELETE FROM dishes WHERE id = ? AND familyId = ?').bind(id, context.familyId),
  ]);
  if (!results[1].meta.changes) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
  await writeAudit(env, context, 'dish.deleted', 'dish', id);
    return json({ success: true });
  });
}

async function ingredientList(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const dishId = new URL(request.url).searchParams.get('dishId');
  if (dishId) {
    const dish = await env.DB.prepare('SELECT id FROM dishes WHERE id = ? AND familyId = ?').bind(dishId, context.familyId).first();
    if (!dish) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
    const result = await env.DB.prepare('SELECT * FROM ingredients WHERE dishId = ? ORDER BY createTime').bind(dishId).all();
    return json(result.results);
  }
  const result = await env.DB.prepare(`
    SELECT c.*, group_concat(a.alias, '|') AS aliases
    FROM ingredient_catalog c LEFT JOIN ingredient_aliases a ON a.ingredientId = c.id
    GROUP BY c.id ORDER BY c.canonicalName LIMIT 500
  `).all();
  return json(result.results);
}

async function mutateIngredient(request: Request, env: Env, action: 'add' | 'update' | 'delete'): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'dish.manage');
  if (action === 'delete') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) throw new ApiError(400, 'VALIDATION_ERROR', '缺少食材ID');
    const initial = await env.DB.prepare(`
      SELECT i.dishId FROM ingredients i JOIN dishes d ON d.id = i.dishId
      WHERE i.id = ? AND d.familyId = ?
    `).bind(id, context.familyId).first<{ dishId: string }>();
    if (!initial) throw new ApiError(404, 'INGREDIENT_NOT_FOUND', '食材不存在');
    return withDishLock(env, context.familyId, initial.dishId, async () => {
    const current = await env.DB.prepare(`
      SELECT i.dishId, d.updateTime FROM ingredients i JOIN dishes d ON d.id = i.dishId
      WHERE i.id = ? AND d.familyId = ?
    `).bind(id, context.familyId).first<{ dishId: string; updateTime: number }>();
    if (!current) throw new ApiError(404, 'INGREDIENT_NOT_FOUND', '食材不存在');
    const rawExpected = url.searchParams.get('expectedUpdateTime');
    const expectedUpdateTime = rawExpected === null ? current.updateTime : Number(rawExpected);
    if (!Number.isFinite(expectedUpdateTime) || expectedUpdateTime < 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', '菜品版本无效');
    }
    if (expectedUpdateTime !== current.updateTime) {
      throw new ApiError(409, 'DISH_CHANGED', '菜品已被其他操作修改，请刷新后重试');
    }
    const now = Math.max(Date.now(), current.updateTime + 1);
    const results = await env.DB.batch([
      env.DB.prepare('UPDATE dishes SET updateTime = ? WHERE id = ? AND familyId = ? AND updateTime = ?')
        .bind(now, current.dishId, context.familyId, expectedUpdateTime),
      env.DB.prepare(`
        DELETE FROM ingredients WHERE id = ? AND dishId = ? AND EXISTS (
          SELECT 1 FROM dishes WHERE id = ? AND familyId = ? AND updateTime = ?
        )
      `).bind(id, current.dishId, current.dishId, context.familyId, now),
    ]);
    if (!results[0].meta.changes) throw new ApiError(409, 'DISH_CHANGED', '菜品已被其他操作修改，请刷新后重试');
    if (!results[1].meta.changes) throw new ApiError(404, 'INGREDIENT_NOT_FOUND', '食材不存在');
      return json({ success: true, dishUpdateTime: now });
    });
  }
  const input = await readJson<IngredientInput & { dishId?: unknown }>(request);
  const dishId = requiredString(input.dishId, '菜品ID');
  return withDishLock(env, context.familyId, dishId, async () => {
  const dish = await env.DB.prepare('SELECT id, updateTime FROM dishes WHERE id = ? AND familyId = ?')
    .bind(dishId, context.familyId).first<{ id: string; updateTime: number }>();
  if (!dish) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在');
  const expectedUpdateTime = input.expectedUpdateTime === undefined ? dish.updateTime : Number(input.expectedUpdateTime);
  if (!Number.isFinite(expectedUpdateTime) || expectedUpdateTime < 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', '菜品版本无效');
  }
  if (expectedUpdateTime !== dish.updateTime) {
    throw new ApiError(409, 'DISH_CHANGED', '菜品已被其他操作修改，请刷新后重试');
  }
  const item = await normalizeIngredient(env, input);
  const now = Math.max(Date.now(), dish.updateTime + 1);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('UPDATE dishes SET updateTime = ? WHERE id = ? AND familyId = ? AND updateTime = ?')
      .bind(now, dishId, context.familyId, expectedUpdateTime),
  ];
  if (action === 'add') {
    statements.push(env.DB.prepare(`
      INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime, ingredientId, quantity, unit, legacyAmount)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM dishes WHERE id = ? AND familyId = ? AND updateTime = ?)
    `).bind(
      item.id, dishId, item.name, item.amount, now, now, item.ingredientId, item.quantity, item.unit, item.legacyAmount,
      dishId, context.familyId, now,
    ));
  } else {
    const id = requiredString(input.id, '食材ID');
    const existing = await env.DB.prepare('SELECT id FROM ingredients WHERE id = ? AND dishId = ?').bind(id, dishId).first();
    if (!existing) throw new ApiError(404, 'INGREDIENT_NOT_FOUND', '食材不存在');
    statements.push(env.DB.prepare(`
      UPDATE ingredients SET name = ?, amount = ?, updateTime = ?, ingredientId = ?, quantity = ?, unit = ?, legacyAmount = ?
      WHERE id = ? AND dishId = ? AND EXISTS (
        SELECT 1 FROM dishes WHERE id = ? AND familyId = ? AND updateTime = ?
      )
    `).bind(
      item.name, item.amount, now, item.ingredientId, item.quantity, item.unit, item.legacyAmount,
      id, dishId, dishId, context.familyId, now,
    ));
    item.id = id;
  }
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes) throw new ApiError(409, 'DISH_CHANGED', '菜品已被其他操作修改，请刷新后重试');
  if (!results[1].meta.changes) throw new ApiError(409, 'DISH_CHANGED', '菜品已被其他操作修改，请刷新后重试');
  await writeAudit(env, context, `ingredient.${action}ed`, 'dish', dishId, { ingredientId: item.id });
    return json({ ...item, dishId, dishUpdateTime: now }, action === 'add' ? 201 : 200);
  });
}

async function dinerPreferences(env: Env, context: FamilyContext, dinerIds: string[]): Promise<Array<{
  type: 'allergy' | 'avoid' | 'like' | 'spice'; value: string; userId: string; userName: string | null;
}>> {
  if (!dinerIds.length) {
    const diners = await env.DB.prepare(`SELECT userId FROM family_members WHERE familyId = ? AND status = 'active'`)
      .bind(context.familyId).all<{ userId: string }>();
    dinerIds = diners.results.map(row => row.userId);
  }
  const unique = Array.from(new Set(dinerIds)).slice(0, 20);
  const placeholders = unique.map(() => '?').join(',');
  if (!placeholders) return [];
  const result = await env.DB.prepare(`
    SELECT p.type, p.value, p.userId, u.nickName AS userName
    FROM user_food_preferences p JOIN users u ON u.id = p.userId
    JOIN family_members fm ON fm.userId = p.userId AND fm.familyId = ? AND fm.status = 'active'
    WHERE p.userId IN (${placeholders})
  `).bind(context.familyId, ...unique).all();
  return result.results as Array<{ type: 'allergy' | 'avoid' | 'like' | 'spice'; value: string; userId: string; userName: string | null }>;
}

async function recommend(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  const body = await readJson<{ dinerIds?: unknown; page?: unknown; pageSize?: unknown }>(request);
  const dinerIds = Array.isArray(body.dinerIds) ? body.dinerIds.filter((id): id is string => typeof id === 'string') : [];
  const page = Math.max(1, typeof body.page === 'number' ? Math.floor(body.page) : 1);
  const pageSize = Math.min(50, Math.max(1, typeof body.pageSize === 'number' ? Math.floor(body.pageSize) : 20));
  const [dishRows, ingredientRows, inventoryRows] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM dishes WHERE familyId = ? ORDER BY createTime DESC').bind(context.familyId),
    env.DB.prepare(`SELECT i.* FROM ingredients i JOIN dishes d ON d.id = i.dishId WHERE d.familyId = ?`).bind(context.familyId),
    env.DB.prepare(`SELECT * FROM inventory_items WHERE familyId = ? AND status NOT IN ('已用完', 'discarded')`).bind(context.familyId),
  ]);
  const preferences = await dinerPreferences(env, context, dinerIds);
  const inventory = inventoryRows.results as Array<Record<string, unknown>>;
  const ingredientsByDish = new Map<string, Array<Record<string, unknown>>>();
  for (const ingredient of ingredientRows.results as Array<Record<string, unknown>>) {
    const list = ingredientsByDish.get(String(ingredient.dishId)) || [];
    list.push(ingredient);
    ingredientsByDish.set(String(ingredient.dishId), list);
  }
  const expiryCutoff = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const recommendations = (dishRows.results as Array<Record<string, unknown>>).map(row => {
    const dish = mapDish(row, env);
    const required = ingredientsByDish.get(String(row.id)) || [];
    const existing: unknown[] = [];
    const missing: unknown[] = [];
    const expiring: unknown[] = [];
    for (const ingredient of required) {
      const matches = inventory.filter(item =>
        (ingredient.ingredientId && item.ingredientId === ingredient.ingredientId)
        || normalizeIngredientName(String(item.name)) === normalizeIngredientName(String(ingredient.name)),
      );
      const requiredNormalized = normalizeQuantity(ingredient.quantity, ingredient.unit);
      let covered = matches.length > 0;
      let availableQuantity: number | null = null;
      if (requiredNormalized) {
        const compatible = matches.map(item => normalizeQuantity(item.quantity, item.unit))
          .filter((item): item is NonNullable<typeof item> => Boolean(item && item.dimension === requiredNormalized.dimension));
        availableQuantity = compatible.reduce((sum, item) => sum + item.quantity, 0);
        covered = availableQuantity >= requiredNormalized.quantity;
      }
      const detail = { ...ingredient, availableQuantity };
      (covered ? existing : missing).push(detail);
      for (const item of matches) {
        if (typeof item.expiryDate === 'string' && item.expiryDate <= expiryCutoff) expiring.push(item);
      }
    }
    const warnings = collectPreferenceWarnings(
      required.map(item => typeof item.name === 'string' ? item.name : ''),
      typeof row.spicy === 'string' ? row.spicy : '', preferences,
    );
    return {
      ...dish,
      ingredients: required,
      coverageRate: required.length ? Math.round((existing.length / required.length) * 10000) / 100 : 100,
      existing, missing, expiring, warnings,
      expiringIngredientCount: expiring.length,
      warningCount: warnings.length,
      reasons: {
        stock: `${existing.length}/${required.length} 种食材已有`,
        expiring: expiring.length ? `可优先消耗 ${expiring.length} 项临期食材` : '无临期食材匹配',
        preference: warnings.length ? `${warnings.length} 项口味提醒` : '无口味冲突',
      },
    };
  }).sort(compareRecommendations);
  const offset = (page - 1) * pageSize;
  return json({ total: recommendations.length, list: recommendations.slice(offset, offset + pageSize), page, pageSize });
}

export async function handleDishV2(request: Request, env: Env, path: string): Promise<Response> {
  switch (`${request.method} ${path}`) {
    case 'GET /api/dish/templates': return listRecipeTemplates(request, env);
    case 'POST /api/dish/templates/import': return importRecipeTemplates(request, env);
    case 'GET /api/dish/list':
    case 'GET /api/dish/search': return listDishes(request, env);
    case 'GET /api/dish/detail': return getDish(request, env);
    case 'POST /api/dish/add': return addDish(request, env);
    case 'PUT /api/dish/update': return updateDish(request, env);
    case 'DELETE /api/dish/delete': return deleteDish(request, env);
    case 'GET /api/dish/ingredients': return ingredientList(request, env);
    case 'POST /api/dish/ingredient/add': return mutateIngredient(request, env, 'add');
    case 'PUT /api/dish/ingredient/update': return mutateIngredient(request, env, 'update');
    case 'DELETE /api/dish/ingredient/delete': return mutateIngredient(request, env, 'delete');
    case 'POST /api/dish/recommend': return recommend(request, env);
    default: throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  }
}
