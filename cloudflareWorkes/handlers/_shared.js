// 各 handler 共享工具函数

/**
 * 验证 token 并返回登录信息与用户信息。
 * token 不存在或已过期时返回 { loginInfo: null, user: null }。
 */
export async function validateTokenAndGetUser(db, token) {
  const loginInfo = await db
    .prepare('SELECT * FROM login_info WHERE token = ?')
    .bind(token)
    .first();

  if (!loginInfo) {
    return { loginInfo: null, user: null };
  }

  if (loginInfo.expireTime && Date.now() > loginInfo.expireTime) {
    return { loginInfo: null, user: null };
  }

  const user = await db
    .prepare('SELECT * FROM users WHERE openid = ?')
    .bind(loginInfo.openid)
    .first();

  return { loginInfo, user };
}

/**
 * 将图片路径数组转换为完整 URL。
 * 已是 http/https 开头的路径直接返回，其余拼接 R2_PUBLIC_URL 前缀。
 */
export function processImageUrls(images, env) {
  if (!images || !Array.isArray(images)) return [];
  return images.map(image => {
    if (image.startsWith('http://') || image.startsWith('https://')) {
      return image;
    }
    return `${env.R2_PUBLIC_URL}/${image}`;
  });
}

/**
 * 将一组 DB 行数据以 id 为键构建 Map，方便 O(1) 关联查询。
 * @param {Array} rows  数据库查询结果数组
 * @param {string} key  用作 Map 键的字段名（默认 'id'）
 */
export function buildMap(rows, key = 'id') {
  const map = new Map();
  for (const row of rows) {
    map.set(row[key], row);
  }
  return map;
}

/**
 * 构造 WHERE id IN (?, ?, ...) 语句片段，返回 { clause, bindings }。
 * 当 ids 为空时返回 clause = 'FALSE'，避免 SQL 语法错误。
 */
export function buildInClause(ids) {
  if (!ids || ids.length === 0) {
    return { clause: 'FALSE', bindings: [] };
  }
  const placeholders = ids.map(() => '?').join(', ');
  return { clause: `id IN (${placeholders})`, bindings: ids };
}
