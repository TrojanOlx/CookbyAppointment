import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = new URL('..', import.meta.url).pathname;
const config = 'cloudflareWorkes/wrangler.toml';
const seed = 'cloudflareWorkes/test/fixtures/integration-seed.sql';
const port = 8791;
const origin = `http://127.0.0.1:${port}`;

function run(command, args) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
}

async function api(path, token, familyId, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('X-App-Version')) headers.set('X-App-Version', '2.1.0-test');
  if (familyId) headers.set('X-Family-Id', familyId);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${origin}${path}`, { ...init, headers });
  const data = await response.json();
  return { status: response.status, data };
}

async function apiForm(path, token, form) {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'X-App-Version': '2.1.0-test',
  });
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers, body: form });
  const data = await response.json();
  return { status: response.status, data };
}

function assert(condition, message, details) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
}

function dateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'cookby_appointment', '--local', '--config', config]);
run('npx', ['wrangler', 'd1', 'execute', 'cookby_appointment', '--local', '--file', seed, '--config', config]);

const worker = spawn('npx', [
  'wrangler', 'dev', '--local', '--port', String(port), '--config', config,
  '--var', 'FAMILY_MODE:on', '--var', 'MINIPROGRAM_MIN_VERSION:2.1.0',
  '--var', 'WX_APPID:test', '--var', 'WX_SECRET:test',
], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

let logs = '';
worker.stdout.on('data', chunk => { logs += String(chunk); });
worker.stderr.on('data', chunk => { logs += String(chunk); });

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/app/version`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(250);
  }
  assert(ready, 'Worker did not start', logs.slice(-4000));

  const outdatedClient = await api('/api/family/list', 'token-owner-a', undefined, {
    headers: { 'X-App-Version': '2.0.9' },
  });
  assert(
    outdatedClient.status === 426 && outdatedClient.data.code === 'CLIENT_UPDATE_REQUIRED',
    'outdated client was not rejected with the version-gate contract',
    outdatedClient,
  );

  const regularPlatformStatus = await api('/api/platform/status', 'token-owner-a');
  const adminPlatformStatus = await api('/api/platform/status', 'token-platform-admin');
  const forbiddenPlatformOverview = await api('/api/platform/overview', 'token-owner-a');
  const platformOverview = await api('/api/platform/overview', 'token-platform-admin');
  assert(
    regularPlatformStatus.status === 200
      && regularPlatformStatus.data.isPlatformAdmin === false
      && adminPlatformStatus.status === 200
      && adminPlatformStatus.data.isPlatformAdmin === true
      && adminPlatformStatus.data.userId === 'it-platform-admin'
      && forbiddenPlatformOverview.status === 403
      && forbiddenPlatformOverview.data.code === 'PLATFORM_ADMIN_REQUIRED'
      && platformOverview.status === 200
      && Number(platformOverview.data.ingredients?.total || 0) > 0,
    'platform administrator boundary failed',
    { regularPlatformStatus, adminPlatformStatus, forbiddenPlatformOverview, platformOverview },
  );

  const platformUsers = await api('/api/platform/users?pageSize=50', 'token-platform-admin');
  const platformFamilies = await api('/api/platform/families?pageSize=50', 'token-platform-admin');
  const exposedUser = platformUsers.data.list?.find(item => item.id === 'it-owner-a');
  assert(
    platformUsers.status === 200
      && exposedUser
      && !Object.prototype.hasOwnProperty.call(exposedUser, 'openid')
      && !Object.prototype.hasOwnProperty.call(exposedUser, 'phoneNumber')
      && platformFamilies.status === 200
      && platformFamilies.data.list.every(item => !Object.prototype.hasOwnProperty.call(item, 'dishes')),
    'platform metadata endpoints leaked private business or identity fields',
    { platformUsers, platformFamilies },
  );

  const blockedOwnerSuspension = await api('/api/platform/users/it-owner-a/suspend', 'token-platform-admin', undefined, {
    method: 'POST', body: JSON.stringify({ reason: '集成测试' }),
  });
  const suspendedTarget = await api('/api/platform/users/it-platform-target/suspend', 'token-platform-admin', undefined, {
    method: 'POST', body: JSON.stringify({ reason: '集成测试停用' }),
  });
  const revokedSuspendedSession = await api('/api/platform/status', 'token-platform-target');
  const restoredTarget = await api('/api/platform/users/it-platform-target/restore', 'token-platform-admin', undefined, {
    method: 'POST',
  });
  const oldSessionAfterRestore = await api('/api/platform/status', 'token-platform-target');
  assert(
    blockedOwnerSuspension.status === 409
      && blockedOwnerSuspension.data.code === 'ACTIVE_FAMILY_OWNER'
      && suspendedTarget.status === 200
      && revokedSuspendedSession.status === 403
      && revokedSuspendedSession.data.code === 'ACCOUNT_SUSPENDED'
      && restoredTarget.status === 200
      && oldSessionAfterRestore.status === 401,
    'platform suspension, owner protection, or session revocation failed',
    { blockedOwnerSuspension, suspendedTarget, revokedSuspendedSession, restoredTarget, oldSessionAfterRestore },
  );

  const ownershipSuspensionRace = await Promise.all([
    api('/api/family/transfer', 'token-owner-a', 'it-family-a', {
      method: 'POST', body: JSON.stringify({ userId: 'it-shared' }),
    }),
    api('/api/platform/users/it-shared/suspend', 'token-platform-admin', undefined, {
      method: 'POST', body: JSON.stringify({ reason: '并发生命周期测试' }),
    }),
  ]);
  const sharedAfterLifecycleRace = await api('/api/platform/users/it-shared', 'token-platform-admin');
  const ownersAfterLifecycleRace = await api('/api/family/members', 'token-owner-a', 'it-family-a');
  assert(
    ownershipSuspensionRace.filter(result => result.status === 200).length === 1
      && ownersAfterLifecycleRace.status === 200
      && (ownersAfterLifecycleRace.data.list || []).filter(member => member.role === 'owner').length === 1
      && !(
        sharedAfterLifecycleRace.data.status === 'suspended'
        && (ownersAfterLifecycleRace.data.list || []).some(member => member.userId === 'it-shared' && member.role === 'owner')
      ),
    'ownership transfer and suspension produced a suspended active owner',
    { ownershipSuspensionRace, sharedAfterLifecycleRace, ownersAfterLifecycleRace },
  );
  if (ownershipSuspensionRace[0].status === 200) {
    const transferBack = await api('/api/family/transfer', 'token-shared', 'it-family-a', {
      method: 'POST', body: JSON.stringify({ userId: 'it-owner-a' }),
    });
    assert(transferBack.status === 200, 'lifecycle race cleanup transfer failed', transferBack);
  } else {
    const restoreShared = await api('/api/platform/users/it-shared/restore', 'token-platform-admin', undefined, {
      method: 'POST',
    });
    assert(restoreShared.status === 200, 'lifecycle race cleanup restore failed', restoreShared);
  }

  const ownerFamilies = await api('/api/family/list', 'token-owner-a');
  assert(ownerFamilies.status === 200 && ownerFamilies.data.list.some(item => item.id === 'it-family-a'), 'owner family list failed', ownerFamilies);

  const createdTemplateFamily = await api('/api/family/create', 'token-starter-owner', undefined, {
    method: 'POST', body: JSON.stringify({ name: '模板测试家庭' }),
  });
  assert(
    createdTemplateFamily.status === 201
      && createdTemplateFamily.data.id
      && createdTemplateFamily.data.needsRecipeSetup === true,
    'new family did not expose the recipe-template setup flow',
    createdTemplateFamily,
  );
  const templateFamilyId = createdTemplateFamily.data.id;
  const recipeTemplates = await api('/api/dish/templates?pageSize=20', 'token-starter-owner', templateFamilyId);
  assert(
    recipeTemplates.status === 200
      && recipeTemplates.data.total === 10
      && new Set(recipeTemplates.data.list.map(item => item.type)).size === 5
      && recipeTemplates.data.list.every(item => item.imported === false && item.ingredients.length >= 2),
    'public recipe templates were not listed with complete content',
    recipeTemplates,
  );
  const selectedTemplateIds = recipeTemplates.data.list.slice(0, 3).map(item => item.id);
  const importedTemplates = await api('/api/dish/templates/import', 'token-starter-owner', templateFamilyId, {
    method: 'POST', body: JSON.stringify({ templateIds: selectedTemplateIds }),
  });
  const repeatedImport = await api('/api/dish/templates/import', 'token-starter-owner', templateFamilyId, {
    method: 'POST', body: JSON.stringify({ templateIds: selectedTemplateIds }),
  });
  assert(
    importedTemplates.status === 201
      && importedTemplates.data.count === 3
      && repeatedImport.status === 200
      && repeatedImport.data.count === 0
      && repeatedImport.data.alreadyImported.length === 3,
    'recipe template import was not idempotent',
    { importedTemplates, repeatedImport },
  );
  const importedDishId = importedTemplates.data.imported[0].dishId;
  const importedDish = await api(`/api/dish/detail?id=${encodeURIComponent(importedDishId)}`, 'token-starter-owner', templateFamilyId);
  const editedImportedDish = await api('/api/dish/update', 'token-starter-owner', templateFamilyId, {
    method: 'PUT',
    body: JSON.stringify({
      id: importedDishId,
      name: '我家的做法',
      expectedUpdateTime: importedDish.data.updateTime,
    }),
  });
  const templatesAfterEdit = await api('/api/dish/templates?pageSize=20', 'token-starter-owner', templateFamilyId);
  const sourceTemplateAfterEdit = templatesAfterEdit.data.list.find(item => item.id === selectedTemplateIds[0]);
  assert(
    importedDish.status === 200
      && importedDish.data.ingredients.length >= 2
      && editedImportedDish.status === 200
      && editedImportedDish.data.name === '我家的做法'
      && sourceTemplateAfterEdit.name !== '我家的做法'
      && sourceTemplateAfterEdit.imported === true,
    'editing an imported recipe changed the public template or lost its ingredients',
    { importedDish, editedImportedDish, sourceTemplateAfterEdit },
  );
  const crossFamilyTemplateCopy = await api(
    `/api/dish/detail?id=${encodeURIComponent(importedDishId)}`,
    'token-owner-a',
    'it-family-a',
  );
  assert(
    crossFamilyTemplateCopy.status === 404,
    'an imported template copy leaked into another family',
    crossFamilyTemplateCopy,
  );

  const assetForm = new FormData();
  assetForm.append('file', new File([new Uint8Array([255, 216, 255, 217])], 'template.jpg', { type: 'image/jpeg' }));
  const uploadedTemplateAsset = await apiForm('/api/platform/template-assets', 'token-platform-admin', assetForm);
  const forbiddenAssetForm = new FormData();
  forbiddenAssetForm.append('file', new File([new Uint8Array([255, 216, 255, 217])], 'forbidden.jpg', { type: 'image/jpeg' }));
  const forbiddenTemplateAsset = await apiForm('/api/platform/template-assets', 'token-owner-a', forbiddenAssetForm);
  assert(
    uploadedTemplateAsset.status === 201
      && uploadedTemplateAsset.data.filePath?.startsWith('/api/platform/template-assets/')
      && forbiddenTemplateAsset.status === 403,
    'platform template asset upload permissions failed',
    { uploadedTemplateAsset, forbiddenTemplateAsset },
  );
  const externalImageTemplate = await api('/api/platform/recipe-templates', 'token-platform-admin', undefined, {
    method: 'POST',
    body: JSON.stringify({
      name: '外链图片测试', type: '炒菜', spicy: '不辣', images: ['https://example.com/dish.jpg'],
      steps: ['完成'], ingredients: [{ name: '鸡蛋', amount: '1个' }],
    }),
  });
  assert(
    externalImageTemplate.status === 400 && externalImageTemplate.data.code === 'TEMPLATE_IMAGE_INVALID',
    'platform template accepted an external image outside the platform asset namespace',
    externalImageTemplate,
  );

  const platformTemplatePayload = {
    name: '平台测试菜谱', type: '炒菜', spicy: '不辣', images: [uploadedTemplateAsset.data.filePath],
    steps: ['准备食材', '下锅炒熟'], notice: '', remark: '', reference: '', sortOrder: 999,
    ingredients: [{ name: '平台测试食材', amount: '100g' }],
  };
  const createdPlatformTemplate = await api('/api/platform/recipe-templates', 'token-platform-admin', undefined, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'it-platform-template-create' },
    body: JSON.stringify(platformTemplatePayload),
  });
  const replayedPlatformTemplate = await api('/api/platform/recipe-templates', 'token-platform-admin', undefined, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'it-platform-template-create' },
    body: JSON.stringify(platformTemplatePayload),
  });
  const publishedPlatformTemplate = await api(
    `/api/platform/recipe-templates/${encodeURIComponent(createdPlatformTemplate.data.id)}/publish`,
    'token-platform-admin', undefined, {
      method: 'POST',
      body: JSON.stringify({ expectedUpdatedAt: createdPlatformTemplate.data.updatedAt }),
    },
  );
  const publicTemplatesAfterPublish = await api('/api/dish/templates?pageSize=50', 'token-starter-owner', templateFamilyId);
  const publishedTemplate = publicTemplatesAfterPublish.data.list?.find(item => item.id === createdPlatformTemplate.data.id);
  const signedTemplateAssetUrl = new URL(publishedTemplate?.images?.[0] || `${origin}/missing`);
  const signedTemplateAssetResponse = await fetch(`${origin}${signedTemplateAssetUrl.pathname}${signedTemplateAssetUrl.search}`);
  assert(
    createdPlatformTemplate.status === 201
      && replayedPlatformTemplate.status === 201
      && replayedPlatformTemplate.data.id === createdPlatformTemplate.data.id
      && createdPlatformTemplate.data.status === 'archived'
      && publishedPlatformTemplate.status === 200
      && publishedTemplate?.name === '平台测试菜谱'
      && !Object.prototype.hasOwnProperty.call(publishedTemplate, 'createdBy')
      && signedTemplateAssetResponse.status === 200,
    'platform recipe template creation or publication failed',
    { createdPlatformTemplate, replayedPlatformTemplate, publishedPlatformTemplate, publishedTemplate },
  );

  const importedPlatformTemplate = await api('/api/dish/templates/import', 'token-starter-owner', templateFamilyId, {
    method: 'POST', body: JSON.stringify({ templateIds: [createdPlatformTemplate.data.id] }),
  });
  const platformTemplateDetail = await api(
    `/api/platform/recipe-templates/${encodeURIComponent(createdPlatformTemplate.data.id)}`,
    'token-platform-admin',
  );
  const updatedPlatformTemplate = await api(
    `/api/platform/recipe-templates/${encodeURIComponent(createdPlatformTemplate.data.id)}`,
    'token-platform-admin', undefined, {
      method: 'PUT',
      body: JSON.stringify({
        ...platformTemplateDetail.data,
        name: '平台测试菜谱新版',
        images: [],
        ingredients: [{
          ...platformTemplateDetail.data.ingredients[0],
          name: '鸡蛋',
          ingredientId: platformTemplateDetail.data.ingredients[0].ingredientId,
        }],
        expectedUpdatedAt: platformTemplateDetail.data.updatedAt,
      }),
    },
  );
  const importedPlatformDish = await api(
    `/api/dish/detail?id=${encodeURIComponent(importedPlatformTemplate.data.imported[0].dishId)}`,
    'token-starter-owner', templateFamilyId,
  );
  const deletedPlatformAsset = await api(
    `/api/platform/template-assets/${encodeURIComponent(uploadedTemplateAsset.data.id)}`,
    'token-platform-admin', undefined, { method: 'DELETE' },
  );
  const importedFamilyImageUrl = importedPlatformDish.data.images?.[0] || '';
  const importedFamilyImageLocation = importedFamilyImageUrl ? new URL(importedFamilyImageUrl) : null;
  const importedFamilyImage = importedFamilyImageLocation
    ? await fetch(`${origin}${importedFamilyImageLocation.pathname}${importedFamilyImageLocation.search}`)
    : null;
  const deletedAssetReference = await api(
    `/api/platform/recipe-templates/${encodeURIComponent(createdPlatformTemplate.data.id)}`,
    'token-platform-admin', undefined, {
      method: 'PUT',
      body: JSON.stringify({
        ...updatedPlatformTemplate.data,
        images: [uploadedTemplateAsset.data.filePath],
        expectedUpdatedAt: updatedPlatformTemplate.data.updatedAt,
      }),
    },
  );
  const stalePlatformTemplateArchive = await api(
    `/api/platform/recipe-templates/${encodeURIComponent(createdPlatformTemplate.data.id)}/archive`,
    'token-platform-admin', undefined, {
      method: 'POST',
      body: JSON.stringify({ expectedUpdatedAt: createdPlatformTemplate.data.updatedAt }),
    },
  );
  const archivedPlatformTemplate = await api(
    `/api/platform/recipe-templates/${encodeURIComponent(createdPlatformTemplate.data.id)}/archive`,
    'token-platform-admin', undefined, {
      method: 'POST',
      body: JSON.stringify({ expectedUpdatedAt: updatedPlatformTemplate.data.updatedAt }),
    },
  );
  const publicTemplatesAfterArchive = await api('/api/dish/templates?pageSize=50', 'token-starter-owner', templateFamilyId);
  assert(
    importedPlatformTemplate.status === 201
      && updatedPlatformTemplate.status === 200
      && updatedPlatformTemplate.data.name === '平台测试菜谱新版'
      && updatedPlatformTemplate.data.updatedAt > platformTemplateDetail.data.updatedAt
      && updatedPlatformTemplate.data.ingredients[0].ingredientId === 'template-catalog-egg'
      && importedPlatformDish.status === 200
      && importedPlatformDish.data.name === '平台测试菜谱'
      && importedFamilyImageLocation?.pathname === '/api/file/download'
      && deletedPlatformAsset.status === 200
      && deletedAssetReference.status === 409
      && deletedAssetReference.data.code === 'TEMPLATE_ASSET_MISSING'
      && importedFamilyImage?.status === 200
      && stalePlatformTemplateArchive.status === 409
      && archivedPlatformTemplate.status === 200
      && !publicTemplatesAfterArchive.data.list.some(item => item.id === createdPlatformTemplate.data.id),
    'template editing or archiving changed an imported family copy',
    {
      importedPlatformTemplate,
      updatedPlatformTemplate,
      importedPlatformDish,
      deletedPlatformAsset,
      deletedAssetReference,
      importedFamilyImageStatus: importedFamilyImage?.status,
      workerLogs: logs.slice(-4000),
      stalePlatformTemplateArchive,
      archivedPlatformTemplate,
    },
  );

  const createdCatalogIngredient = await api('/api/platform/ingredients', 'token-platform-admin', undefined, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'it-platform-ingredient-create' },
    body: JSON.stringify({ canonicalName: '平台目录食材', category: '测试', defaultUnit: 'g', aliases: ['目录别名'] }),
  });
  const replayedCatalogIngredient = await api('/api/platform/ingredients', 'token-platform-admin', undefined, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'it-platform-ingredient-create' },
    body: JSON.stringify({ canonicalName: '平台目录食材', category: '测试', defaultUnit: 'g', aliases: ['目录别名'] }),
  });
  const conflictingCatalogAlias = await api('/api/platform/ingredients', 'token-platform-admin', undefined, {
    method: 'POST',
    body: JSON.stringify({ canonicalName: '另一食材', category: '测试', defaultUnit: 'g', aliases: [' 平台 目录食材 '] }),
  });
  const normalizedAliasTemplate = await api('/api/platform/recipe-templates', 'token-platform-admin', undefined, {
    method: 'POST',
    body: JSON.stringify({
      name: '规范化别名测试', type: '炒菜', spicy: '不辣', images: [], steps: ['完成'],
      ingredients: [{ name: '目录-别名', amount: '10g' }],
    }),
  });
  const normalizedAliasTemplateDetail = normalizedAliasTemplate.data.id
    ? await api(`/api/platform/recipe-templates/${encodeURIComponent(normalizedAliasTemplate.data.id)}`, 'token-platform-admin')
    : normalizedAliasTemplate;
  const updatedPlatformCatalogIngredient = await api(
    `/api/platform/ingredients/${encodeURIComponent(createdCatalogIngredient.data.id)}`,
    'token-platform-admin', undefined, {
      method: 'PUT',
      body: JSON.stringify({
        canonicalName: '平台目录食材', category: '蔬菜', defaultUnit: 'kg', aliases: ['目录别名'],
        expectedUpdatedAt: createdCatalogIngredient.data.updatedAt,
      }),
    },
  );
  const platformAudit = await api('/api/platform/audit?pageSize=100', 'token-platform-admin');
  const filteredPlatformAudit = await api(
    `/api/platform/audit?pageSize=100&actorUserId=it-platform-admin&action=platform.ingredient.updated&from=${Date.now() - 86_400_000}&to=${Date.now() + 86_400_000}`,
    'token-platform-admin',
  );
  assert(
    createdCatalogIngredient.status === 201
      && replayedCatalogIngredient.status === 201
      && replayedCatalogIngredient.data.id === createdCatalogIngredient.data.id
      && conflictingCatalogAlias.status === 409
      && conflictingCatalogAlias.data.code === 'INGREDIENT_NAME_CONFLICT'
      && normalizedAliasTemplate.status === 201
      && normalizedAliasTemplateDetail.status === 200
      && normalizedAliasTemplateDetail.data.ingredients[0].ingredientId === createdCatalogIngredient.data.id
      && updatedPlatformCatalogIngredient.status === 200
      && updatedPlatformCatalogIngredient.data.updatedAt > createdCatalogIngredient.data.updatedAt
      && updatedPlatformCatalogIngredient.data.category === '蔬菜'
      && platformAudit.status === 200
      && platformAudit.data.list.some(item => item.action === 'platform.recipe_template.updated')
      && platformAudit.data.list.every(item => !Object.prototype.hasOwnProperty.call(item, 'familyId'))
      && filteredPlatformAudit.status === 200
      && filteredPlatformAudit.data.list.length === 1
      && filteredPlatformAudit.data.list[0].actorUserId === 'it-platform-admin'
      && filteredPlatformAudit.data.list[0].action === 'platform.ingredient.updated',
    'platform ingredient maintenance or audit trail failed',
    {
      createdCatalogIngredient,
      replayedCatalogIngredient,
      conflictingCatalogAlias,
      normalizedAliasTemplate,
      normalizedAliasTemplateDetail,
      updatedPlatformCatalogIngredient,
      platformAudit,
      filteredPlatformAudit,
    },
  );

  const rejoinInvite = await api('/api/family/invite', 'token-owner-a', 'it-family-a', {
    method: 'POST', body: JSON.stringify({ role: 'member' }),
  });
  assert(rejoinInvite.status === 201 && rejoinInvite.data.token, 'rejoin invitation creation failed', rejoinInvite);
  const rejoined = await api('/api/family/invite/accept', 'token-rejoin', undefined, {
    method: 'POST', body: JSON.stringify({ token: rejoinInvite.data.token }),
  });
  assert(
    rejoined.status === 200 && rejoined.data.familyId === 'it-family-a' && rejoined.data.role === 'member',
    'former member could not rejoin with a new invitation',
    rejoined,
  );
  const revokableInvite = await api('/api/family/invite', 'token-owner-a', 'it-family-a', {
    method: 'POST', body: JSON.stringify({ role: 'member' }),
  });
  const revokedInvite = await api('/api/family/invite/revoke', 'token-owner-a', 'it-family-a', {
    method: 'POST', body: JSON.stringify({ invitationId: revokableInvite.data.id }),
  });
  assert(
    revokableInvite.status === 201 && revokedInvite.status === 200,
    'invitation revocation setup failed',
    { revokableInvite, revokedInvite },
  );
  const revokedAcceptance = await api('/api/family/invite/accept', 'token-invitee', undefined, {
    method: 'POST', body: JSON.stringify({ token: revokableInvite.data.token }),
  });
  assert(
    revokedAcceptance.status === 410 && revokedAcceptance.data.code === 'INVITE_REVOKED',
    'revoked invitation was accepted',
    revokedAcceptance,
  );
  const expiredAcceptance = await api('/api/family/invite/accept', 'token-invitee', undefined, {
    method: 'POST', body: JSON.stringify({ token: 'expired-invite' }),
  });
  assert(
    expiredAcceptance.status === 410 && expiredAcceptance.data.code === 'INVITE_EXPIRED',
    'expired invitation was accepted',
    expiredAcceptance,
  );

  const limitInviteA = await api('/api/family/invite', 'token-limit-owner', 'it-family-limit', {
    method: 'POST', body: JSON.stringify({ role: 'member' }),
  });
  const limitInviteB = await api('/api/family/invite', 'token-limit-owner', 'it-family-limit', {
    method: 'POST', body: JSON.stringify({ role: 'member' }),
  });
  assert(
    limitInviteA.status === 201 && limitInviteB.status === 201 && limitInviteA.data.token && limitInviteB.data.token,
    'member-limit invitation setup failed',
    { limitInviteA, limitInviteB },
  );
  const concurrentLimitAccepts = await Promise.all([
    api('/api/family/invite/accept', 'token-limit-a', undefined, {
      method: 'POST', body: JSON.stringify({ token: limitInviteA.data.token }),
    }),
    api('/api/family/invite/accept', 'token-limit-b', undefined, {
      method: 'POST', body: JSON.stringify({ token: limitInviteB.data.token }),
    }),
  ]);
  assert(
    concurrentLimitAccepts.some(result => result.status === 200)
      && concurrentLimitAccepts.some(result => result.status === 409),
    'concurrent invitation accepts did not serialize at the member limit',
    concurrentLimitAccepts,
  );
  const limitedFamily = await api('/api/family/detail', 'token-limit-owner', 'it-family-limit');
  assert(
    limitedFamily.status === 200
      && limitedFamily.data.memberCount <= limitedFamily.data.memberLimit
      && limitedFamily.data.memberCount === 2,
    'concurrent invitation accepts exceeded the family member limit',
    { concurrentLimitAccepts, limitedFamily },
  );

  const crossContext = await api('/api/inventory/detail?id=it-stock-a', 'token-owner-a', 'it-family-b');
  assert(crossContext.status === 403 && crossContext.data.code === 'FAMILY_ACCESS_DENIED', 'cross-family context was not rejected', crossContext);

  const crossDetail = await api('/api/inventory/detail?id=it-stock-b', 'token-owner-a', 'it-family-a');
  assert(crossDetail.status === 404, 'cross-family inventory detail leaked', crossDetail);

  const concurrentProfileUpdates = await Promise.all([
    api('/api/user/info', 'token-member-a', undefined, {
      method: 'PUT', body: JSON.stringify({ nickName: '并发昵称' }),
    }),
    api('/api/user/info', 'token-member-a', undefined, {
      method: 'PUT', body: JSON.stringify({ city: '杭州' }),
    }),
  ]);
  const profileAfterConcurrentUpdates = await api('/api/user/info', 'token-member-a');
  assert(
    concurrentProfileUpdates.every(result => result.status === 200)
      && profileAfterConcurrentUpdates.status === 200
      && profileAfterConcurrentUpdates.data.nickName === '并发昵称'
      && profileAfterConcurrentUpdates.data.city === '杭州',
    'concurrent partial profile updates overwrote each other',
    { concurrentProfileUpdates, profileAfterConcurrentUpdates },
  );

  const concurrentDishUpdates = await Promise.all([
    api('/api/dish/update', 'token-owner-a', 'it-family-a', {
      method: 'PUT', body: JSON.stringify({ id: 'it-dish-a', notice: '并发提示' }),
    }),
    api('/api/dish/update', 'token-owner-a', 'it-family-a', {
      method: 'PUT', body: JSON.stringify({ id: 'it-dish-a', remark: '并发备注' }),
    }),
  ]);
  const dishAfterConcurrentUpdates = await api('/api/dish/detail?id=it-dish-a', 'token-owner-a', 'it-family-a');
  assert(
    concurrentDishUpdates.every(result => result.status === 200)
      && dishAfterConcurrentUpdates.status === 200
      && dishAfterConcurrentUpdates.data.notice === '并发提示'
      && dishAfterConcurrentUpdates.data.remark === '并发备注',
    'concurrent partial dish updates overwrote each other',
    { concurrentDishUpdates, dishAfterConcurrentUpdates },
  );

  const versionedAppointment = await api(
    '/api/appointment/detail?id=it-appointment-idempotent-b',
    'token-owner-a',
    'it-family-a',
  );
  const firstAppointmentUpdate = await api('/api/appointment/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    body: JSON.stringify({
      id: versionedAppointment.data.id,
      remarks: '较新的预约内容',
      dinerIds: ['it-owner-a'],
      expectedUpdateTime: versionedAppointment.data.updateTime,
    }),
  });
  const staleAppointmentUpdate = await api('/api/appointment/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    body: JSON.stringify({
      id: versionedAppointment.data.id,
      remarks: '不应覆盖的新内容',
      dinerIds: ['it-member-a'],
      expectedUpdateTime: versionedAppointment.data.updateTime,
    }),
  });
  const appointmentAfterStaleUpdate = await api(
    `/api/appointment/detail?id=${encodeURIComponent(versionedAppointment.data.id)}`,
    'token-owner-a',
    'it-family-a',
  );
  assert(
    versionedAppointment.status === 200
      && firstAppointmentUpdate.status === 200
      && firstAppointmentUpdate.data.updateTime > versionedAppointment.data.updateTime
      && staleAppointmentUpdate.status === 409
      && staleAppointmentUpdate.data.code === 'APPOINTMENT_CHANGED'
      && appointmentAfterStaleUpdate.data.remarks === '较新的预约内容'
      && appointmentAfterStaleUpdate.data.diners?.length === 1
      && appointmentAfterStaleUpdate.data.diners[0].userId === 'it-owner-a',
    'stale appointment edit overwrote a newer version',
    { versionedAppointment, firstAppointmentUpdate, staleAppointmentUpdate, appointmentAfterStaleUpdate },
  );

  const structuredInventory = await api('/api/inventory/add', 'token-owner-a', 'it-family-a', {
    method: 'POST', body: JSON.stringify({ name: '数量编辑测试', quantity: 1, unit: 'kg', category: '其他' }),
  });
  const editedStructuredInventory = await api('/api/inventory/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT', body: JSON.stringify({
      id: structuredInventory.data.id,
      amount: '3kg',
      expectedUpdateTime: structuredInventory.data.updateTime,
    }),
  });
  const staleStructuredInventory = await api('/api/inventory/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT', body: JSON.stringify({
      id: structuredInventory.data.id,
      amount: '9kg',
      expectedUpdateTime: structuredInventory.data.updateTime,
    }),
  });
  const editedLegacyInventory = await api('/api/inventory/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT', body: JSON.stringify({ id: structuredInventory.data.id, amount: '适量' }),
  });
  const editedQuantityInventory = await api('/api/inventory/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT', body: JSON.stringify({ id: structuredInventory.data.id, quantity: 4, unit: 'kg' }),
  });
  assert(
    structuredInventory.status === 201
      && editedStructuredInventory.status === 200
      && editedStructuredInventory.data.quantity === 3
      && editedStructuredInventory.data.unit === 'kg'
      && editedStructuredInventory.data.legacyAmount === null
      && staleStructuredInventory.status === 409
      && staleStructuredInventory.data.code === 'INVENTORY_CHANGED'
      && editedLegacyInventory.status === 200
      && editedLegacyInventory.data.quantity === null
      && editedLegacyInventory.data.unit === null
      && editedLegacyInventory.data.legacyAmount === '适量'
      && editedQuantityInventory.status === 200
      && editedQuantityInventory.data.quantity === 4
      && editedQuantityInventory.data.unit === 'kg'
      && editedQuantityInventory.data.amount === '4kg'
      && editedQuantityInventory.data.legacyAmount === null,
    'editing inventory amount left stale structured quantity data',
    { structuredInventory, editedStructuredInventory, staleStructuredInventory, editedLegacyInventory },
  );

  const catalogDish = await api('/api/dish/add', 'token-owner-a', 'it-family-a', {
    method: 'POST',
    body: JSON.stringify({
      name: '食材目录编辑测试', type: '家常菜', spicy: '不辣', images: [], steps: ['测试'],
      ingredients: [{ id: 'it-catalog-dish-ingredient', name: '土豆', amount: '1kg', ingredientId: 'it-ingredient-potato' }],
    }),
  });
  const catalogDishUpdate = await api('/api/dish/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    body: JSON.stringify({
      id: catalogDish.data.id,
      expectedUpdateTime: catalogDish.data.updateTime,
      ingredients: [{ id: 'it-catalog-dish-ingredient', name: '豆腐', amount: '3kg', ingredientId: 'it-ingredient-potato' }],
    }),
  });
  const staleCatalogDishUpdate = await api('/api/dish/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    body: JSON.stringify({
      id: catalogDish.data.id,
      expectedUpdateTime: catalogDish.data.updateTime,
      notice: '不应覆盖',
    }),
  });
  const updatedCatalogIngredient = catalogDishUpdate.data.ingredients?.[0];
  assert(
    catalogDish.status === 200
      && catalogDishUpdate.status === 200
      && updatedCatalogIngredient?.ingredientId === 'it-ingredient-tofu'
      && updatedCatalogIngredient?.quantity === 3
      && updatedCatalogIngredient?.unit === 'kg'
      && staleCatalogDishUpdate.status === 409
      && staleCatalogDishUpdate.data.code === 'DISH_CHANGED',
    'dish ingredient edit retained a stale catalog or quantity mapping',
    { catalogDish, catalogDishUpdate, staleCatalogDishUpdate, updatedCatalogIngredient },
  );
  const versionedIngredientAdd = await api('/api/dish/ingredient/add', 'token-owner-a', 'it-family-a', {
    method: 'POST',
    body: JSON.stringify({
      id: 'it-versioned-ingredient',
      dishId: catalogDish.data.id,
      name: '土豆',
      amount: '1kg',
      expectedUpdateTime: catalogDishUpdate.data.updateTime,
    }),
  });
  const staleIngredientAdd = await api('/api/dish/ingredient/add', 'token-owner-a', 'it-family-a', {
    method: 'POST',
    body: JSON.stringify({
      id: 'it-stale-ingredient',
      dishId: catalogDish.data.id,
      name: '土豆',
      amount: '1kg',
      expectedUpdateTime: catalogDishUpdate.data.updateTime,
    }),
  });
  const dishAfterStaleIngredient = await api(`/api/dish/detail?id=${encodeURIComponent(catalogDish.data.id)}`, 'token-owner-a', 'it-family-a');
  assert(
    versionedIngredientAdd.status === 201
      && staleIngredientAdd.status === 409
      && staleIngredientAdd.data.code === 'DISH_CHANGED'
      && dishAfterStaleIngredient.data.ingredients.some(item => item.id === 'it-versioned-ingredient')
      && !dishAfterStaleIngredient.data.ingredients.some(item => item.id === 'it-stale-ingredient'),
    'legacy ingredient endpoint bypassed the dish version',
    { versionedIngredientAdd, staleIngredientAdd, dishAfterStaleIngredient },
  );

  const atomicDishBefore = await api(`/api/dish/detail?id=${encodeURIComponent(catalogDish.data.id)}`, 'token-owner-a', 'it-family-a');
  const failedAtomicDishUpdate = await api('/api/dish/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    body: JSON.stringify({
      id: catalogDish.data.id,
      notice: '不应保存',
      ingredients: [
        { id: 'it-duplicate-ingredient', name: '土豆', amount: '1kg' },
        { id: 'it-duplicate-ingredient', name: '豆腐', amount: '1kg' },
      ],
    }),
  });
  const atomicDishAfter = await api(`/api/dish/detail?id=${encodeURIComponent(catalogDish.data.id)}`, 'token-owner-a', 'it-family-a');
  assert(
    failedAtomicDishUpdate.status >= 400
      && atomicDishAfter.status === 200
      && atomicDishAfter.data.notice === atomicDishBefore.data.notice
      && JSON.stringify(atomicDishAfter.data.ingredients) === JSON.stringify(atomicDishBefore.data.ingredients),
    'failed dish ingredient replacement partially changed the dish',
    { failedAtomicDishUpdate, atomicDishBefore, atomicDishAfter },
  );

  const signedDishImage = await api('/api/dish/detail?id=it-dish-a', 'token-owner-a', 'it-family-a');
  assert(
    signedDishImage.status === 200
      && /^https?:\/\/[^/]+\/api\/file\/download\?/.test(signedDishImage.data.images?.[0] || '')
      && signedDishImage.data.images[0].includes('expires=')
      && signedDishImage.data.images[0].includes('signature='),
    'family file reference was not refreshed to a signed display URL',
    signedDishImage,
  );
  const crossFamilyFile = await api('/api/dish/detail?id=it-dish-b', 'token-owner-b', 'it-family-b');
  assert(
    crossFamilyFile.status === 200 && crossFamilyFile.data.images?.[0] === '',
    'cross-family file reference received a signed URL',
    crossFamilyFile,
  );

  const legacyDishImage = await api('/api/dish/detail?id=it-dish-legacy-image', 'token-owner-a', 'it-family-a');
  assert(
    legacyDishImage.status === 200
      && legacyDishImage.data.images?.join('|') === [
        'https://images.wx.oulongxing.com/dishes/qjcr1_88603_1746002490203.jpeg',
        'https://images.wx.oulongxing.com/dishes/legacy-page.jpeg',
        'https://cdn.example.com/dish.jpeg',
      ].join('|'),
    'legacy R2 image path was not converted to an absolute display URL',
    legacyDishImage,
  );

  const invalidDishImages = await api('/api/dish/detail?id=it-dish-invalid-images', 'token-owner-a', 'it-family-a');
  assert(
    invalidDishImages.status === 200 && Array.isArray(invalidDishImages.data.images) && invalidDishImages.data.images.length === 0,
    'invalid legacy image payload was not safely normalized',
    invalidDishImages,
  );

  const signedFileUrl = new URL(signedDishImage.data.images[0]);
  const signedFileResponse = await fetch(`${origin}${signedFileUrl.pathname}${signedFileUrl.search}`);
  const signedFileBody = await signedFileResponse.json();
  assert(
    signedFileResponse.status === 404 && signedFileBody.code === 'FILE_OBJECT_NOT_FOUND',
    'signed local file download did not reach the R2 object lookup',
    { status: signedFileResponse.status, body: signedFileBody },
  );

  const addedReview = await api('/api/review/add', 'token-owner-a', 'it-family-a', {
    method: 'POST',
    body: JSON.stringify({ appointmentId: 'it-appointment-a', dishId: 'it-dish-a', rating: 5, content: '集成评价' }),
  });
  const userReviews = await api('/api/review/user', 'token-owner-a', 'it-family-a');
  const reviewContract = (userReviews.data.list || []).find(item => item.id === addedReview.data.id);
  assert(
    addedReview.status === 201
      && userReviews.status === 200
      && reviewContract?.dishName === '家庭A菜品'
      && reviewContract?.appointmentDate === '2026-08-17'
      && reviewContract?.mealType === '晚餐'
      && reviewContract?.dishImage,
    'review list did not expose the V2 display contract',
    { addedReview, reviewContract },
  );

  const memberDelete = await api('/api/inventory/delete?id=it-stock-a', 'token-member-a', 'it-family-a', { method: 'DELETE' });
  assert(memberDelete.status === 403 && memberDelete.data.code === 'ROLE_FORBIDDEN', 'member could delete inventory', memberDelete);

  const deductibleInventory = await api('/api/inventory/add', 'token-owner-a', 'it-family-a', {
    method: 'POST', body: JSON.stringify({ name: '并发扣减测试', quantity: 1, unit: 'kg', category: '其他' }),
  });
  assert(deductibleInventory.status === 201 && deductibleInventory.data.id, 'deduction inventory setup failed', deductibleInventory);
  const duplicateDeduction = await api('/api/inventory/deduct', 'token-owner-a', 'it-family-a', {
    method: 'POST',
    body: JSON.stringify({ items: [
      { id: deductibleInventory.data.id, quantity: 0.75 },
      { id: deductibleInventory.data.id, quantity: 0.75 },
    ] }),
  });
  const inventoryAfterDuplicate = await api(`/api/inventory/detail?id=${encodeURIComponent(deductibleInventory.data.id)}`, 'token-owner-a', 'it-family-a');
  assert(
    duplicateDeduction.status === 409 && inventoryAfterDuplicate.data.quantity === 1,
    'duplicate inventory IDs caused a partial deduction',
    { duplicateDeduction, inventoryAfterDuplicate },
  );
  const concurrentDeductions = await Promise.all([
    api('/api/inventory/deduct', 'token-owner-a', 'it-family-a', {
      method: 'POST', body: JSON.stringify({ items: [{ id: deductibleInventory.data.id, quantity: 0.75 }] }),
    }),
    api('/api/inventory/deduct', 'token-owner-a', 'it-family-a', {
      method: 'POST', body: JSON.stringify({ items: [{ id: deductibleInventory.data.id, quantity: 0.75 }] }),
    }),
  ]);
  const inventoryAfterConcurrentDeduction = await api(`/api/inventory/detail?id=${encodeURIComponent(deductibleInventory.data.id)}`, 'token-owner-a', 'it-family-a');
  assert(
    concurrentDeductions.map(result => result.status).sort().join(',') === '200,409'
      && inventoryAfterConcurrentDeduction.data.quantity === 0.25,
    'concurrent inventory deductions did not converge atomically',
    { concurrentDeductions, inventoryAfterConcurrentDeduction },
  );
  const staleInventoryAfterDeduction = await api('/api/inventory/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    body: JSON.stringify({
      id: deductibleInventory.data.id,
      amount: '5kg',
      expectedUpdateTime: deductibleInventory.data.updateTime,
    }),
  });
  const inventoryAfterStaleEdit = await api(`/api/inventory/detail?id=${encodeURIComponent(deductibleInventory.data.id)}`, 'token-owner-a', 'it-family-a');
  assert(
    staleInventoryAfterDeduction.status === 409
      && staleInventoryAfterDeduction.data.code === 'INVENTORY_CHANGED'
      && inventoryAfterStaleEdit.data.quantity === 0.25,
    'stale inventory form overwrote a newer deduction',
    { staleInventoryAfterDeduction, inventoryAfterStaleEdit },
  );

  const memberStatistics = await api('/api/admin/statistics', 'token-member-a', 'it-family-a');
  assert(
    memberStatistics.status === 403 && memberStatistics.data.code === 'ROLE_FORBIDDEN',
    'member could access admin statistics',
    memberStatistics,
  );

  const crossRelation = await api('/api/appointment/preview', 'token-owner-a', 'it-family-a', {
    method: 'POST', body: JSON.stringify({ dishIds: ['it-dish-b'], dinerIds: ['it-member-a'] }),
  });
  assert(crossRelation.status === 400 && crossRelation.data.code === 'CROSS_FAMILY_DISH', 'cross-family appointment relation accepted', crossRelation);

  const lockedConfirmation = await api('/api/appointment/confirm', 'token-owner-b', 'it-family-b', {
    method: 'PUT', body: JSON.stringify({ id: 'it-appointment-lock-b' }),
  });
  const appointmentAfterLockFailure = await api('/api/appointment/detail?id=it-appointment-lock-b', 'token-owner-b', 'it-family-b');
  assert(
    lockedConfirmation.status === 409
      && lockedConfirmation.data.code === 'OPERATION_IN_PROGRESS'
      && appointmentAfterLockFailure.status === 200
      && ['待确认', 'pending'].includes(appointmentAfterLockFailure.data.status),
    'appointment changed before the shopping lock was acquired',
    { lockedConfirmation, appointmentAfterLockFailure },
  );

  const missingContext = await api('/api/dish/list', 'token-shared');
  assert(missingContext.status === 400 && missingContext.data.code === 'FAMILY_CONTEXT_REQUIRED', 'multi-family context was inferred incorrectly', missingContext);

  const dissolvedOnly = await api('/api/dish/list', 'token-dissolved');
  assert(dissolvedOnly.status === 409 && dissolvedOnly.data.code === 'NO_FAMILY', 'dissolved family was inferred as active context', dissolvedOnly);

  const sharedA = await api('/api/family/detail', 'token-shared', 'it-family-a');
  const sharedB = await api('/api/family/detail', 'token-shared', 'it-family-b');
  assert(sharedA.status === 200 && sharedB.status === 200, 'overlapping member could not switch families', { sharedA, sharedB });

  const transferred = await api('/api/family/transfer', 'token-owner-b', 'it-family-b', {
    method: 'POST', body: JSON.stringify({ userId: 'it-shared' }),
  });
  assert(transferred.status === 200 && transferred.data.ownerId === 'it-shared', 'ownership transfer failed', transferred);
  const transferredBack = await api('/api/family/transfer', 'token-shared', 'it-family-b', {
    method: 'POST', body: JSON.stringify({ userId: 'it-owner-b' }),
  });
  assert(transferredBack.status === 200 && transferredBack.data.ownerId === 'it-owner-b', 'ownership transfer back failed', transferredBack);

  const sharedAppointmentKey = 'it-appointment-shared-key';
  const idempotentConfirm = await api('/api/appointment/confirm', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    headers: { 'Idempotency-Key': sharedAppointmentKey },
    body: JSON.stringify({ id: 'it-appointment-idempotent-b' }),
  });
  const idempotentComplete = await api('/api/appointment/complete', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    headers: { 'Idempotency-Key': sharedAppointmentKey },
    body: JSON.stringify({ id: 'it-appointment-idempotent-c', confirmDeduction: true, deductions: [] }),
  });
  const idempotentReplay = await api('/api/appointment/confirm', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    headers: { 'Idempotency-Key': sharedAppointmentKey },
    body: JSON.stringify({ id: 'it-appointment-idempotent-b' }),
  });
  assert(
    idempotentConfirm.status === 200
      && idempotentConfirm.data.id === 'it-appointment-idempotent-b'
      && idempotentConfirm.data.status === '已确认'
      && idempotentComplete.status === 200
      && idempotentComplete.data.id === 'it-appointment-idempotent-c'
      && idempotentComplete.data.status === '已完成',
    'same idempotency key collided across appointment operations or resources',
    { idempotentConfirm, idempotentComplete },
  );
  assert(
    idempotentReplay.status === 200
      && idempotentReplay.data.id === idempotentConfirm.data.id
      && idempotentReplay.data.status === idempotentConfirm.data.status
      && idempotentReplay.data.updateTime === idempotentConfirm.data.updateTime,
    'idempotent appointment replay did not return the original response',
    { idempotentConfirm, idempotentReplay },
  );

  const completionRequest = key => api('/api/appointment/complete', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      id: 'it-appointment-a',
      confirmDeduction: true,
      deductions: [{ id: 'it-stock-a', quantity: 0.25 }],
    }),
  });
  const completionPreviewBeforeEdit = await api('/api/appointment/complete', 'token-owner-a', 'it-family-a', {
    method: 'PUT', body: JSON.stringify({ id: 'it-appointment-stale-complete' }),
  });
  const appointmentEditBeforeCompletion = await api('/api/appointment/update', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    body: JSON.stringify({
      id: 'it-appointment-stale-complete',
      remarks: '完成前更新',
      expectedUpdateTime: completionPreviewBeforeEdit.data.appointmentUpdateTime,
    }),
  });
  const staleCompletion = await api('/api/appointment/complete', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    headers: { 'Idempotency-Key': 'it-stale-completion' },
    body: JSON.stringify({
      id: 'it-appointment-stale-complete',
      confirmDeduction: true,
      expectedUpdateTime: completionPreviewBeforeEdit.data.appointmentUpdateTime,
      deductions: [{ id: 'it-stock-a', quantity: 0.25 }],
    }),
  });
  const inventoryAfterStaleCompletion = await api('/api/inventory/detail?id=it-stock-a', 'token-owner-a', 'it-family-a');
  assert(
    completionPreviewBeforeEdit.status === 200
      && appointmentEditBeforeCompletion.status === 200
      && staleCompletion.status === 409
      && staleCompletion.data.code === 'APPOINTMENT_CHANGED'
      && inventoryAfterStaleCompletion.data.quantity === 1,
    'stale completion preview completed a newer appointment or deducted inventory',
    { completionPreviewBeforeEdit, appointmentEditBeforeCompletion, staleCompletion, inventoryAfterStaleCompletion },
  );
  const concurrentCompletions = await Promise.all([
    completionRequest('it-complete-a'),
    completionRequest('it-complete-b'),
  ]);
  assert(
    concurrentCompletions.map(result => result.status).sort().join(',') === '200,409',
    'concurrent completion was not serialized',
    concurrentCompletions,
  );
  const inventoryAfterCompletion = await api('/api/inventory/detail?id=it-stock-a', 'token-owner-a', 'it-family-a');
  assert(
    inventoryAfterCompletion.status === 200 && inventoryAfterCompletion.data.quantity === 0.75,
    'concurrent completion deducted inventory more than once',
    inventoryAfterCompletion,
  );

  const finalAppointmentAdd = await api('/api/appointment/dish/add', 'token-owner-a', 'it-family-a', {
    method: 'POST', body: JSON.stringify({ appointmentId: 'it-appointment-a', dishId: 'it-dish-a' }),
  });
  const finalAppointmentRemove = await api('/api/appointment/dish/remove?id=it-appointment-dish-a', 'token-owner-a', 'it-family-a', {
    method: 'DELETE',
  });
  assert(
    finalAppointmentAdd.status === 409 && finalAppointmentAdd.data.code === 'APPOINTMENT_FINAL'
      && finalAppointmentRemove.status === 409 && finalAppointmentRemove.data.code === 'APPOINTMENT_FINAL',
    'final appointment relations could be modified',
    { finalAppointmentAdd, finalAppointmentRemove },
  );

  const concurrentStockIns = await Promise.all([
    api('/api/shopping/stock-in', 'token-owner-a', 'it-family-a', {
      method: 'POST', body: JSON.stringify({ itemIds: ['it-shopping-stock-a'] }),
    }),
    api('/api/shopping/stock-in', 'token-owner-a', 'it-family-a', {
      method: 'POST', body: JSON.stringify({ itemIds: ['it-shopping-stock-a'] }),
    }),
  ]);
  assert(
    concurrentStockIns.some(result => result.status === 200)
      && concurrentStockIns.every(result => result.status === 200 || result.status === 409),
    'concurrent stock-in requests did not converge on one winner',
    concurrentStockIns,
  );
  const inventoryAfterStockIn = await api('/api/inventory/list', 'token-owner-a', 'it-family-a');
  const stockedRows = (inventoryAfterStockIn.data.list || [])
    .filter(item => item.sourceShoppingItemId === 'it-shopping-stock-a');
  assert(
    inventoryAfterStockIn.status === 200 && stockedRows.length === 1,
    'concurrent stock-in created duplicate inventory rows',
    { concurrentStockIns, inventoryAfterStockIn, stockedRows },
  );
  const shanghaiToday = dateInTimezone(new Date(), 'Asia/Shanghai');
  const timezoneInventory = await api('/api/inventory/add', 'token-owner-a', 'it-family-a', {
    method: 'POST',
    body: JSON.stringify({ name: '时区临期测试', amount: '1个', category: '其他', expiryDate: shanghaiToday }),
  });
  const escapedInventory = await api('/api/inventory/add', 'token-owner-a', 'it-family-a', {
    method: 'POST',
    body: JSON.stringify({ name: '百分%下划_反斜\\测试', amount: '1个', category: '其他' }),
  });
  const repeatedEscapedInventory = await api('/api/inventory/add', 'token-owner-a', 'it-family-a', {
    method: 'POST',
    body: JSON.stringify({ name: '百分%下划_反斜\\测试', amount: '2个', category: '其他' }),
  });
  const expiringInventory = await api('/api/inventory/expiring?days=3', 'token-owner-a', 'it-family-a');
  const expiringInventoryPage = await api(
    `/api/inventory/list?keyword=${encodeURIComponent('时区临期测试')}&expiryState=expiring&expiringDays=3`,
    'token-owner-a',
    'it-family-a',
  );
  const escapedInventorySearches = await Promise.all(['%', '_', '\\'].map(keyword => api(
    `/api/inventory/list?keyword=${encodeURIComponent(keyword)}`,
    'token-owner-a',
    'it-family-a',
  )));
  assert(
    timezoneInventory.status === 201
      && expiringInventory.status === 200
      && expiringInventory.data.list.some(item => item.id === timezoneInventory.data.id)
      && !expiringInventory.data.list.some(item => item.id === 'it-stock-a')
      && expiringInventoryPage.data.list.some(item => item.id === timezoneInventory.data.id)
      && escapedInventory.status === 201
      && repeatedEscapedInventory.status === 201
      && repeatedEscapedInventory.data.ingredientId === escapedInventory.data.ingredientId
      && escapedInventorySearches.every(result => result.status === 200
        && result.data.list.length === 2
        && result.data.list.some(item => item.id === escapedInventory.data.id)
        && result.data.list.some(item => item.id === repeatedEscapedInventory.data.id)),
    'inventory timezone boundary, expiring endpoint, or escaped keyword search diverged',
    {
      timezoneInventory,
      escapedInventory,
      repeatedEscapedInventory,
      expiringInventory,
      expiringInventoryPage,
      escapedInventorySearches,
    },
  );
  const filteredInventory = await api(
    '/api/inventory/list?page=1&pageSize=1&keyword=%E5%9C%9F&expiryState=expired&expiringDays=3',
    'token-owner-a',
    'it-family-a',
  );
  const invalidInventoryFilter = await api(
    '/api/inventory/list?expiryState=unknown',
    'token-owner-a',
    'it-family-a',
  );
  assert(
    filteredInventory.status === 200
      && filteredInventory.data.page === 1
      && filteredInventory.data.pageSize === 1
      && filteredInventory.data.list.length === 1
      && filteredInventory.data.list[0].name === '土豆'
      && filteredInventory.data.hasMore === false
      && filteredInventory.data.summary.total === 1
      && filteredInventory.data.summary.expired === 1
      && invalidInventoryFilter.status === 400
      && invalidInventoryFilter.data.code === 'VALIDATION_ERROR',
    'inventory server pagination, expiry filter, or summary contract failed',
    { filteredInventory, invalidInventoryFilter },
  );

  const recommendations = await api(
    '/api/dish/recommend?dinerIds=it-member-a&page=1&pageSize=1',
    'token-owner-a',
    'it-family-a',
  );
  assert(
    recommendations.status === 200
      && recommendations.data.page === 1
      && recommendations.data.pageSize === 1
      && typeof recommendations.data.total === 'number'
      && typeof recommendations.data.hasMore === 'boolean'
      && recommendations.data.list.length <= 1,
    'recommendation pagination contract failed',
    recommendations,
  );
  const allRecommendations = await api(
    '/api/dish/recommend?dinerIds=it-member-a&page=1&pageSize=50',
    'token-owner-a',
    'it-family-a',
  );
  const dishARecommendation = (allRecommendations.data.list || []).find(item => item.id === 'it-dish-a');
  const crossFamilyRecommendations = await api(
    '/api/dish/recommend?page=1&pageSize=20',
    'token-owner-a',
    'it-family-b',
  );
  assert(
    allRecommendations.status === 200
      && dishARecommendation
      && !(dishARecommendation.expiring || []).some(item => !item.expiryDate || item.expiryDate < shanghaiToday)
      && crossFamilyRecommendations.status === 403,
    'recommendation included expired/undated stock or crossed the family boundary',
    { dishARecommendation, crossFamilyRecommendations },
  );
  const invalidTimezoneUpdate = await api('/api/family/detail', 'token-owner-a', 'it-family-a', {
    method: 'PUT', body: JSON.stringify({ name: '集成家庭A', timezone: 'Invalid/Timezone' }),
  });
  const invalidTimezoneInventory = await api('/api/inventory/list?page=1&pageSize=1', 'token-owner-a', 'it-family-a');
  const invalidTimezoneRecommendations = await api('/api/dish/recommend?page=1&pageSize=1', 'token-owner-a', 'it-family-a');
  const timezoneRestore = await api('/api/family/detail', 'token-owner-a', 'it-family-a', {
    method: 'PUT', body: JSON.stringify({ name: '集成家庭A', timezone: 'Asia/Shanghai' }),
  });
  assert(
    invalidTimezoneUpdate.status === 200
      && invalidTimezoneInventory.status === 200
      && invalidTimezoneRecommendations.status === 200
      && timezoneRestore.status === 200,
    'invalid family timezone crashed inventory or recommendation instead of using the fallback',
    { invalidTimezoneUpdate, invalidTimezoneInventory, invalidTimezoneRecommendations, timezoneRestore },
  );

  const concurrentRecalculations = await Promise.all([
    api('/api/shopping/recalculate', 'token-owner-a', 'it-family-a', { method: 'POST' }),
    api('/api/shopping/recalculate', 'token-owner-a', 'it-family-a', { method: 'POST' }),
  ]);
  assert(
    concurrentRecalculations.some(result => result.status === 200)
      && concurrentRecalculations.every(result => result.status === 200 || result.status === 409),
    'concurrent shopping recalculations did not complete safely',
    concurrentRecalculations,
  );
  const shoppingAfterRecalculation = await api('/api/shopping/list', 'token-owner-a', 'it-family-a');
  const onionItems = (shoppingAfterRecalculation.data.items || [])
    .filter(item => item.sourceType === 'appointment' && item.name === '洋葱');
  assert(
    shoppingAfterRecalculation.status === 200 && onionItems.length === 1,
    'concurrent shopping recalculation created duplicate automatic items',
    { concurrentRecalculations, shoppingAfterRecalculation, onionItems },
  );

  const mixedRecalculation = await api('/api/shopping/recalculate', 'token-limit-owner', 'it-family-limit', { method: 'POST' });
  const mixedShopping = await api('/api/shopping/list', 'token-limit-owner', 'it-family-limit');
  const tofuItems = (mixedShopping.data.items || []).filter(item => item.sourceType === 'appointment' && item.name === '豆腐');
  assert(
    mixedRecalculation.status === 200
      && mixedShopping.data.familyName === '人数上限家庭'
      && tofuItems.length === 1
      && tofuItems[0].quantity === 1000
      && tofuItems[0].unit === 'g',
    'mixed catalog and legacy requirements reused the same inventory quantity',
    { mixedRecalculation, mixedShopping, tofuItems },
  );

  const manualRaceItem = await api('/api/shopping/item', 'token-owner-a', 'it-family-a', {
    method: 'POST', body: JSON.stringify({ name: '删除竞争测试', quantity: 1, unit: '个' }),
  });
  const shoppingMutationRace = await Promise.all([
    api('/api/shopping/item', 'token-owner-a', 'it-family-a', {
      method: 'PUT', body: JSON.stringify({ id: manualRaceItem.data.id, checked: true }),
    }),
    api(`/api/shopping/item?id=${encodeURIComponent(manualRaceItem.data.id)}`, 'token-owner-a', 'it-family-a', { method: 'DELETE' }),
  ]);
  const shoppingAfterMutationRace = await api('/api/shopping/list', 'token-owner-a', 'it-family-a');
  const racedItem = (shoppingAfterMutationRace.data.items || []).find(item => item.id === manualRaceItem.data.id);
  const updateWon = shoppingMutationRace[0].status === 200;
  assert(
    manualRaceItem.status === 201
      && shoppingMutationRace.filter(result => result.status === 200).length === 1
      && (!updateWon || (racedItem && racedItem.checked === true)),
    'shopping delete and purchase update both succeeded or lost purchased history',
    { shoppingMutationRace, racedItem },
  );

  const staleVersionItem = await api('/api/shopping/item', 'token-owner-a', 'it-family-a', {
    method: 'POST', body: JSON.stringify({ name: '版本冲突测试', quantity: 1, unit: '个' }),
  });
  const shoppingBeforeVersionUpdate = await api('/api/shopping/list', 'token-owner-a', 'it-family-a');
  const versionSnapshot = (shoppingBeforeVersionUpdate.data.items || []).find(item => item.id === staleVersionItem.data.id);
  const firstVersionUpdate = await api('/api/shopping/item', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    body: JSON.stringify({ id: staleVersionItem.data.id, checked: true, expectedUpdatedAt: versionSnapshot?.updatedAt }),
  });
  const staleVersionUpdate = await api('/api/shopping/item', 'token-owner-a', 'it-family-a', {
    method: 'PUT',
    body: JSON.stringify({ id: staleVersionItem.data.id, assigneeId: 'it-owner-a', expectedUpdatedAt: versionSnapshot?.updatedAt }),
  });
  assert(
    staleVersionItem.status === 201
      && versionSnapshot
      && firstVersionUpdate.status === 200
      && staleVersionUpdate.status === 409
      && staleVersionUpdate.data.code === 'SHOPPING_ITEM_CHANGED',
    'stale shopping item update overwrote a newer client version',
    { staleVersionItem, versionSnapshot, firstVersionUpdate, staleVersionUpdate },
  );

  const accountExport = await api('/api/user/export', 'token-member-a');
  assert(
    accountExport.status === 200
      && accountExport.data.profile?.id === 'it-member-a'
      && !JSON.stringify(accountExport.data).includes('token-member-a'),
    'account export failed or leaked a bearer token',
    accountExport,
  );

  const ownerDeletion = await api('/api/user/account', 'token-owner-a', undefined, {
    method: 'DELETE', body: JSON.stringify({ confirm: true }),
  });
  assert(
    ownerDeletion.status === 409 && ownerDeletion.data.code === 'OWNER_TRANSFER_REQUIRED',
    'active family owner could delete account',
    ownerDeletion,
  );

  const platformAdminDeletion = await api('/api/user/account', 'token-platform-admin', undefined, {
    method: 'DELETE', body: JSON.stringify({ confirm: true }),
  });
  const platformAdminSessionAfterDeletionAttempt = await api('/api/platform/status', 'token-platform-admin');
  assert(
    platformAdminDeletion.status === 409
      && platformAdminDeletion.data.code === 'PLATFORM_ADMIN_ACCOUNT_PROTECTED'
      && platformAdminSessionAfterDeletionAttempt.status === 200
      && platformAdminSessionAfterDeletionAttempt.data.isPlatformAdmin === true,
    'platform administrator could delete or invalidate the protected account',
    { platformAdminDeletion, platformAdminSessionAfterDeletionAttempt },
  );

  const ownerTransferDeleteRace = await Promise.all([
    api('/api/family/transfer', 'token-owner-a', 'it-family-a', {
      method: 'POST', body: JSON.stringify({ userId: 'it-shared' }),
    }),
    api('/api/user/account', 'token-shared', undefined, {
      method: 'DELETE', body: JSON.stringify({ confirm: true }),
    }),
  ]);
  const membersAfterOwnerRace = await api('/api/family/members', 'token-owner-a', 'it-family-a');
  const ownersAfterRace = (membersAfterOwnerRace.data.list || []).filter(member => member.role === 'owner');
  assert(
    ownerTransferDeleteRace.filter(result => result.status === 200).length === 1
      && membersAfterOwnerRace.status === 200
      && ownersAfterRace.length === 1,
    'owner transfer and account deletion left the family without exactly one owner',
    { ownerTransferDeleteRace, membersAfterOwnerRace },
  );
  if (ownerTransferDeleteRace[0].status === 200) {
    const ownerRaceRestore = await api('/api/family/transfer', 'token-shared', 'it-family-a', {
      method: 'POST', body: JSON.stringify({ userId: 'it-owner-a' }),
    });
    assert(ownerRaceRestore.status === 200, 'owner race cleanup transfer failed', ownerRaceRestore);
  }

  const memberDeletion = await api('/api/user/account', 'token-member-a', undefined, {
    method: 'DELETE', body: JSON.stringify({ confirm: true }),
  });
  assert(memberDeletion.status === 200 && memberDeletion.data.success === true, 'member account deletion failed', memberDeletion);

  const revokedSession = await api('/api/user/export', 'token-member-a');
  assert(revokedSession.status === 401, 'deleted account session remained active', revokedSession);

  console.log('Worker+D1 integration checks passed (72 assertions).');
} finally {
  worker.kill('SIGTERM');
  await delay(200);
  if (!worker.killed) worker.kill('SIGKILL');
}
