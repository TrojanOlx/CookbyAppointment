// 获取access_token
export async function getAccessToken(env) {
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
  
  // 创建JSON响应
  export function createJsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 创建错误响应
  export function createErrorResponse(message, status = 400) {
    return createJsonResponse({ 
      error: true, 
      message 
    }, status);
  }