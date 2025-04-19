// 导入处理程序
import { handleGetUserProfile } from './handlers/userProfile.js';
import { handleGetUserPhoneNumber } from './handlers/phoneNumber.js';
import { handleLogin, handleGetUserInfo, handleUpdateUserInfo, handleCheckAdmin, handleGetUserList, handleGetUserPhone } from './handlers/userHandler.js';
import { handleGetInventoryList, handleGetInventoryDetail, handleAddInventory, handleUpdateInventory, handleDeleteInventory, handleSearchInventory, handleGetExpiringItems } from './handlers/inventoryHandler.js';
import { handleGetDishList, handleGetDishDetail, handleAddDish, handleUpdateDish, handleDeleteDish, handleSearchDish, handleRecommendByIngredients, handleGetIngredientList, handleAddIngredient, handleUpdateIngredient, handleDeleteIngredient } from './handlers/dishHandler.js';
import { handleGetAppointmentList, handleGetAppointmentDetail, handleCreateAppointment, handleUpdateAppointment, handleCancelAppointment, handleConfirmAppointment, handleCompleteAppointment, handleGetAppointmentDishes, handleAddAppointmentDish, handleRemoveAppointmentDish } from './handlers/appointmentHandler.js';

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

// API路由
const routes = {
  // 用户相关API
  '/api/user/login': { POST: handleLogin },
  '/api/user/profile': { POST: handleGetUserProfile },
  '/api/user/phone': { POST: handleGetUserPhone },
  '/api/user/info': { GET: handleGetUserInfo, PUT: handleUpdateUserInfo },
  '/api/user/admin': { GET: handleCheckAdmin },
  '/api/user/list': { GET: handleGetUserList },
  '/api/user/phone/wx': { POST: handleGetUserPhoneNumber },
  
  // 库存相关API
  '/api/inventory/list': { GET: handleGetInventoryList },
  '/api/inventory/detail': { GET: handleGetInventoryDetail },
  '/api/inventory/add': { POST: handleAddInventory },
  '/api/inventory/update': { PUT: handleUpdateInventory },
  '/api/inventory/delete': { DELETE: handleDeleteInventory },
  '/api/inventory/search': { GET: handleSearchInventory },
  '/api/inventory/expiring': { GET: handleGetExpiringItems },
  
  // 菜品相关API
  '/api/dish/list': { GET: handleGetDishList },
  '/api/dish/detail': { GET: handleGetDishDetail },
  '/api/dish/add': { POST: handleAddDish },
  '/api/dish/update': { PUT: handleUpdateDish },
  '/api/dish/delete': { DELETE: handleDeleteDish },
  '/api/dish/search': { GET: handleSearchDish },
  '/api/dish/recommend': { POST: handleRecommendByIngredients },
  '/api/dish/ingredients': { GET: handleGetIngredientList },
  '/api/dish/ingredient/add': { POST: handleAddIngredient },
  '/api/dish/ingredient/update': { PUT: handleUpdateIngredient },
  '/api/dish/ingredient/delete': { DELETE: handleDeleteIngredient },
  
  // 预约相关API
  '/api/appointment/list': { GET: handleGetAppointmentList },
  '/api/appointment/detail': { GET: handleGetAppointmentDetail },
  '/api/appointment/create': { POST: handleCreateAppointment },
  '/api/appointment/update': { PUT: handleUpdateAppointment },
  '/api/appointment/cancel': { PUT: handleCancelAppointment },
  '/api/appointment/confirm': { PUT: handleConfirmAppointment },
  '/api/appointment/complete': { PUT: handleCompleteAppointment },
  '/api/appointment/dishes': { GET: handleGetAppointmentDishes },
  '/api/appointment/dish/add': { POST: handleAddAppointmentDish },
  '/api/appointment/dish/remove': { DELETE: handleRemoveAppointmentDish }
};

// 跨域头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// 处理请求
async function handleRequest(request, env) {
  // 解析URL
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  // 处理预检请求
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  
  // 查找路由处理程序
  const route = routes[path];
  
  if (route && route[method]) {
    // 调用处理程序
    try {
      const response = await route[method](request, env);
      // 添加CORS头
      return addCorsHeaders(response);
    } catch (error) {
      console.error(`Error handling ${method} ${path}:`, error);
      return addCorsHeaders(createErrorResponse(`服务器错误: ${error.message}`, 500));
    }
  }
  
  // 路由不存在
  return addCorsHeaders(createErrorResponse('Not Found', 404));
}

// 添加CORS头
function addCorsHeaders(response) {
  const newHeaders = new Headers(response.headers);
  
  Object.keys(corsHeaders).forEach(key => {
    newHeaders.set(key, corsHeaders[key]);
  });
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

// Worker入口
export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('Unhandled error:', error);
      return addCorsHeaders(createErrorResponse('Internal Server Error', 500));
    }
  }
};