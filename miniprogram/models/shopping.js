// 采购清单数据模型。购物接口使用 camelCase，但这里也兼容历史/代理层可能返回的 snake_case。

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function firstDefined() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

/**
 * 将接口返回的采购项整理为页面使用的稳定字段。
 * 保留未知字段，便于服务端增加展示信息时不丢失数据。
 */
function normalizeShoppingItem(raw) {
  const item = raw || {};
  const quantity = firstDefined(item.quantity, item.amount, item.qty);
  const note = firstDefined(item.note, item.notes, item.legacyAmount);
  const assigneeId = firstDefined(item.assigneeId, item.assignee_id, item.buyerId, item.buyer_id);
  const assigneeName = firstDefined(item.assigneeName, item.assignee_name, item.buyerName, item.buyer_name);
  const sourceType = firstDefined(item.sourceType, item.source_type, item.source, 'manual');
  const checked = item.checked === true || item.checked === 1 || item.checked === '1' || item.checked === 'true';

  return {
    ...item,
    id: firstDefined(item.id, item.itemId, item.item_id),
    name: String(firstDefined(item.name, item.ingredientName, item.ingredient_name, '未命名食材')),
    ingredientId: firstDefined(item.ingredientId, item.ingredient_id),
    quantity: quantity === '' ? '' : quantity,
    unit: String(firstDefined(item.unit, '')),
    note: String(note || ''),
    sourceType: String(sourceType),
    appointmentIds: asArray(firstDefined(item.appointmentIds, item.appointment_ids)),
    assigneeId: String(assigneeId || ''),
    assigneeName: String(assigneeName || ''),
    checked,
    purchasedAt: firstDefined(item.purchasedAt, item.purchased_at),
    stockedAt: firstDefined(item.stockedAt, item.stocked_at)
  };
}

function normalizeShoppingListResponse(payload) {
  const body = payload || {};
  if (body && !Array.isArray(body) && body.data && typeof body.data === 'object' && body.data !== body) {
    return normalizeShoppingListResponse(body.data);
  }
  const items = Array.isArray(body)
    ? body
    : (Array.isArray(body.items) ? body.items : (Array.isArray(body.list) ? body.list : []));

  return {
    ...(!Array.isArray(body) ? body : {}),
    id: firstDefined(!Array.isArray(body) ? body.id : ''),
    familyId: firstDefined(!Array.isArray(body) ? body.familyId : '', !Array.isArray(body) ? body.family_id : ''),
    items: items.map(normalizeShoppingItem)
  };
}

function isPurchasedItem(item) {
  return !!(item && (item.checked || item.purchasedAt));
}

function isStockedItem(item) {
  return !!(item && item.stockedAt);
}

module.exports = {
  normalizeShoppingItem,
  normalizeShoppingListResponse,
  isPurchasedItem,
  isStockedItem
};
