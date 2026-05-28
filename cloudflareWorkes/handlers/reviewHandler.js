import { createJsonResponse, createErrorResponse } from '../wxApi.js';
import { validateTokenAndGetUser, buildMap, buildInClause } from './_shared.js';

// 获取用户的所有评价
export async function handleGetUserReviews(request, env) {
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
    
    // 查询用户的评价列表
    const { total, reviews } = await getUserReviews(env.DB, user.id, page, pageSize);
    
    // 批量查询菜品和预约信息
    const dishIds = [...new Set(reviews.map(r => r.dishId).filter(Boolean))];
    const appointmentIds = [...new Set(reviews.map(r => r.appointmentId).filter(Boolean))];
    const [dishMap, appointmentMap] = await Promise.all([
      batchGetById(env.DB, 'dishes', dishIds),
      batchGetById(env.DB, 'appointments', appointmentIds)
    ]);

    const reviewsWithDetails = reviews.map(review => {
      const dish = dishMap.get(review.dishId);
      const appointment = appointmentMap.get(review.appointmentId);
      return {
        ...review,
        dish: dish || { name: '未知菜品' },
        appointmentDate: appointment ? appointment.date : '',
        mealType: appointment ? appointment.mealType : ''
      };
    });

    return createJsonResponse({ total, list: reviewsWithDetails });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取菜品的所有评价
export async function handleGetDishReviews(request, env) {
  try {
    // 获取查询参数
    const query = new URL(request.url).searchParams;
    const dishId = query.get('dishId');
    const page = parseInt(query.get('page')) || 1;
    const pageSize = parseInt(query.get('pageSize')) || 10;
    
    if (!dishId) {
      return createErrorResponse('菜品ID不能为空', 400);
    }
    
    // 查询菜品的评价列表
    const { total, reviews } = await getDishReviews(env.DB, dishId, page, pageSize);
    
    // 批量查询用户信息
    const userIds = [...new Set(reviews.map(r => r.userId).filter(Boolean))];
    const userMap = await batchGetById(env.DB, 'users', userIds);

    const reviewsWithUser = reviews.map(review => {
      const userInfo = userMap.get(review.userId);
      return {
        ...review,
        userName: userInfo ? userInfo.nickName : '匿名用户',
        userAvatar: userInfo ? userInfo.avatarUrl : ''
      };
    });

    return createJsonResponse({ total, list: reviewsWithUser });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取预约的所有评价
export async function handleGetAppointmentReviews(request, env) {
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
    const appointmentId = query.get('appointmentId');
    
    if (!appointmentId) {
      return createErrorResponse('预约ID不能为空', 400);
    }
    
    // 查询预约信息
    const appointment = await getAppointmentById(env.DB, appointmentId);
    if (!appointment) {
      return createErrorResponse('预约不存在', 404);
    }
    
    // 验证预约是否属于当前用户或用户是否是管理员
    if (appointment.userId !== user.id && user.isAdmin !== 1) {
      return createErrorResponse('无权查看此预约的评价', 403);
    }
    
    // 查询预约的评价列表
    const reviews = await getAppointmentReviews(env.DB, appointmentId);
    
    // 添加菜品信息
    const reviewsWithDish = [];
    for (const review of reviews) {
      // 获取菜品信息
      const dish = await getDishById(env.DB, review.dishId);
      
      reviewsWithDish.push({
        ...review,
        dish: dish || { name: '未知菜品' }
      });
    }
    
    return createJsonResponse({ list: reviewsWithDish });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 添加评价
export async function handleAddReview(request, env) {
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
    const { appointmentId, dishId, rating, content, images = [] } = data;
    
    // 验证必要字段
    if (!appointmentId || !dishId || !rating) {
      return createErrorResponse('预约ID、菜品ID和评分不能为空', 400);
    }
    
    // 验证评分范围
    if (rating < 1 || rating > 5) {
      return createErrorResponse('评分必须在1-5之间', 400);
    }
    
    // 查询预约信息
    const appointment = await getAppointmentById(env.DB, appointmentId);
    if (!appointment) {
      return createErrorResponse('预约不存在', 404);
    }
    
    // 验证预约是否属于当前用户
    if (appointment.userId !== user.id) {
      return createErrorResponse('无法评价他人的预约', 403);
    }
    
    // 验证预约状态是否为已完成
    if (appointment.status !== '已完成') {
      return createErrorResponse('只能评价已完成的预约', 400);
    }
    
    // 验证菜品是否属于该预约
    const appointmentDish = await getAppointmentDishByDishId(env.DB, appointmentId, dishId);
    if (!appointmentDish) {
      return createErrorResponse('该菜品不在预约中', 400);
    }
    
    // 验证是否已经评价过该菜品
    const existingReview = await getReviewByAppointmentAndDish(env.DB, appointmentId, dishId);
    if (existingReview) {
      return createErrorResponse('已经评价过该菜品', 400);
    }
    
    // 创建评价记录
    const review = {
      id: generateUUID(),
      appointmentId,
      userId: user.id,
      openid: user.openid,
      dishId,
      rating,
      content: content || '',
      images: images || [],
      createTime: Date.now(),
      updateTime: Date.now()
    };
    
    // 保存评价
    await createReview(env.DB, review);
    
    return createJsonResponse({ success: true, reviewId: review.id });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 更新评价
export async function handleUpdateReview(request, env) {
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
    const { reviewId, rating, content, images } = data;
    
    // 验证必要字段
    if (!reviewId) {
      return createErrorResponse('评价ID不能为空', 400);
    }
    
    // 查询评价信息
    const review = await getReviewById(env.DB, reviewId);
    if (!review) {
      return createErrorResponse('评价不存在', 404);
    }
    
    // 验证评价是否属于当前用户
    if (review.userId !== user.id) {
      return createErrorResponse('无法修改他人的评价', 403);
    }
    
    // 更新评价
    const updatedReview = {
      ...review,
      rating: rating !== undefined ? rating : review.rating,
      content: content !== undefined ? content : review.content,
      images: images !== undefined ? images : review.images,
      updateTime: Date.now()
    };
    
    // 保存更新
    await updateReview(env.DB, updatedReview);
    
    return createJsonResponse({ success: true });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 删除评价
export async function handleDeleteReview(request, env) {
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
      return createErrorResponse('评价ID不能为空', 400);
    }
    
    // 查询评价信息
    const review = await getReviewById(env.DB, id);
    if (!review) {
      return createErrorResponse('评价不存在', 404);
    }
    
    // 验证评价是否属于当前用户或用户是否是管理员
    if (review.userId !== user.id && user.isAdmin !== 1) {
      return createErrorResponse('无权删除此评价', 403);
    }
    
    // 删除评价
    await deleteReview(env.DB, id);
    
    return createJsonResponse({ success: true });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 管理员获取所有评价列表（含用户信息和菜品信息）
export async function handleGetAdminReviews(request, env) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return createErrorResponse('未提供token', 401);

    const { loginInfo, user } = await validateTokenAndGetUser(env.DB, token);
    if (!loginInfo || !user) return createErrorResponse('无效的token或用户不存在', 401);
    if (user.isAdmin !== 1) return createErrorResponse('无管理员权限', 403);

    const query = new URL(request.url).searchParams;
    const page = parseInt(query.get('page')) || 1;
    const pageSize = parseInt(query.get('pageSize')) || 20;
    const dishId = query.get('dishId') || null;
    const minRating = query.get('minRating') ? parseInt(query.get('minRating')) : null;
    const maxRating = query.get('maxRating') ? parseInt(query.get('maxRating')) : null;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE 1=1';
    const bindings = [];
    if (dishId) { whereClause += ' AND r.dishId = ?'; bindings.push(dishId); }
    if (minRating !== null) { whereClause += ' AND r.rating >= ?'; bindings.push(minRating); }
    if (maxRating !== null) { whereClause += ' AND r.rating <= ?'; bindings.push(maxRating); }

    const countStmt = env.DB.prepare(`SELECT COUNT(*) as count FROM reviews r ${whereClause}`);
    const countResult = await countStmt.bind(...bindings).first();
    const total = countResult.count;

    const listStmt = env.DB.prepare(
      `SELECT r.* FROM reviews r ${whereClause} ORDER BY r.createTime DESC LIMIT ? OFFSET ?`
    );
    const listResult = await listStmt.bind(...bindings, pageSize, offset).all();

    // 批量查询关联数据
    const reviewRows = listResult.results;
    const bDishIds = [...new Set(reviewRows.map(r => r.dishId).filter(Boolean))];
    const bUserIds = [...new Set(reviewRows.map(r => r.userId).filter(Boolean))];
    const bApptIds = [...new Set(reviewRows.map(r => r.appointmentId).filter(Boolean))];
    const [dishMap, userMap, apptMap] = await Promise.all([
      batchGetById(env.DB, 'dishes', bDishIds),
      batchGetById(env.DB, 'users', bUserIds),
      batchGetById(env.DB, 'appointments', bApptIds)
    ]);

    const list = reviewRows.map(review => {
      let images = [];
      try { images = JSON.parse(review.images || '[]'); } catch { images = []; }
      images = images.map(img => img.startsWith('http') ? img : `${env.R2_PUBLIC_URL}/${img}`);

      const dish = dishMap.get(review.dishId);
      const userInfo = userMap.get(review.userId);
      const appointment = apptMap.get(review.appointmentId);
      const dishImages = dish && dish.images
        ? (Array.isArray(dish.images) ? dish.images : [])
            .map(img => img.startsWith('http') ? img : `${env.R2_PUBLIC_URL}/${img}`)
        : [];

      return {
        ...review,
        images,
        dishName: dish ? dish.name : '未知菜品',
        dishImage: dishImages[0] || '',
        userName: userInfo ? userInfo.nickName : '匿名用户',
        userAvatar: userInfo ? userInfo.avatarUrl : '',
        appointmentDate: appointment ? appointment.date : '',
        mealType: appointment ? appointment.mealType : ''
      };
    });

    return createJsonResponse({ total, list });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 辅助函数 - 生成UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 辅助函数 - 获取用户评价列表
async function getUserReviews(db, userId, page, pageSize) {
  const offset = (page - 1) * pageSize;
  
  // 查询评价总数
  const countQuery = await db.prepare(`
    SELECT COUNT(*) as count FROM reviews WHERE userId = ?
  `).bind(userId).all();
  
  const total = countQuery.results[0].count;
  
  // 查询评价列表
  const reviewsQuery = await db.prepare(`
    SELECT * FROM reviews 
    WHERE userId = ? 
    ORDER BY createTime DESC 
    LIMIT ? OFFSET ?
  `).bind(userId, pageSize, offset).all();
  
  return { total, reviews: reviewsQuery.results };
}

// 辅助函数 - 获取菜品评价列表
async function getDishReviews(db, dishId, page, pageSize) {
  const offset = (page - 1) * pageSize;
  
  // 查询评价总数
  const countQuery = await db.prepare(`
    SELECT COUNT(*) as count FROM reviews WHERE dishId = ?
  `).bind(dishId).all();
  
  const total = countQuery.results[0].count;
  
  // 查询评价列表
  const reviewsQuery = await db.prepare(`
    SELECT * FROM reviews 
    WHERE dishId = ? 
    ORDER BY createTime DESC 
    LIMIT ? OFFSET ?
  `).bind(dishId, pageSize, offset).all();
  
  return { total, reviews: reviewsQuery.results };
}

// 辅助函数 - 获取预约评价列表
async function getAppointmentReviews(db, appointmentId) {
  const reviewsQuery = await db.prepare(`
    SELECT * FROM reviews 
    WHERE appointmentId = ? 
    ORDER BY createTime DESC
  `).bind(appointmentId).all();
  
  return reviewsQuery.results;
}

// 辅助函数 - 根据ID获取评价
async function getReviewById(db, reviewId) {
  const reviewQuery = await db.prepare(`
    SELECT * FROM reviews WHERE id = ? LIMIT 1
  `).bind(reviewId).all();
  
  return reviewQuery.results[0];
}

// 辅助函数 - 根据预约ID和菜品ID获取评价
async function getReviewByAppointmentAndDish(db, appointmentId, dishId) {
  const reviewQuery = await db.prepare(`
    SELECT * FROM reviews 
    WHERE appointmentId = ? AND dishId = ? 
    LIMIT 1
  `).bind(appointmentId, dishId).all();
  
  return reviewQuery.results[0];
}

// 辅助函数 - 创建评价
async function createReview(db, review) {
  // 将images数组转为JSON字符串
  const imagesJson = JSON.stringify(review.images);
  
  await db.prepare(`
    INSERT INTO reviews (
      id, appointmentId, userId, openid, dishId, 
      rating, content, images, createTime, updateTime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    review.id,
    review.appointmentId,
    review.userId,
    review.openid,
    review.dishId,
    review.rating,
    review.content,
    imagesJson,
    review.createTime,
    review.updateTime
  ).run();
}

// 辅助函数 - 更新评价
async function updateReview(db, review) {
  // 将images数组转为JSON字符串
  const imagesJson = JSON.stringify(review.images);
  
  await db.prepare(`
    UPDATE reviews 
    SET rating = ?, content = ?, images = ?, updateTime = ? 
    WHERE id = ?
  `).bind(
    review.rating,
    review.content,
    imagesJson,
    review.updateTime,
    review.id
  ).run();
}

// 辅助函数 - 删除评价
async function deleteReview(db, reviewId) {
  await db.prepare(`
    DELETE FROM reviews WHERE id = ?
  `).bind(reviewId).run();
}

// 辅助函数 - 获取菜品信息
async function getDishById(db, dishId) {
  const dishQuery = await db.prepare(`
    SELECT * FROM dishes WHERE id = ? LIMIT 1
  `).bind(dishId).all();
  
  const dish = dishQuery.results[0];
  if (!dish) return null;
  
  // 处理图片字段
  if (dish.images) {
    try {
      dish.images = JSON.parse(dish.images);
    } catch {
      dish.images = [];
    }
  } else {
    dish.images = [];
  }
  
  return dish;
}

// 辅助函数 - 获取预约信息
async function getAppointmentById(db, appointmentId) {
  const appointmentQuery = await db.prepare(`
    SELECT * FROM appointments WHERE id = ? LIMIT 1
  `).bind(appointmentId).all();
  
  return appointmentQuery.results[0];
}

// 辅助函数 - 获取用户信息
async function getUserById(db, userId) {
  const userQuery = await db.prepare(`
    SELECT * FROM users WHERE id = ? LIMIT 1
  `).bind(userId).all();
  
  return userQuery.results[0];
}

// 辅助函数 - 获取预约菜品关联
async function getAppointmentDishByDishId(db, appointmentId, dishId) {
  const query = await db.prepare(`
    SELECT * FROM appointment_dishes 
    WHERE appointmentId = ? AND dishId = ? 
    LIMIT 1
  `).bind(appointmentId, dishId).all();
  
  return query.results[0];
}

/**
 * 通用批量按 id 查询指定表，返回 id -> row 的 Map。
 * @param {Object} db  D1 数据库对象
 * @param {string} table  表名（需为受信任的字符串字面量）
 * @param {string[]} ids  id 数组
 */
async function batchGetById(db, table, ids) {
  if (!ids || ids.length === 0) return new Map();
  const { clause, bindings } = buildInClause(ids);
  const result = await db.prepare(`SELECT * FROM ${table} WHERE ${clause}`).bind(...bindings).all();
  const map = new Map();
  for (const row of result.results) {
    map.set(row.id, row);
  }
  return map;
}