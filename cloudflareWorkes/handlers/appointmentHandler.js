import { createJsonResponse, createErrorResponse } from '../wxApi.js';



// 管理员获取所有预约列表
export async function handleGetAllAppointments(request, env) {
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

    // 只有管理员可以查看所有预约
    if (user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }

    // 获取查询参数
    const query = new URL(request.url).searchParams;
    const page = parseInt(query.get('page')) || 1;
    const pageSize = parseInt(query.get('pageSize')) || 10;
    const status = query.get('status') || null;
    const startDate = query.get('startDate') || null;
    const endDate = query.get('endDate') || null;

    // 验证日期格式
    if (startDate && !isValidDateFormat(startDate)) {
      return createErrorResponse('开始日期格式无效，应为YYYY-MM-DD', 400);
    }
    if (endDate && !isValidDateFormat(endDate)) {
      return createErrorResponse('结束日期格式无效，应为YYYY-MM-DD', 400);
    }

    // 查询所有预约列表
    const { total, appointments } = await getAppointmentList(
      env.DB,
      null, // 传入null表示不限制用户
      page,
      pageSize,
      status,
      startDate,
      endDate
    );

    return createJsonResponse({ total, list: appointments });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 管理员获取指定日期所有用户的预约列表
export async function handleGetDateAppointments(request, env) {
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

    // 只有管理员可以查看所有预约
    if (user.isAdmin !== 1) {
      return createErrorResponse('权限不足', 403);
    }

    // 获取查询参数
    const query = new URL(request.url).searchParams;
    const page = parseInt(query.get('page')) || 1;
    const pageSize = parseInt(query.get('pageSize')) || 50;
    const status = query.get('status') || null;
    const date = query.get('date') || null;

    // 验证日期参数
    if (!date || !isValidDateFormat(date)) {
      // 如果没有提供有效的日期参数，返回空结果
      return createJsonResponse({ total: 0, list: [] });
    }

    // 查询指定日期的所有预约列表
    const { total, appointments } = await getAppointmentList(
      env.DB,
      null, // 传入null表示不限制用户
      page,
      pageSize,
      status,
      date
    );

    // 为每个预约添加用户信息和菜品详情
    const appointmentsWithDetails = [];
    for (const appointment of appointments) {
      // 获取用户信息
      const userInfo = await getUserById(env.DB, appointment.userId);

      // 获取预约关联的菜品
      const appointmentDishes = await getAppointmentDishes(env.DB, appointment.id);
      const dishIds = appointmentDishes.map(ad => ad.dishId);

      // 获取菜品详情
      const dishes = [];
      for (const dishId of dishIds) {
        const dish = await getDishById(env.DB, dishId);
        if (dish) {
          dishes.push(dish);
        }
      }

      // 构建完整的预约信息
      appointmentsWithDetails.push({
        ...appointment,
        userName: userInfo ? userInfo.nickName : '未知用户',
        userPhone: userInfo ? userInfo.phone : '',
        userAvatar: userInfo ? userInfo.avatarUrl : '',
        dishes
      });
    }

    return createJsonResponse({ total, list: appointmentsWithDetails });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取预约列表
export async function handleGetAppointmentList(request, env) {
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
    const status = query.get('status') || null;
    const startDate = query.get('startDate') || null;
    const endDate = query.get('endDate') || null;
    
    // 普通用户只能查看自己的预约
    const userId = user.id;
    
    // 查询预约列表
    const { total, appointments } = await getAppointmentList(
      env.DB, 
      userId, 
      page, 
      pageSize, 
      status, 
      startDate,
      endDate
    );
    
    return createJsonResponse({ total, list: appointments });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取指定日期预约列表
export async function handleGetAppointmentListByDate(request, env) {
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
    const date = query.get('date');
    const status = query.get('status') || null;
    
    // 验证日期参数
    if (!date || !isValidDateFormat(date)) {
      return createErrorResponse('日期参数无效，格式应为YYYY-MM-DD', 400);
    }
    
    // 查询用户指定日期的预约列表
    const { total, appointments } = await getAppointmentList(
      env.DB,
      user.id, // 只查询用户自己的预约
      1, // 页码
      100, // 每页数量
      status,
      date
    );
    
    // 为每个预约添加菜品详情
    const appointmentsWithDetails = [];
    for (const appointment of appointments) {
      // 获取预约关联的菜品
      const appointmentDishes = await getAppointmentDishes(env.DB, appointment.id);
      const dishIds = appointmentDishes.map(ad => ad.dishId);
      
      // 获取菜品详情
      const dishes = [];
      for (const dishId of dishIds) {
        const dish = await getDishById(env.DB, dishId);
        if (dish) {
          dishes.push(dish);
        }
      }
      
      // 构建完整的预约信息
      appointmentsWithDetails.push({
        ...appointment,
        dishes
      });
    }
    
    return createJsonResponse({ total, list: appointmentsWithDetails });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取预约详情
export async function handleGetAppointmentDetail(request, env) {
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

    // 查询预约详情
    const appointment = await getAppointmentById(env.DB, id);

    if (!appointment) {
      return createErrorResponse('预约不存在', 404);
    }

    // 普通用户只能查看自己的预约
    if (user.isAdmin !== 1 && appointment.userId !== user.id) {
      return createErrorResponse('权限不足', 403);
    }

    // 获取预约关联的菜品
    const appointmentDishes = await getAppointmentDishes(env.DB, id);
    const dishIds = appointmentDishes.map(ad => ad.dishId);

    // 获取菜品详情
    const dishes = [];
    for (const dishId of dishIds) {
      const dish = await getDishById(env.DB, dishId);
      if (dish) {
        dishes.push(dish);
      }
    }

    // 构建完整的预约信息
    const fullAppointment = {
      ...appointment,
      dishes
    };

    return createJsonResponse(fullAppointment);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 创建预约
export async function handleCreateAppointment(request, env) {
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
    if (!data.date || !data.mealType) {
      return createErrorResponse('日期和餐次为必填项');
    }

    if (!Array.isArray(data.dishes) || data.dishes.length === 0) {
      return createErrorResponse('至少需要选择一个菜品');
    }

    // 检查日期格式
    if (!isValidDateFormat(data.date)) {
      return createErrorResponse('日期格式不正确，应为YYYY-MM-DD');
    }

    // 创建预约
    const newAppointment = {
      userId: user.id,
      openid: user.openid,
      date: data.date,
      mealType: data.mealType,
      status: '待确认',
      remarks: data.remarks || '',
      createTime: Date.now(),
      updateTime: Date.now()
    };

    // 保存预约到数据库
    const createdAppointment = await createAppointment(env.DB, newAppointment);

    // 保存预约与菜品的关联
    for (const dishId of data.dishes) {
      await createAppointmentDish(env.DB, {
        appointmentId: createdAppointment.id,
        dishId,
        createTime: Date.now()
      });
    }

    // 获取预约关联的菜品详情
    const dishes = [];
    for (const dishId of data.dishes) {
      const dish = await getDishById(env.DB, dishId);
      if (dish) {
        dishes.push(dish);
      }
    }

    // 返回完整的预约信息
    return createJsonResponse({
      ...createdAppointment,
      dishes
    });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 更新预约
export async function handleUpdateAppointment(request, env) {
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

    // 查询预约
    const existingAppointment = await getAppointmentById(env.DB, data.id);

    if (!existingAppointment) {
      return createErrorResponse('预约不存在', 404);
    }

    // 普通用户只能更新自己的预约，且只能更新待确认状态的预约
    if (user.isAdmin !== 1) {
      if (existingAppointment.userId !== user.id) {
        return createErrorResponse('权限不足', 403);
      }

      if (existingAppointment.status !== '待确认') {
        return createErrorResponse('只能修改待确认状态的预约', 400);
      }
    }

    // 更新预约
    const updatedAppointment = {
      ...existingAppointment,
      ...data,
      updateTime: Date.now()
    };

    // 管理员可以更新所有字段，普通用户只能更新部分字段
    if (user.isAdmin !== 1) {
      // 保留原始用户信息
      updatedAppointment.userId = existingAppointment.userId;
      updatedAppointment.openid = existingAppointment.openid;

      // 状态只能是待确认
      updatedAppointment.status = '待确认';
    }

    await updateAppointment(env.DB, updatedAppointment);

    // 如果提供了菜品信息，则更新预约菜品关联
    if (Array.isArray(data.dishes) && data.dishes.length > 0) {
      // 获取现有关联
      const existingAppointmentDishes = await getAppointmentDishes(env.DB, updatedAppointment.id);

      // 删除所有现有关联
      for (const appointmentDish of existingAppointmentDishes) {
        await deleteAppointmentDish(env.DB, appointmentDish.id);
      }

      // 添加新的关联
      for (const dishId of data.dishes) {
        await createAppointmentDish(env.DB, {
          appointmentId: updatedAppointment.id,
          dishId,
          createTime: Date.now()
        });
      }

      // 获取菜品详情
      const dishes = [];
      for (const dishId of data.dishes) {
        const dish = await getDishById(env.DB, dishId);
        if (dish) {
          dishes.push(dish);
        }
      }

      // 返回完整的预约信息
      return createJsonResponse({
        ...updatedAppointment,
        dishes
      });
    } else {
      // 获取现有菜品关联
      const appointmentDishes = await getAppointmentDishes(env.DB, updatedAppointment.id);
      const dishIds = appointmentDishes.map(ad => ad.dishId);

      // 获取菜品详情
      const dishes = [];
      for (const dishId of dishIds) {
        const dish = await getDishById(env.DB, dishId);
        if (dish) {
          dishes.push(dish);
        }
      }

      // 返回完整的预约信息
      return createJsonResponse({
        ...updatedAppointment,
        dishes
      });
    }
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 取消预约
export async function handleCancelAppointment(request, env) {
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
    const { id, reason } = data;

    if (!id) {
      return createErrorResponse('缺少id参数');
    }

    // 查询预约
    const existingAppointment = await getAppointmentById(env.DB, id);

    if (!existingAppointment) {
      return createErrorResponse('预约不存在', 404);
    }

    // 普通用户只能取消自己的预约
    if (user.isAdmin !== 1 && existingAppointment.userId !== user.id) {
      return createErrorResponse('权限不足', 403);
    }

    // 已完成的预约不能取消
    if (existingAppointment.status === '已完成') {
      return createErrorResponse('已完成的预约不能取消', 400);
    }

    // 如果已经是已取消状态，则直接返回成功
    if (existingAppointment.status === '已取消') {
      return createJsonResponse({ success: true });
    }

    // 更新预约状态为已取消
    const updatedAppointment = {
      ...existingAppointment,
      status: '已取消',
      remarks: reason ? `${existingAppointment.remarks} (取消原因: ${reason})` : existingAppointment.remarks,
      updateTime: Date.now()
    };

    await updateAppointment(env.DB, updatedAppointment);

    return createJsonResponse({ success: true });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 确认预约
export async function handleConfirmAppointment(request, env) {
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

    // 只有管理员可以确认预约
    if (user.isAdmin !== 1) {
      return createErrorResponse('只有管理员可以确认预约', 403);
    }

    // 获取请求数据
    const data = await request.json();
    const { id } = data;

    if (!id) {
      return createErrorResponse('缺少id参数');
    }

    // 查询预约
    const existingAppointment = await getAppointmentById(env.DB, id);

    if (!existingAppointment) {
      return createErrorResponse('预约不存在', 404);
    }

    // 只能确认待确认状态的预约
    if (existingAppointment.status !== '待确认') {
      return createErrorResponse(`不能确认${existingAppointment.status}状态的预约`, 400);
    }

    // 更新预约状态为已确认
    const updatedAppointment = {
      ...existingAppointment,
      status: '已确认',
      updateTime: Date.now()
    };

    await updateAppointment(env.DB, updatedAppointment);

    return createJsonResponse({ success: true });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 完成预约
export async function handleCompleteAppointment(request, env) {
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

    // 只有管理员可以完成预约
    if (user.isAdmin !== 1) {
      return createErrorResponse('只有管理员可以完成预约', 403);
    }

    // 获取请求数据
    const data = await request.json();
    const { id } = data;

    if (!id) {
      return createErrorResponse('缺少id参数');
    }

    // 查询预约
    const existingAppointment = await getAppointmentById(env.DB, id);

    if (!existingAppointment) {
      return createErrorResponse('预约不存在', 404);
    }

    // 只能完成已确认状态的预约
    if (existingAppointment.status !== '已确认') {
      return createErrorResponse(`不能完成${existingAppointment.status}状态的预约`, 400);
    }

    // 更新预约状态为已完成
    const updatedAppointment = {
      ...existingAppointment,
      status: '已完成',
      updateTime: Date.now()
    };

    await updateAppointment(env.DB, updatedAppointment);

    return createJsonResponse({ success: true });
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 获取预约菜品关联
export async function handleGetAppointmentDishes(request, env) {
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
      return createErrorResponse('缺少appointmentId参数');
    }

    // 查询预约
    const appointment = await getAppointmentById(env.DB, appointmentId);

    if (!appointment) {
      return createErrorResponse('预约不存在', 404);
    }

    // 普通用户只能查看自己的预约
    if (user.isAdmin !== 1 && appointment.userId !== user.id) {
      return createErrorResponse('权限不足', 403);
    }

    // 获取预约菜品关联
    const appointmentDishes = await getAppointmentDishes(env.DB, appointmentId);

    return createJsonResponse(appointmentDishes);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 添加预约菜品关联
export async function handleAddAppointmentDish(request, env) {
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
    if (!data.appointmentId || !data.dishId) {
      return createErrorResponse('预约ID和菜品ID为必填项');
    }

    // 查询预约
    const appointment = await getAppointmentById(env.DB, data.appointmentId);

    if (!appointment) {
      return createErrorResponse('预约不存在', 404);
    }

    // 普通用户只能操作自己的预约
    if (user.isAdmin !== 1 && appointment.userId !== user.id) {
      return createErrorResponse('权限不足', 403);
    }

    // 只能修改待确认状态的预约
    if (user.isAdmin !== 1 && appointment.status !== '待确认') {
      return createErrorResponse('只能修改待确认状态的预约', 400);
    }

    // 检查菜品是否存在
    const dish = await getDishById(env.DB, data.dishId);

    if (!dish) {
      return createErrorResponse('菜品不存在', 404);
    }

    // 检查是否已经添加过该菜品
    const existingDish = await getAppointmentDishByDishId(env.DB, data.appointmentId, data.dishId);

    if (existingDish) {
      return createErrorResponse('该菜品已添加到预约中', 400);
    }

    // 创建预约菜品关联
    const appointmentDish = {
      appointmentId: data.appointmentId,
      dishId: data.dishId,
      createTime: Date.now()
    };

    const createdDish = await createAppointmentDish(env.DB, appointmentDish);

    return createJsonResponse(createdDish);
  } catch (error) {
    return createErrorResponse(`服务器错误: ${error.message}`, 500);
  }
}

// 删除预约菜品关联
export async function handleRemoveAppointmentDish(request, env) {
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

    // 查询预约菜品关联
    const appointmentDish = await getAppointmentDishById(env.DB, id);

    if (!appointmentDish) {
      return createErrorResponse('预约菜品关联不存在', 404);
    }

    // 查询预约
    const appointment = await getAppointmentById(env.DB, appointmentDish.appointmentId);

    if (!appointment) {
      return createErrorResponse('预约不存在', 404);
    }

    // 普通用户只能操作自己的预约
    if (user.isAdmin !== 1 && appointment.userId !== user.id) {
      return createErrorResponse('权限不足', 403);
    }

    // 只能修改待确认状态的预约
    if (user.isAdmin !== 1 && appointment.status !== '待确认') {
      return createErrorResponse('只能修改待确认状态的预约', 400);
    }

    // 删除预约菜品关联
    await deleteAppointmentDish(env.DB, id);

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

async function getAppointmentList(db, userId, page, pageSize, status = null, startDate = null, endDate = null) {
  // 计算偏移量
  const offset = (page - 1) * pageSize;
  
  // 构建SQL
  let countSql = 'SELECT COUNT(*) as total FROM appointments';
  let listSql = 'SELECT * FROM appointments';
  let params = [];
  let conditions = [];
  
  // 添加用户过滤
  if (userId) {
    conditions.push('userId = ?');
    params.push(userId);
  }
  
  // 添加状态过滤
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  
  // 添加日期范围过滤
  if (startDate) {
    conditions.push('date >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('date <= ?');
    params.push(endDate);
  }
  
  // 组合条件
  if (conditions.length > 0) {
    countSql += ' WHERE ' + conditions.join(' AND ');
    listSql += ' WHERE ' + conditions.join(' AND ');
  }
  
  // 添加排序和分页
  listSql += ' ORDER BY date DESC, createTime DESC LIMIT ? OFFSET ?';
  
  // 获取总数
  const countStmt = db.prepare(countSql).bind(...params);
  const { total } = await countStmt.first();
  
  // 获取列表
  const listStmt = db.prepare(listSql).bind(...params, pageSize, offset);
  const result = await listStmt.all();
  
  return { total, appointments: result.results };
}

async function getAppointmentById(db, id) {
  const stmt = db.prepare('SELECT * FROM appointments WHERE id = ?').bind(id);
  return await stmt.first();
}

async function createAppointment(db, appointment) {
  const id = crypto.randomUUID();

  const stmt = db.prepare(`
    INSERT INTO appointments (
      id, userId, openid, date, mealType, status, remarks, createTime, updateTime
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    appointment.userId,
    appointment.openid,
    appointment.date,
    appointment.mealType,
    appointment.status,
    appointment.remarks,
    appointment.createTime,
    appointment.updateTime
  );

  await stmt.run();
  return { id, ...appointment };
}

async function updateAppointment(db, appointment) {
  const stmt = db.prepare(`
    UPDATE appointments
    SET date = ?, mealType = ?, status = ?, remarks = ?, updateTime = ?
    WHERE id = ?
  `).bind(
    appointment.date,
    appointment.mealType,
    appointment.status,
    appointment.remarks,
    appointment.updateTime,
    appointment.id
  );

  await stmt.run();
  return appointment;
}

async function getAppointmentDishes(db, appointmentId) {
  const stmt = db.prepare('SELECT * FROM appointment_dishes WHERE appointmentId = ?').bind(appointmentId);
  const result = await stmt.all();
  return result.results;
}

async function getAppointmentDishById(db, id) {
  const stmt = db.prepare('SELECT * FROM appointment_dishes WHERE id = ?').bind(id);
  return await stmt.first();
}

async function getAppointmentDishByDishId(db, appointmentId, dishId) {
  const stmt = db.prepare('SELECT * FROM appointment_dishes WHERE appointmentId = ? AND dishId = ?').bind(appointmentId, dishId);
  return await stmt.first();
}

async function createAppointmentDish(db, appointmentDish) {
  const id = crypto.randomUUID();

  const stmt = db.prepare(`
    INSERT INTO appointment_dishes (
      id, appointmentId, dishId, createTime
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    id,
    appointmentDish.appointmentId,
    appointmentDish.dishId,
    appointmentDish.createTime
  );

  await stmt.run();
  return { id, ...appointmentDish };
}

async function deleteAppointmentDish(db, id) {
  const stmt = db.prepare('DELETE FROM appointment_dishes WHERE id = ?').bind(id);
  await stmt.run();
  return true;
}

// 获取菜品详情（从dishHandler.js中导入的函数）
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

// 辅助函数
function parseJsonField(field, defaultValue) {
  if (!field) return defaultValue;

  try {
    return JSON.parse(field);
  } catch (e) {
    return defaultValue;
  }
}

// 根据用户ID获取用户信息
async function getUserById(db, userId) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?').bind(userId);
  return await stmt.first();
}

// 在文件末尾添加日期验证函数
function isValidDateFormat(dateStr) {
  // 严格检查格式：YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }

  // 解析年月日
  const [year, month, day] = dateStr.split('-').map(Number);

  // 验证年份范围（假设我们支持1900年到2100年）
  if (year < 1900 || year > 2100) {
    return false;
  }

  // 验证月份范围（01-12）
  if (month < 1 || month > 12) {
    return false;
  }

  // 获取指定年月的最后一天
  const lastDayOfMonth = new Date(year, month, 0).getDate();

  // 验证日期范围（01到当月最后一天）
  if (day < 1 || day > lastDayOfMonth) {
    return false;
  }

  // 确保月份和日期都是两位数
  const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return formattedDate === dateStr;
} 