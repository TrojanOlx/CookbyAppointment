import { createJsonResponse, createErrorResponse } from '../wxApi.js';

// 获取库存列表
export async function handleGetInventoryList(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token和获取用户信息
    const { loginInfo, user } = await validateTokenAndGetUser(env.DB, token);
    if (!loginInfo || !user) {
      return createErrorResponse('无效的token或用户不存在', 401);
    }
    
    // 获取查询参数
    const query = new URL(request.url).searchParams;
    const page = parseInt(query.get('page')) || 1;
    const pageSize = parseInt(query.get('pageSize')) || 10;
    const category = query.get('category') || null;
    
    // 查询库存列表
    const { total, items } = await getInventoryList(env.DB, user.id, page, pageSize, category);
    
    return createJsonResponse({ total, list: items });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取库存详情
export async function handleGetInventoryDetail(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token和获取用户信息
    const { loginInfo, user } = await validateTokenAndGetUser(env.DB, token);
    if (!loginInfo || !user) {
      return createErrorResponse('无效的token或用户不存在', 401);
    }
    
    // 获取查询参数
    const query = new URL(request.url).searchParams;
    const id = query.get('id');
    
    if (!id) {
      return createErrorResponse('缺少id参数');
    }
    
    // 查询库存详情
    const item = await getInventoryById(env.DB, id);
    
    if (!item) {
      return createErrorResponse('库存项不存在', 404);
    }
    
    return createJsonResponse(item);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 添加库存
export async function handleAddInventory(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token和获取用户信息
    const { loginInfo, user } = await validateTokenAndGetUser(env.DB, token);
    if (!loginInfo || !user) {
      return createErrorResponse('无效的token或用户不存在', 401);
    }
    
    // 获取请求数据
    const data = await request.json();
    
    // 验证必要字段
    if (!data.name || !data.amount) {
      return createErrorResponse('名称和数量为必填项');
    }
    
    // 创建库存项
    const newItem = {
      ...data,
      userId: user.id,
      openid: user.openid,
      createTime: Date.now(),
      updateTime: Date.now()
    };
    
    const createdItem = await createInventoryItem(env.DB, newItem);
    
    return createJsonResponse(createdItem);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 更新库存
export async function handleUpdateInventory(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token和获取用户信息
    const { loginInfo, user } = await validateTokenAndGetUser(env.DB, token);
    if (!loginInfo || !user) {
      return createErrorResponse('无效的token或用户不存在', 401);
    }
    
    // 获取请求数据
    const data = await request.json();
    
    if (!data.id) {
      return createErrorResponse('缺少id参数');
    }
    
    // 查询库存项
    const existingItem = await getInventoryById(env.DB, data.id);
    
    if (!existingItem) {
      return createErrorResponse('库存项不存在', 404);
    }
    
    // 只有管理员或所有者可以更新库存
    if (existingItem.userId !== user.id && user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 更新库存项
    const updatedItem = {
      ...existingItem,
      ...data,
      updateTime: Date.now()
    };
    
    await updateInventoryItem(env.DB, updatedItem);
    
    return createJsonResponse(updatedItem);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 删除库存
export async function handleDeleteInventory(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token和获取用户信息
    const { loginInfo, user } = await validateTokenAndGetUser(env.DB, token);
    if (!loginInfo || !user) {
      return createErrorResponse('无效的token或用户不存在', 401);
    }
    
    // 获取请求数据
    const query = new URL(request.url).searchParams;
    const id = query.get('id');
    
    if (!id) {
      return createErrorResponse('缺少id参数');
    }
    
    // 查询库存项
    const existingItem = await getInventoryById(env.DB, id);
    
    if (!existingItem) {
      return createErrorResponse('库存项不存在', 404);
    }
    
    // 只有管理员或所有者可以删除库存
    if (existingItem.userId !== user.id && user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 删除库存项
    await deleteInventoryItem(env.DB, id);
    
    return createJsonResponse({ success: true });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 搜索库存
export async function handleSearchInventory(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token和获取用户信息
    const { loginInfo, user } = await validateTokenAndGetUser(env.DB, token);
    if (!loginInfo || !user) {
      return createErrorResponse('无效的token或用户不存在', 401);
    }
    
    // 获取查询参数
    const query = new URL(request.url).searchParams;
    const keyword = query.get('keyword');
    const page = parseInt(query.get('page')) || 1;
    const pageSize = parseInt(query.get('pageSize')) || 10;
    
    if (!keyword) {
      return createErrorResponse('缺少keyword参数');
    }
    
    // 搜索库存
    const { total, items } = await searchInventoryItems(env.DB, user.id, keyword, page, pageSize);
    
    return createJsonResponse({ total, list: items });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取即将过期的食材
export async function handleGetExpiringItems(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token和获取用户信息
    const { loginInfo, user } = await validateTokenAndGetUser(env.DB, token);
    if (!loginInfo || !user) {
      return createErrorResponse('无效的token或用户不存在', 401);
    }
    
    // 获取查询参数
    const query = new URL(request.url).searchParams;
    const days = parseInt(query.get('days')) || 3;
    const page = parseInt(query.get('page')) || 1;
    const pageSize = parseInt(query.get('pageSize')) || 10;
    
    // 计算过期日期
    const currentDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(currentDate.getDate() + days);
    
    // 获取即将过期的食材
    const { total, items } = await getExpiringInventoryItems(
      env.DB, 
      user.id, 
      formatDate(expiryDate), 
      page, 
      pageSize
    );
    
    return createJsonResponse({ total, list: items });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 数据库操作函数
async function validateTokenAndGetUser(db, token) {
  // 验证token
  const loginInfoStmt = db.prepare('SELECT * FROM login_info WHERE token = ?').bind(token);
  const loginInfo = await loginInfoStmt.first();
  
  if (!loginInfo) {
    return { loginInfo: null, user: null };
  }
  
  // 获取用户信息
  const userStmt = db.prepare('SELECT * FROM users WHERE openid = ?').bind(loginInfo.openid);
  const user = await userStmt.first();
  
  return { loginInfo, user };
}

async function getInventoryList(db, userId, page, pageSize, category = null) {
  // 计算偏移量
  const offset = (page - 1) * pageSize;
  
  // 构建SQL
  let countSql = 'SELECT COUNT(*) as total FROM inventory_items WHERE userId = ?';
  let listSql = 'SELECT * FROM inventory_items WHERE userId = ?';
  let params = [userId];
  
  // 添加分类过滤
  if (category) {
    countSql += ' AND category = ?';
    listSql += ' AND category = ?';
    params.push(category);
  }
  
  // 添加分页
  listSql += ' ORDER BY createTime DESC LIMIT ? OFFSET ?';
  
  // 获取总数
  const countStmt = db.prepare(countSql).bind(...params);
  const { total } = await countStmt.first();
  
  // 获取列表
  const listStmt = db.prepare(listSql).bind(...params, pageSize, offset);
  const result = await listStmt.all();
  
  return { total, items: result.results };
}

async function getInventoryById(db, id) {
  const stmt = db.prepare('SELECT * FROM inventory_items WHERE id = ?').bind(id);
  return await stmt.first();
}

async function createInventoryItem(db, item) {
  const id = crypto.randomUUID();
  
  const stmt = db.prepare(`
    INSERT INTO inventory_items (
      id, userId, openid, name, amount, category, status, 
      putInDate, expiryDate, image, remarks, createTime, updateTime
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    item.userId,
    item.openid,
    item.name,
    item.amount,
    item.category || '其他',
    item.status || '正常',
    item.putInDate,
    item.expiryDate,
    item.image || null,
    item.remarks || '',
    item.createTime,
    item.updateTime
  );
  
  await stmt.run();
  return { id, ...item };
}

async function updateInventoryItem(db, item) {
  const stmt = db.prepare(`
    UPDATE inventory_items
    SET name = ?, amount = ?, category = ?, status = ?,
        putInDate = ?, expiryDate = ?, image = ?, remarks = ?, updateTime = ?
    WHERE id = ?
  `).bind(
    item.name,
    item.amount,
    item.category,
    item.status,
    item.putInDate,
    item.expiryDate,
    item.image,
    item.remarks || '',
    item.updateTime,
    item.id
  );
  
  await stmt.run();
  return item;
}

async function deleteInventoryItem(db, id) {
  const stmt = db.prepare('DELETE FROM inventory_items WHERE id = ?').bind(id);
  await stmt.run();
  return true;
}

async function searchInventoryItems(db, userId, keyword, page, pageSize) {
  // 计算偏移量
  const offset = (page - 1) * pageSize;
  
  // 构建SQL
  const countSql = `
    SELECT COUNT(*) as total 
    FROM inventory_items 
    WHERE userId = ? AND name LIKE ?
  `;
  
  const listSql = `
    SELECT * 
    FROM inventory_items 
    WHERE userId = ? AND name LIKE ?
    ORDER BY createTime DESC
    LIMIT ? OFFSET ?
  `;
  
  // 准备参数
  const searchTerm = `%${keyword}%`;
  
  // 获取总数
  const countStmt = db.prepare(countSql).bind(userId, searchTerm);
  const { total } = await countStmt.first();
  
  // 获取列表
  const listStmt = db.prepare(listSql).bind(userId, searchTerm, pageSize, offset);
  const result = await listStmt.all();
  
  return { total, items: result.results };
}

async function getExpiringInventoryItems(db, userId, expiryDate, page, pageSize) {
  // 计算偏移量
  const offset = (page - 1) * pageSize;
  
  // 构建SQL
  const countSql = `
    SELECT COUNT(*) as total 
    FROM inventory_items 
    WHERE userId = ? AND expiryDate <= ? AND expiryDate >= date('now')
  `;
  
  const listSql = `
    SELECT * 
    FROM inventory_items 
    WHERE userId = ? AND expiryDate <= ? AND expiryDate >= date('now')
    ORDER BY expiryDate ASC
    LIMIT ? OFFSET ?
  `;
  
  // 获取总数
  const countStmt = db.prepare(countSql).bind(userId, expiryDate);
  const { total } = await countStmt.first();
  
  // 获取列表
  const listStmt = db.prepare(listSql).bind(userId, expiryDate, pageSize, offset);
  const result = await listStmt.all();
  
  return { total, items: result.results };
}

// 辅助函数
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
} 