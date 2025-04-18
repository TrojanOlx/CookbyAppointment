import { getAccessToken, createJsonResponse, createErrorResponse } from '../wxApi.js';

export async function handleGetUserPhoneNumber(request, env) {
  try {
    // 解析请求体中的code
    const data = await request.json();
    const { code } = data;
    
    if (!code) {
      return createErrorResponse('缺少code参数');
    }

    // 获取access_token
    const access_token = await getAccessToken(env);
    
    // 请求微信接口获取手机号
    const wxUrl = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${access_token}`;
    
    const response = await fetch(wxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });
    
    const result = await response.json();
    
    // 返回微信接口的响应
    return createJsonResponse(result);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}