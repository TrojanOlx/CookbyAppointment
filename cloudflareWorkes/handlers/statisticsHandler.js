import { createJsonResponse, createErrorResponse } from '../wxApi.js';

// 验证 token 并获取用户信息
async function validateTokenAndGetUser(db, token) {
  const loginInfo = await db.prepare('SELECT * FROM login_info WHERE token = ?').bind(token).first();
  if (!loginInfo) return { loginInfo: null, user: null };
  const user = await db.prepare('SELECT * FROM users WHERE openid = ?').bind(loginInfo.openid).first();
  return { loginInfo, user };
}

// 管理员获取预约统计数据
export async function handleGetStatistics(request, env) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return createErrorResponse('未提供token', 401);

    const { loginInfo, user } = await validateTokenAndGetUser(env.DB, token);
    if (!loginInfo || !user) return createErrorResponse('无效的token或用户不存在', 401);
    if (user.isAdmin !== 1) return createErrorResponse('无管理员权限', 403);

    const query = new URL(request.url).searchParams;
    // 默认统计近 30 天
    const now = new Date();
    const defaultEnd = now.toISOString().slice(0, 10);
    const defaultStart = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const startDate = query.get('startDate') || defaultStart;
    const endDate = query.get('endDate') || defaultEnd;

    const db = env.DB;

    // 1. 汇总数据
    const summaryRow = await db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = '已取消' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN status = '待确认' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = '已确认' THEN 1 ELSE 0 END) AS confirmed
      FROM appointments
      WHERE date >= ? AND date <= ?
    `).bind(startDate, endDate).first();

    // 2. 每日趋势（按日期分组）
    const dailyResult = await db.prepare(`
      SELECT date, COUNT(*) AS count
      FROM appointments
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC
    `).bind(startDate, endDate).all();

    // 3. 餐次分布
    const mealResult = await db.prepare(`
      SELECT mealType, COUNT(*) AS count
      FROM appointments
      WHERE date >= ? AND date <= ?
      GROUP BY mealType
    `).bind(startDate, endDate).all();

    const mealDistribution = {};
    for (const row of mealResult.results) {
      mealDistribution[row.mealType] = row.count;
    }

    // 4. 最受欢迎菜品 Top 5（通过 appointment_dishes 关联表统计）
    const topDishesResult = await db.prepare(`
      SELECT ad.dishId, COUNT(*) AS count
      FROM appointment_dishes ad
      INNER JOIN appointments a ON ad.appointmentId = a.id
      WHERE a.date >= ? AND a.date <= ?
      GROUP BY ad.dishId
      ORDER BY count DESC
      LIMIT 5
    `).bind(startDate, endDate).all();

    const topDishes = [];
    for (const row of topDishesResult.results) {
      const dish = await db.prepare('SELECT name, images FROM dishes WHERE id = ? LIMIT 1').bind(row.dishId).first();
      let dishImage = '';
      if (dish && dish.images) {
        try {
          const imgs = JSON.parse(dish.images);
          if (imgs.length > 0) {
            dishImage = imgs[0].startsWith('http') ? imgs[0] : `${env.R2_PUBLIC_URL}/${imgs[0]}`;
          }
        } catch {}
      }
      topDishes.push({
        dishId: row.dishId,
        name: dish ? dish.name : '未知菜品',
        image: dishImage,
        count: row.count
      });
    }

    // 5. 用户预约排行 Top 5
    const userRankResult = await db.prepare(`
      SELECT userId, COUNT(*) AS count
      FROM appointments
      WHERE date >= ? AND date <= ? AND userId IS NOT NULL
      GROUP BY userId
      ORDER BY count DESC
      LIMIT 5
    `).bind(startDate, endDate).all();

    const userRanking = [];
    for (const row of userRankResult.results) {
      const u = await db.prepare('SELECT nickName, avatarUrl FROM users WHERE id = ? LIMIT 1').bind(row.userId).first();
      userRanking.push({
        userId: row.userId,
        nickName: u ? u.nickName : '未知用户',
        avatarUrl: u ? u.avatarUrl : '',
        count: row.count
      });
    }

    return createJsonResponse({
      startDate,
      endDate,
      summary: {
        total: summaryRow.total || 0,
        completed: summaryRow.completed || 0,
        cancelled: summaryRow.cancelled || 0,
        pending: summaryRow.pending || 0,
        confirmed: summaryRow.confirmed || 0
      },
      dailyTrend: dailyResult.results,
      mealDistribution,
      topDishes,
      userRanking
    });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}
