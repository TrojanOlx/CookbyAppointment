// R2 文件处理服务
import { createJsonResponse, createErrorResponse } from '../wxApi.js';

/**
 * 上传文件到 R2 存储
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 响应对象的Promise
 */
export async function handleUploadFile(request, env) {
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
    
    // 只有管理员可以上传文件
    if (user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }

    // 验证请求方法
    if (request.method !== 'POST') {
      return createErrorResponse('请使用 POST 方法上传文件', 405);
    }

    // 检查请求是否包含文件
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file || !(file instanceof File)) {
      return createErrorResponse('未找到文件', 400);
    }

    // 获取文件属性
    const fileName = formData.get('fileName') || file.name;
    const fileType = file.type;
    const fileSize = file.size;
    const folder = formData.get('folder') || 'default';
    
    // 取出文件名和后缀
    const extIndex = fileName.lastIndexOf('.');
    const baseName = extIndex !== -1 ? fileName.substring(0, extIndex) : fileName;
    const ext = extIndex !== -1 ? fileName.substring(extIndex) : '';
    const filePath = `${folder}/${baseName}_${Date.now()}${ext}`;
    
    // 读取文件内容
    const fileContent = await file.arrayBuffer();
    
    // 上传到 R2 存储
    const r2Object = await env.FILE_BUCKET.put(filePath, fileContent, {
      httpMetadata: {
        contentType: fileType,
      },
      customMetadata: {
        originalName: fileName,
        size: fileSize.toString(),
        uploadTime: new Date().toISOString(),
        userId: user.id,
        openid: user.openid,
      },
    });

    // 返回成功响应
    return createJsonResponse({
      success: true,
      data: {
        filePath,
        fileName,
        fileType,
        fileSize,
        url: `${env.R2_PUBLIC_URL}/${filePath}`,
      }
    });
  } catch (error) {
    console.error('上传文件错误:', error);
    return createErrorResponse(`上传文件失败: ${error.message}`, 500);
  }
}

/**
 * 获取文件详细信息
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 响应对象的Promise
 */
export async function handleGetFileInfo(request, env) {
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
    
    // 只有管理员可以获取文件信息
    if (user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 从URL参数获取文件路径
    const url = new URL(request.url);
    const filePath = url.searchParams.get('filePath');
    
    if (!filePath) {
      return createErrorResponse('文件路径参数缺失', 400);
    }
    
    // 从 R2 获取文件信息
    const object = await env.FILE_BUCKET.head(filePath);
    
    if (!object) {
      return createErrorResponse('文件不存在', 404);
    }
    
    // 返回文件信息
    return createJsonResponse({
      success: true,
      data: {
        filePath,
        fileName: object.customMetadata?.originalName || filePath.split('/').pop(),
        fileType: object.httpMetadata?.contentType,
        fileSize: object.size,
        uploadTime: object.customMetadata?.uploadTime,
        url: `${env.R2_PUBLIC_URL}/${filePath}`,
      }
    });
  } catch (error) {
    console.error('获取文件信息错误:', error);
    return createErrorResponse(`获取文件信息失败: ${error.message}`, 500);
  }
}

/**
 * 下载文件
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 响应对象的Promise
 */
export async function handleDownloadFile(request, env) {
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
    
    // 只有管理员可以下载文件
    if (user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 从URL参数获取文件路径
    const url = new URL(request.url);
    const filePath = url.searchParams.get('filePath');
    
    if (!filePath) {
      return createErrorResponse('文件路径参数缺失', 400);
    }
    
    // 从 R2 获取文件
    const object = await env.FILE_BUCKET.get(filePath);
    
    if (!object) {
      return createErrorResponse('文件不存在', 404);
    }
    
    // 提取原始文件名
    const fileName = object.customMetadata?.originalName || filePath.split('/').pop();
    
    // 创建包含文件内容的响应
    const headers = new Headers();
    headers.append('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.append('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    
    return new Response(object.body, {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('下载文件错误:', error);
    return createErrorResponse(`下载文件失败: ${error.message}`, 500);
  }
}

/**
 * 删除文件
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 响应对象的Promise
 */
export async function handleDeleteFile(request, env) {
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
    
    // 只有管理员可以删除文件
    if (user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 从请求体获取文件路径
    const data = await request.json();
    const { filePath } = data;
    
    if (!filePath) {
      return createErrorResponse('文件路径参数缺失', 400);
    }
    
    // 先获取文件信息以检查权限
    const object = await env.FILE_BUCKET.head(filePath);
    
    if (!object) {
      return createErrorResponse('文件不存在', 404);
    }
    
    // 从 R2 删除文件
    await env.FILE_BUCKET.delete(filePath);
    
    // 返回成功响应
    return createJsonResponse({
      success: true,
      message: '文件已成功删除'
    });
  } catch (error) {
    console.error('删除文件错误:', error);
    return createErrorResponse(`删除文件失败: ${error.message}`, 500);
  }
}

/**
 * 列出指定文件夹中的文件
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 响应对象的Promise
 */
export async function handleListFiles(request, env) {
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
    
    // 只有管理员可以列出文件
    if (user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }
    
    // 从URL参数获取查询条件
    const url = new URL(request.url);
    const folder = url.searchParams.get('folder') || 'default';
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const prefix = folder.endsWith('/') ? folder : `${folder}/`;
    
    // 从 R2 列出文件
    const listed = await env.FILE_BUCKET.list({
      prefix,
      limit,
    });
    
    // 格式化响应数据
    let files = listed.objects.map(object => ({
      filePath: object.key,
      fileName: object.customMetadata?.originalName || object.key.split('/').pop(),
      fileType: object.httpMetadata?.contentType,
      fileSize: object.size,
      uploadTime: object.customMetadata?.uploadTime,
      url: `${env.R2_PUBLIC_URL}/${object.key}`,
      userId: object.customMetadata?.userId,
    }));
    
    // 返回文件列表
    return createJsonResponse({
      success: true,
      data: {
        files,
        truncated: listed.truncated,
        total: files.length
      }
    });
  } catch (error) {
    console.error('列出文件错误:', error);
    return createErrorResponse(`列出文件失败: ${error.message}`, 500);
  }
}

/**
 * 批量删除文件
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 响应对象的Promise
 */
export async function handleBatchDeleteFiles(request, env) {
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
    
    // 只有管理员可以批量删除文件
    if (user.isAdmin !== 1) {
      return createErrorResponse('只有管理员可以批量删除文件', 403);
    }
    
    // 从请求体获取文件路径列表
    const data = await request.json();
    const { filePaths } = data;
    
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return createErrorResponse('文件路径列表参数无效', 400);
    }
    
    // 批量删除文件
    const results = await Promise.allSettled(
      filePaths.map(async (filePath) => {
        try {
          await env.FILE_BUCKET.delete(filePath);
          return { filePath, success: true };
        } catch (error) {
          return { filePath, success: false, error: error.message };
        }
      })
    );
    
    // 统计删除结果
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;
    
    // 返回删除结果
    return createJsonResponse({
      success: true,
      data: {
        total: filePaths.length,
        successful,
        failed,
        details: results.map(r => {
          if (r.status === 'fulfilled') {
            return r.value;
          } else {
            return { success: false, error: r.reason };
          }
        })
      }
    });
  } catch (error) {
    console.error('批量删除文件错误:', error);
    return createErrorResponse(`批量删除文件失败: ${error.message}`, 500);
  }
}

/**
 * 验证token并获取用户信息
 * @param {Object} db 数据库对象
 * @param {string} token 认证token
 * @returns {Promise<Object>} 包含登录信息和用户信息的Promise对象
 */
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