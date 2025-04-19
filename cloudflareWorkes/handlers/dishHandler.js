import { createJsonResponse, createErrorResponse } from '../wxApi.js';

// 获取菜品列表
export async function handleGetDishList(request, env) {
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
    const type = query.get('type') || null;
    
    // 查询菜品列表
    const { total, dishes } = await getDishList(env.DB, page, pageSize, type);
    
    return createJsonResponse({ total, list: dishes });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取菜品详情
export async function handleGetDishDetail(request, env) {
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
    
    // 查询菜品详情
    const dish = await getDishById(env.DB, id);
    
    if (!dish) {
      return createErrorResponse('菜品不存在', 404);
    }
    
    // 获取菜品的食材列表
    const ingredients = await getIngredientsByDishId(env.DB, id);
    
    // 构建完整的菜品信息
    const fullDish = {
      ...dish,
      ingredients: ingredients || []
    };
    
    return createJsonResponse(fullDish);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 添加菜品
export async function handleAddDish(request, env) {
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
    if (!data.name || !data.type) {
      return createErrorResponse('名称和类型为必填项');
    }
    
    // 处理数组字段
    if (typeof data.images === 'string') {
      try {
        data.images = JSON.parse(data.images);
      } catch (e) {
        data.images = data.images ? [data.images] : [];
      }
    }
    
    if (typeof data.steps === 'string') {
      try {
        data.steps = JSON.parse(data.steps);
      } catch (e) {
        data.steps = data.steps ? [data.steps] : [];
      }
    }
    
    // 创建菜品
    const newDish = {
      ...data,
      creatorId: user.id,
      creatorOpenid: user.openid,
      createTime: Date.now(),
      updateTime: Date.now(),
      images: Array.isArray(data.images) ? data.images : [],
      steps: Array.isArray(data.steps) ? data.steps : []
    };
    
    // 提取食材列表
    const ingredients = data.ingredients || [];
    delete newDish.ingredients;
    
    // 保存菜品到数据库
    const createdDish = await createDish(env.DB, newDish);
    
    // 保存食材列表
    if (Array.isArray(ingredients) && ingredients.length > 0) {
      for (const ingredient of ingredients) {
        await createIngredient(env.DB, {
          ...ingredient,
          dishId: createdDish.id,
          createTime: Date.now(),
          updateTime: Date.now()
        });
      }
    }
    
    // 获取保存的食材列表
    const savedIngredients = await getIngredientsByDishId(env.DB, createdDish.id);
    
    // 返回完整的菜品信息
    return createJsonResponse({
      ...createdDish,
      ingredients: savedIngredients
    });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 更新菜品
export async function handleUpdateDish(request, env) {
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
    
    // 查询菜品
    const existingDish = await getDishById(env.DB, data.id);
    
    if (!existingDish) {
      return createErrorResponse('菜品不存在', 404);
    }
    
    // 只有管理员或创建者可以更新菜品
    if (existingDish.creatorId !== user.id && user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 处理数组字段
    if (typeof data.images === 'string') {
      try {
        data.images = JSON.parse(data.images);
      } catch (e) {
        data.images = data.images ? [data.images] : [];
      }
    }
    
    if (typeof data.steps === 'string') {
      try {
        data.steps = JSON.parse(data.steps);
      } catch (e) {
        data.steps = data.steps ? [data.steps] : [];
      }
    }
    
    // 提取食材列表
    const ingredients = data.ingredients || [];
    delete data.ingredients;
    
    // 更新菜品
    const updatedDish = {
      ...existingDish,
      ...data,
      updateTime: Date.now(),
      images: Array.isArray(data.images) ? data.images : (existingDish.images || []),
      steps: Array.isArray(data.steps) ? data.steps : (existingDish.steps || [])
    };
    
    await updateDish(env.DB, updatedDish);
    
    // 如果提供了食材信息，则更新食材
    if (Array.isArray(ingredients) && ingredients.length > 0) {
      // 获取现有食材
      const existingIngredients = await getIngredientsByDishId(env.DB, updatedDish.id);
      
      // 删除所有现有食材
      for (const ingredient of existingIngredients) {
        await deleteIngredient(env.DB, ingredient.id);
      }
      
      // 添加新的食材
      for (const ingredient of ingredients) {
        await createIngredient(env.DB, {
          ...ingredient,
          dishId: updatedDish.id,
          createTime: Date.now(),
          updateTime: Date.now()
        });
      }
    }
    
    // 获取最新的食材列表
    const updatedIngredients = await getIngredientsByDishId(env.DB, updatedDish.id);
    
    // 返回完整的菜品信息
    return createJsonResponse({
      ...updatedDish,
      ingredients: updatedIngredients
    });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 删除菜品
export async function handleDeleteDish(request, env) {
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
    
    // 查询菜品
    const existingDish = await getDishById(env.DB, id);
    
    if (!existingDish) {
      return createErrorResponse('菜品不存在', 404);
    }
    
    // 只有管理员或创建者可以删除菜品
    if (existingDish.creatorId !== user.id && user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 删除菜品的所有食材
    const ingredients = await getIngredientsByDishId(env.DB, id);
    for (const ingredient of ingredients) {
      await deleteIngredient(env.DB, ingredient.id);
    }
    
    // 删除菜品
    await deleteDish(env.DB, id);
    
    return createJsonResponse({ success: true });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 搜索菜品
export async function handleSearchDish(request, env) {
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
    
    // 搜索菜品
    const { total, dishes } = await searchDishes(env.DB, keyword, page, pageSize);
    
    return createJsonResponse({ total, list: dishes });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 根据食材推荐菜品
export async function handleRecommendByIngredients(request, env) {
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
    const { ingredientIds, page = 1, pageSize = 10 } = data;
    
    if (!Array.isArray(ingredientIds) || ingredientIds.length === 0) {
      return createErrorResponse('缺少或无效的ingredientIds参数');
    }
    
    // 根据食材IDs推荐菜品
    const { total, dishes } = await recommendDishesByIngredients(
      env.DB, 
      ingredientIds, 
      page, 
      pageSize
    );
    
    return createJsonResponse({ total, list: dishes });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取食材列表
export async function handleGetIngredientList(request, env) {
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
    const dishId = query.get('dishId');
    
    let ingredients;
    
    if (dishId) {
      // 获取指定菜品的食材
      ingredients = await getIngredientsByDishId(env.DB, dishId);
    } else {
      // 获取所有食材
      ingredients = await getAllIngredients(env.DB);
    }
    
    return createJsonResponse(ingredients);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 添加食材
export async function handleAddIngredient(request, env) {
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
    if (!data.name || !data.amount || !data.dishId) {
      return createErrorResponse('名称、数量和菜品ID为必填项');
    }
    
    // 检查菜品是否存在
    const dish = await getDishById(env.DB, data.dishId);
    
    if (!dish) {
      return createErrorResponse('菜品不存在', 404);
    }
    
    // 只有管理员或菜品创建者可以添加食材
    if (dish.creatorId !== user.id && user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 创建食材
    const newIngredient = {
      ...data,
      createTime: Date.now(),
      updateTime: Date.now()
    };
    
    const createdIngredient = await createIngredient(env.DB, newIngredient);
    
    return createJsonResponse(createdIngredient);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 更新食材
export async function handleUpdateIngredient(request, env) {
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
    
    // 查询食材
    const existingIngredient = await getIngredientById(env.DB, data.id);
    
    if (!existingIngredient) {
      return createErrorResponse('食材不存在', 404);
    }
    
    // 获取菜品信息
    const dish = await getDishById(env.DB, existingIngredient.dishId);
    
    if (!dish) {
      return createErrorResponse('菜品不存在', 404);
    }
    
    // 只有管理员或菜品创建者可以更新食材
    if (dish.creatorId !== user.id && user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 更新食材
    const updatedIngredient = {
      ...existingIngredient,
      ...data,
      updateTime: Date.now()
    };
    
    await updateIngredient(env.DB, updatedIngredient);
    
    return createJsonResponse(updatedIngredient);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 删除食材
export async function handleDeleteIngredient(request, env) {
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
    
    // 查询食材
    const existingIngredient = await getIngredientById(env.DB, id);
    
    if (!existingIngredient) {
      return createErrorResponse('食材不存在', 404);
    }
    
    // 获取菜品信息
    const dish = await getDishById(env.DB, existingIngredient.dishId);
    
    if (!dish) {
      return createErrorResponse('菜品不存在', 404);
    }
    
    // 只有管理员或菜品创建者可以删除食材
    if (dish.creatorId !== user.id && user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 删除食材
    await deleteIngredient(env.DB, id);
    
    return createJsonResponse({ success: true });
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

async function getDishList(db, page, pageSize, type = null) {
  // 计算偏移量
  const offset = (page - 1) * pageSize;
  
  // 构建SQL
  let countSql = 'SELECT COUNT(*) as total FROM dishes';
  let listSql = 'SELECT * FROM dishes';
  let params = [];
  
  // 添加类型过滤
  if (type) {
    countSql += ' WHERE type = ?';
    listSql += ' WHERE type = ?';
    params.push(type);
  }
  
  // 添加分页
  listSql += ' ORDER BY createTime DESC LIMIT ? OFFSET ?';
  
  // 获取总数
  const countStmt = db.prepare(countSql).bind(...params);
  const { total } = await countStmt.first();
  
  // 获取列表
  const listStmt = db.prepare(listSql).bind(...params, pageSize, offset);
  const result = await listStmt.all();
  
  // 解析JSON字段
  const dishes = result.results.map(dish => {
    return {
      ...dish,
      images: parseJsonField(dish.images, []),
      steps: parseJsonField(dish.steps, [])
    };
  });
  
  return { total, dishes };
}

async function getDishById(db, id) {
  const stmt = db.prepare('SELECT * FROM dishes WHERE id = ?').bind(id);
  const dish = await stmt.first();
  
  if (!dish) return null;
  
  // 解析JSON字段
  return {
    ...dish,
    images: parseJsonField(dish.images, []),
    steps: parseJsonField(dish.steps, [])
  };
}

async function createDish(db, dish) {
  const id = crypto.randomUUID();
  
  const stmt = db.prepare(`
    INSERT INTO dishes (
      id, name, type, spicy, images, steps, notice, remark, 
      reference, creatorId, creatorOpenid, createTime, updateTime
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    dish.name,
    dish.type,
    dish.spicy || '不辣',
    JSON.stringify(dish.images || []),
    JSON.stringify(dish.steps || []),
    dish.notice || '',
    dish.remark || '',
    dish.reference || '',
    dish.creatorId,
    dish.creatorOpenid,
    dish.createTime,
    dish.updateTime
  );
  
  await stmt.run();
  return { id, ...dish };
}

async function updateDish(db, dish) {
  const stmt = db.prepare(`
    UPDATE dishes
    SET name = ?, type = ?, spicy = ?, images = ?, steps = ?, 
        notice = ?, remark = ?, reference = ?, updateTime = ?
    WHERE id = ?
  `).bind(
    dish.name,
    dish.type,
    dish.spicy,
    JSON.stringify(dish.images || []),
    JSON.stringify(dish.steps || []),
    dish.notice || '',
    dish.remark || '',
    dish.reference || '',
    dish.updateTime,
    dish.id
  );
  
  await stmt.run();
  return dish;
}

async function deleteDish(db, id) {
  const stmt = db.prepare('DELETE FROM dishes WHERE id = ?').bind(id);
  await stmt.run();
  return true;
}

async function searchDishes(db, keyword, page, pageSize) {
  // 计算偏移量
  const offset = (page - 1) * pageSize;
  
  // 构建SQL
  const countSql = `
    SELECT COUNT(*) as total 
    FROM dishes 
    WHERE name LIKE ?
  `;
  
  const listSql = `
    SELECT * 
    FROM dishes 
    WHERE name LIKE ?
    ORDER BY createTime DESC
    LIMIT ? OFFSET ?
  `;
  
  // 准备参数
  const searchTerm = `%${keyword}%`;
  
  // 获取总数
  const countStmt = db.prepare(countSql).bind(searchTerm);
  const { total } = await countStmt.first();
  
  // 获取列表
  const listStmt = db.prepare(listSql).bind(searchTerm, pageSize, offset);
  const result = await listStmt.all();
  
  // 解析JSON字段
  const dishes = result.results.map(dish => {
    return {
      ...dish,
      images: parseJsonField(dish.images, []),
      steps: parseJsonField(dish.steps, [])
    };
  });
  
  return { total, dishes };
}

async function recommendDishesByIngredients(db, ingredientIds, page, pageSize) {
  // 计算偏移量
  const offset = (page - 1) * pageSize;
  
  // 构建SQL
  // 这里简化处理，实际可能需要更复杂的匹配算法
  const placeholders = ingredientIds.map(() => '?').join(',');
  
  const countSql = `
    SELECT COUNT(DISTINCT d.id) as total
    FROM dishes d
    JOIN ingredients i ON d.id = i.dishId
    WHERE i.name IN (${placeholders})
  `;
  
  const listSql = `
    SELECT DISTINCT d.*
    FROM dishes d
    JOIN ingredients i ON d.id = i.dishId
    WHERE i.name IN (${placeholders})
    ORDER BY d.createTime DESC
    LIMIT ? OFFSET ?
  `;
  
  // 获取总数
  const countStmt = db.prepare(countSql).bind(...ingredientIds);
  const { total } = await countStmt.first();
  
  // 获取列表
  const listStmt = db.prepare(listSql).bind(...ingredientIds, pageSize, offset);
  const result = await listStmt.all();
  
  // 解析JSON字段
  const dishes = result.results.map(dish => {
    return {
      ...dish,
      images: parseJsonField(dish.images, []),
      steps: parseJsonField(dish.steps, [])
    };
  });
  
  return { total, dishes };
}

async function getIngredientsByDishId(db, dishId) {
  const stmt = db.prepare('SELECT * FROM ingredients WHERE dishId = ?').bind(dishId);
  const result = await stmt.all();
  return result.results;
}

async function getAllIngredients(db) {
  const stmt = db.prepare('SELECT * FROM ingredients');
  const result = await stmt.all();
  return result.results;
}

async function getIngredientById(db, id) {
  const stmt = db.prepare('SELECT * FROM ingredients WHERE id = ?').bind(id);
  return await stmt.first();
}

async function createIngredient(db, ingredient) {
  const id = crypto.randomUUID();
  
  const stmt = db.prepare(`
    INSERT INTO ingredients (
      id, dishId, name, amount, createTime, updateTime
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    ingredient.dishId,
    ingredient.name,
    ingredient.amount,
    ingredient.createTime,
    ingredient.updateTime
  );
  
  await stmt.run();
  return { id, ...ingredient };
}

async function updateIngredient(db, ingredient) {
  const stmt = db.prepare(`
    UPDATE ingredients
    SET name = ?, amount = ?, updateTime = ?
    WHERE id = ?
  `).bind(
    ingredient.name,
    ingredient.amount,
    ingredient.updateTime,
    ingredient.id
  );
  
  await stmt.run();
  return ingredient;
}

async function deleteIngredient(db, id) {
  const stmt = db.prepare('DELETE FROM ingredients WHERE id = ?').bind(id);
  await stmt.run();
  return true;
}

// 辅助函数
function parseJsonField(field, defaultValue) {
  if (!field) return defaultValue;
  
  try {
    return JSON.parse(field);
  } catch (e) {
    return defaultValue;
  }
} 