import { createJsonResponse, createErrorResponse } from '../wxApi.js';

export async function handleGetUserProfile(request, env) {
  try {
    // 解析请求体中的code
    const data = await request.json();
    const { code } = data;
    
    if (!code) {
      return createErrorResponse('缺少code参数');
    }

    // 从环境变量中获取小程序的appid和secret
    const appid = env.WX_APPID;
    const secret = env.WX_SECRET;
    
    // 请求微信接口
    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    
    const response = await fetch(wxUrl);
    const result = await response.json();
    
    // 返回微信接口的响应
    return createJsonResponse(result);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}