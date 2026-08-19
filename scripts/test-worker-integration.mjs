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

function assert(condition, message, details) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(details)}`);
}

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

  const ownerFamilies = await api('/api/family/list', 'token-owner-a');
  assert(ownerFamilies.status === 200 && ownerFamilies.data.list.some(item => item.id === 'it-family-a'), 'owner family list failed', ownerFamilies);

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

  console.log('Worker+D1 integration checks passed (53 assertions).');
} finally {
  worker.kill('SIGTERM');
  await delay(200);
  if (!worker.killed) worker.kill('SIGKILL');
}
