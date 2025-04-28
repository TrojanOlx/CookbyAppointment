import { createJsonResponse, createErrorResponse } from '../wxApi.js';

// 用户登录处理
export async function handleLogin(request, env) {
  try {
    // 解析请求体
    const data = await request.json();
    const { code } = data;
    
    if (!code) {
      return createErrorResponse('缺少code参数');
    }

    // 请求微信API
    const appid = env.WX_APPID;
    const secret = env.WX_SECRET;
    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    
    const response = await fetch(wxUrl);
    const wxResult = await response.json();
    
    if (wxResult.errcode) {
      return createErrorResponse(`微信登录失败: ${wxResult.errmsg}`);
    }
    
    const { openid, session_key, unionid } = wxResult;
    
    // 生成token
    const token = generateToken();
    
    // 检查用户是否存在
    const user = await getUserByOpenid(env.DB, openid);
    
    // 创建或更新登录信息
    const loginInfo = {
      openid,
      session_key,
      unionid,
      token,
      expireTime: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天过期
    };
    
    if (user) {
      // 更新登录信息
      await updateLoginInfo(env.DB, loginInfo);
    } else {
      // 创建新用户和登录信息
      await createUser(env.DB, { openid });
      await createLoginInfo(env.DB, loginInfo);
    }
    
    return createJsonResponse({
      openid,
      token,
      expiresIn: 7 * 24 * 60 * 60 // 7天过期（秒）
    });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取用户信息处理
export async function handleGetUserInfo(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token
    const loginInfo = await getLoginInfoByToken(env.DB, token);
    
    if (!loginInfo) {
      return createErrorResponse('无效的token', 401);
    }
    
    // 获取用户信息
    const query = new URL(request.url).searchParams;
    const userId = query.get('userId');
    
    let user;
    
    if (userId) {
      // 管理员查询指定用户
      const currentUser = await getUserByOpenid(env.DB, loginInfo.openid);
      
      if (!currentUser.isAdmin) {
        return createErrorResponse('权限不足', 403);
      }
      
      user = await getUserById(env.DB, userId);
    } else {
      // 查询当前用户
      user = await getUserByOpenid(env.DB, loginInfo.openid);
    }
    
    if (!user) {
      return createErrorResponse('用户不存在', 404);
    }
    
    // 拼接头像完整路径
    if (user.avatarUrl && !user.avatarUrl.startsWith('http')) {
      user.avatarUrl = env.R2_PUBLIC_URL + '/' + user.avatarUrl;
    }
    
    return createJsonResponse(user);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 更新用户信息处理
export async function handleUpdateUserInfo(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token
    const loginInfo = await getLoginInfoByToken(env.DB, token);
    
    if (!loginInfo) {
      return createErrorResponse('无效的token', 401);
    }
    
    // 获取更新数据
    const data = await request.json();
    
    // 获取当前用户
    const currentUser = await getUserByOpenid(env.DB, loginInfo.openid);
    
    if (!currentUser) {
      return createErrorResponse('用户不存在', 404);
    }
    
    // 更新用户信息
    const updatedUser = {
      ...currentUser,
      ...data,
      updateTime: Date.now()
    };
    
    await updateUser(env.DB, updatedUser);
    
    // 拼接头像完整路径
    if (updatedUser.avatarUrl && !updatedUser.avatarUrl.startsWith('http')) {
      updatedUser.avatarUrl = env.R2_PUBLIC_URL + '/' + updatedUser.avatarUrl;
    }
    
    return createJsonResponse(updatedUser);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 检查管理员权限
export async function handleCheckAdmin(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token
    const loginInfo = await getLoginInfoByToken(env.DB, token);
    
    if (!loginInfo) {
      return createErrorResponse('无效的token', 401);
    }
    
    // 获取用户信息
    const user = await getUserByOpenid(env.DB, loginInfo.openid);
    
    if (!user) {
      return createErrorResponse('用户不存在', 404);
    }
    
    return createJsonResponse({ isAdmin: user.isAdmin === 1 });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取用户列表（仅管理员）
export async function handleGetUserList(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token
    const loginInfo = await getLoginInfoByToken(env.DB, token);
    
    if (!loginInfo) {
      return createErrorResponse('无效的token', 401);
    }
    
    // 获取当前用户
    const currentUser = await getUserByOpenid(env.DB, loginInfo.openid);
    
    if (!currentUser || currentUser.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 获取分页参数
    const query = new URL(request.url).searchParams;
    const page = parseInt(query.get('page')) || 1;
    const pageSize = parseInt(query.get('pageSize')) || 10;
    
    // 查询用户列表
    const { total, users } = await getUserList(env.DB, page, pageSize);
    
    return createJsonResponse({ total, list: users });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取用户手机号处理
export async function handleGetUserPhone(request, env) {
  try {
    // 解析请求体
    const data = await request.json();
    const { code } = data;
    
    if (!code) {
      return createErrorResponse('缺少code参数');
    }
    
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    
    // 验证token
    const loginInfo = await getLoginInfoByToken(env.DB, token);
    
    if (!loginInfo) {
      return createErrorResponse('无效的token', 401);
    }
    
    // 获取access_token
    const accessToken = await getAccessToken(env);
    
    // 请求微信API获取手机号
    const wxUrl = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
    
    const response = await fetch(wxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });
    
    const wxResult = await response.json();
    
    if (wxResult.errcode !== 0) {
      return createErrorResponse(`获取手机号失败: ${wxResult.errmsg}`);
    }
    
    const phoneInfo = wxResult.phone_info;
    
    // 获取当前用户
    const user = await getUserByOpenid(env.DB, loginInfo.openid);
    
    if (!user) {
      return createErrorResponse('用户不存在', 404);
    }
    
    // 保存用户手机号
    const userPhone = {
      userId: user.id,
      openid: user.openid,
      phoneNumber: phoneInfo.phoneNumber,
      purePhoneNumber: phoneInfo.purePhoneNumber,
      countryCode: phoneInfo.countryCode,
      createTime: Date.now()
    };
    
    await saveUserPhone(env.DB, userPhone);
    
    // 更新用户信息
    await updateUser(env.DB, {
      ...user,
      phoneNumber: phoneInfo.phoneNumber,
      updateTime: Date.now()
    });
    
    return createJsonResponse(userPhone);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 新增：用户上传头像
export async function handleUpdateAvatar(request, env) {
  try {
    // 获取认证信息
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return createErrorResponse('未提供token', 401);
    }
    // 验证token和获取用户信息
    const loginInfo = await getLoginInfoByToken(env.DB, token);
    if (!loginInfo) {
      return createErrorResponse('无效的token', 401);
    }
    const user = await getUserByOpenid(env.DB, loginInfo.openid);
    if (!user) {
      return createErrorResponse('用户不存在', 404);
    }
    // 只允许POST
    if (request.method !== 'POST') {
      return createErrorResponse('请使用 POST 方法上传头像', 405);
    }
    // 解析formData
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return createErrorResponse('未找到头像文件', 400);
    }
    // 获取文件名和类型
    const fileName = formData.get('fileName') || file.name;
    const fileType = file.type;
    const fileSize = file.size;
    const folder = 'avatars';
    // 生成带后缀的唯一文件名
    const extIndex = fileName.lastIndexOf('.');
    const baseName = extIndex !== -1 ? fileName.substring(0, extIndex) : fileName;
    const ext = extIndex !== -1 ? fileName.substring(extIndex) : '';
    const filePath = `${folder}/${baseName}_${Date.now()}${ext}`;
    // 上传到 R2
    const fileContent = await file.arrayBuffer();
    await env.FILE_BUCKET.put(filePath, fileContent, {
      httpMetadata: { contentType: fileType },
      customMetadata: {
        originalName: fileName,
        size: fileSize.toString(),
        uploadTime: new Date().toISOString(),
        userId: user.id,
        openid: user.openid,
      },
    });
    // 更新用户头像
    user.avatarUrl = filePath;
    await updateUser(env.DB, user);
    // 返回成功响应
    return createJsonResponse({
      success: true,
      filePath,
      url: `${env.R2_PUBLIC_URL}/${filePath}`
    });
  } catch (error) {
    console.error('上传头像错误:', error);
    return createErrorResponse(`上传头像失败: ${error.message}`, 500);
  }
}

// 数据库操作函数
async function getUserByOpenid(db, openid) {
  const stmt = db.prepare('SELECT * FROM users WHERE openid = ?').bind(openid);
  const result = await stmt.first();
  return result;
}

async function getUserById(db, id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?').bind(id);
  const result = await stmt.first();
  return result;
}

async function createUser(db, user) {
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO users (id, openid, createTime, updateTime)
    VALUES (?, ?, ?, ?)
  `).bind(
    id,
    user.openid,
    Date.now(),
    Date.now()
  );
  
  await stmt.run();
  return { id, ...user };
}

async function updateUser(db, user) {
  const stmt = db.prepare(`
    UPDATE users
    SET nickName = ?, avatarUrl = ?, gender = ?, country = ?,
        province = ?, city = ?, language = ?, phoneNumber = ?,
        isAdmin = ?, updateTime = ?
    WHERE id = ?
  `).bind(
    user.nickName || null,
    user.avatarUrl || null,
    user.gender || 0,
    user.country || '',
    user.province || '',
    user.city || '',
    user.language || 'zh_CN',
    user.phoneNumber || null,
    user.isAdmin || 0,
    user.updateTime,
    user.id
  );
  
  await stmt.run();
  return user;
}

async function getLoginInfoByToken(db, token) {
  const stmt = db.prepare('SELECT * FROM login_info WHERE token = ?').bind(token);
  const result = await stmt.first();
  return result;
}

async function createLoginInfo(db, loginInfo) {
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO login_info (id, openid, session_key, unionid, token, createTime, expireTime)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    loginInfo.openid,
    loginInfo.session_key,
    loginInfo.unionid || null,
    loginInfo.token,
    Date.now(),
    loginInfo.expireTime
  );
  
  await stmt.run();
  return { id, ...loginInfo };
}

async function updateLoginInfo(db, loginInfo) {
  const stmt = db.prepare(`
    UPDATE login_info
    SET session_key = ?, unionid = ?, token = ?, expireTime = ?
    WHERE openid = ?
  `).bind(
    loginInfo.session_key,
    loginInfo.unionid || null,
    loginInfo.token,
    loginInfo.expireTime,
    loginInfo.openid
  );
  
  await stmt.run();
  return loginInfo;
}

async function saveUserPhone(db, userPhone) {
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO user_phones (id, userId, openid, phoneNumber, purePhoneNumber, countryCode, createTime)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    userPhone.userId,
    userPhone.openid,
    userPhone.phoneNumber,
    userPhone.purePhoneNumber,
    userPhone.countryCode,
    userPhone.createTime
  );
  
  await stmt.run();
  return { id, ...userPhone };
}

async function getUserList(db, page, pageSize) {
  // 计算偏移量
  const offset = (page - 1) * pageSize;
  
  // 获取总数
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM users');
  const { total } = await countStmt.first();
  
  // 获取用户列表
  const listStmt = db.prepare('SELECT * FROM users LIMIT ? OFFSET ?').bind(pageSize, offset);
  const users = await listStmt.all();
  
  return { total, users: users.results };
}

// 辅助函数
function generateToken() {
  // 生成一个随机token
  return crypto.randomUUID();
}

// 获取access_token的方法，从wxApi.js导入
async function getAccessToken(env) {
  const appid = env.WX_APPID;
  const secret = env.WX_SECRET;
  
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  
  const response = await fetch(url);
  const result = await response.json();
  
  if (result.errcode) {
    throw new Error(`获取access_token失败: ${result.errmsg}`);
  }
  
  return result.access_token;
} 