// 家庭共享采购清单服务
const { request } = require('./http');

function getToken() {
  return wx.getStorageSync('token') || '';
}

function getActiveFamilyId() {
  const value = wx.getStorageSync('active_family_id');
  if (value && typeof value === 'object') {
    return value.id || value.familyId || value.family_id || '';
  }
  return value || '';
}

function getFamilyContext() {
  const familyId = String(getActiveFamilyId() || '');
  if (!familyId) throw new Error('请先选择一个家庭');
  return {
    familyId
  };
}

function familyRequest(url, method, data) {
  const context = getFamilyContext();
  const header = {
    'X-Family-Id': context.familyId
  };

  return request({
    url,
    method,
    data,
    header
  });
}

function getShoppingList(status) {
  return familyRequest('/api/shopping/list', 'GET', {
    status: status || 'active'
  });
}

function addShoppingItem(item) {
  return familyRequest('/api/shopping/item', 'POST', item || {});
}

function updateShoppingItem(item) {
  return familyRequest('/api/shopping/item', 'PUT', item || {});
}

function deleteShoppingItem(id) {
  const query = encodeURIComponent(String(id || ''));
  return familyRequest(`/api/shopping/item?id=${query}`, 'DELETE');
}

function recalculateShoppingList() {
  return familyRequest('/api/shopping/recalculate', 'POST');
}

function stockInShoppingItems(itemIds) {
  return familyRequest('/api/shopping/stock-in', 'POST', {
    itemIds: Array.isArray(itemIds) ? itemIds : []
  });
}

class ShoppingService {
  static getShoppingList(status) {
    return getShoppingList(status);
  }

  static addShoppingItem(item) {
    return addShoppingItem(item);
  }

  static updateShoppingItem(item) {
    return updateShoppingItem(item);
  }

  static deleteShoppingItem(id) {
    return deleteShoppingItem(id);
  }

  static recalculateShoppingList() {
    return recalculateShoppingList();
  }

  static stockInShoppingItems(itemIds) {
    return stockInShoppingItems(itemIds);
  }
}

module.exports = {
  ShoppingService,
  getToken,
  getActiveFamilyId,
  getShoppingList,
  addShoppingItem,
  updateShoppingItem,
  deleteShoppingItem,
  recalculateShoppingList,
  stockInShoppingItems,
  // Short aliases make the service convenient for pages and preserve a small API surface.
  list: getShoppingList,
  addItem: addShoppingItem,
  updateItem: updateShoppingItem,
  deleteItem: deleteShoppingItem,
  recalculate: recalculateShoppingList,
  stockIn: stockInShoppingItems
};
