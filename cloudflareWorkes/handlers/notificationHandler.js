// 微信订阅消息推送处理模块
//
// 当前正式模板：预约订单提醒，字段为 time12 + thing9。
// 所有通知场景复用同一模板，通过 thing9 的内容区分业务含义。
const DEFAULT_APPOINTMENT_TEMPLATE_ID = 'bNsydRQbXtouRni5xtLXoJ7zB5Xbp26uZ9CN6nzhHB0';

function resolveTemplateId(env, key) {
  return env[key] || env.TMPL_APPOINTMENT || DEFAULT_APPOINTMENT_TEMPLATE_ID;
}

function maskOpenid(openid) {
  if (!openid) return '';
  return `***${String(openid).slice(-4)}`;
}

function buildAppointmentMessageData(timeValue, contentValue) {
  return {
    time12: { value: String(timeValue || '').substring(0, 20) },
    thing9: { value: String(contentValue || '').substring(0, 20) }
  };
}

// ─── access_token 缓存（读写 D1）──────────────────────────────────────────────

async function getOrRefreshAccessToken(env) {
  // 先尝试读取 D1 中的缓存（提前 5 分钟刷新，避免边界失效）
  try {
    const cached = await env.DB.prepare(
      'SELECT access_token, expire_time FROM wx_access_token WHERE id = 1'
    ).first();
    if (cached && cached.expire_time > Date.now() + 5 * 60 * 1000) {
      return cached.access_token;
    }
  } catch (e) {
    // 表可能尚未建立，继续向微信接口请求
    console.error('读取 access_token 缓存失败:', e.message);
  }

  // 向微信接口重新获取 access_token
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WX_APPID}&secret=${env.WX_SECRET}`;
  const res = await fetch(url);
  const result = await res.json();

  if (result.errcode) {
    throw new Error(`获取 access_token 失败: ${result.errmsg}`);
  }

  const accessToken = result.access_token;
  // expires_in 为秒，转换为毫秒时间戳
  const expireTime = Date.now() + result.expires_in * 1000;

  // 写入 D1 缓存（INSERT OR REPLACE 覆盖 id=1 的单行记录）
  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO wx_access_token (id, access_token, expire_time) VALUES (1, ?, ?)`
    ).bind(accessToken, expireTime).run();
  } catch (e) {
    console.error('写入 access_token 缓存失败:', e.message);
  }

  return accessToken;
}

// ─── 核心发送函数 ────────────────────────────────────────────────────────────

/**
 * 发送微信订阅消息
 * @param {object} env       - Worker 环境变量（含 WX_APPID、WX_SECRET）
 * @param {string} openid    - 接收消息的用户 openid
 * @param {string} templateId - 订阅消息模板 ID
 * @param {object} data      - 模板数据，格式 { fieldName: { value: '内容' } }
 * @param {string} page      - 用户点击通知后跳转的小程序页面路径
 * @returns {Promise<boolean>} 发送成功返回 true
 */
async function sendSubscribeMessage(env, openid, templateId, data, page) {
  if (!openid || !templateId) {
    console.warn('sendSubscribeMessage：openid 或 templateId 为空，跳过发送');
    return false;
  }

  try {
    const accessToken = await getOrRefreshAccessToken(env);
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;

    const body = { touser: openid, template_id: templateId, page, data };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();

    if (result.errcode !== 0) {
      // errcode 43101 = 用户未订阅该消息，属正常情况，不记录为错误
      const logDetail = `openid=${maskOpenid(openid)} templateId=${templateId} page=${page} errcode=${result.errcode} errmsg=${result.errmsg}`;
      if (result.errcode === 43101) {
        console.warn(`订阅消息未发送：用户未授权或一次性授权已消费 ${logDetail}`);
      } else {
        console.error(`订阅消息发送失败 ${logDetail}`);
      }
      return false;
    }

    console.log(`订阅消息发送成功 openid=${maskOpenid(openid)} templateId=${templateId} page=${page}`);
    return true;
  } catch (e) {
    console.error(`sendSubscribeMessage 发生异常 openid=${maskOpenid(openid)} templateId=${templateId} page=${page}:`, e.message);
    return false;
  }
}

// ─── 管理员相关辅助函数 ──────────────────────────────────────────────────────

// 获取所有 isAdmin=1 的用户 openid 列表
async function getAllAdminOpenids(db) {
  const result = await db.prepare(
    'SELECT openid FROM users WHERE isAdmin = 1 AND openid IS NOT NULL AND openid != ""'
  ).all();
  return (result.results || []).map(row => row.openid);
}

// 向所有管理员发送同一条订阅消息
async function notifyAdmins(env, templateId, data, page) {
  if (!templateId) return;
  try {
    const adminOpenids = await getAllAdminOpenids(env.DB);
    for (const openid of adminOpenids) {
      await sendSubscribeMessage(env, openid, templateId, data, page);
    }
  } catch (e) {
    console.error('向管理员批量推送通知失败:', e.message);
  }
}

// ─── 业务通知函数（对外导出）────────────────────────────────────────────────

/**
 * 通知所有管理员：有新预约提交
 * 触发时机：handleCreateAppointment 成功后
 *
 * 建议申请包含以下字段的模板：thing1（内容）、thing2（备注）、time3（提交时间）
 */
export async function notifyAdminsNewAppointment(env, appointment, dishes) {
  const templateId = resolveTemplateId(env, 'TMPL_NEW_APPT');

  const dishNames = (dishes || []).map(d => d.name).filter(Boolean).join('、') || '未指定';
  const submitTime = new Date(appointment.createTime)
    .toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

  const content = `${appointment.date} ${appointment.mealType}：${dishNames}`;
  const data = buildAppointmentMessageData(submitTime, content);

  await notifyAdmins(env, templateId, data, 'pages/profile/admin/appointments/appointments');
}

/**
 * 通知所有管理员：用户主动取消了预约
 * 触发时机：handleCancelAppointment 中用户（非管理员）取消时
 * 复用 TMPL_NEW_APPT 模板，内容字段说明为用户取消
 */
export async function notifyAdminsUserCancelled(env, appointment) {
  const templateId = resolveTemplateId(env, 'TMPL_NEW_APPT');

  const cancelTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const content = `${appointment.date} ${appointment.mealType} [用户取消]`;
  const data = buildAppointmentMessageData(cancelTime, content);

  await notifyAdmins(env, templateId, data, 'pages/profile/admin/appointments/appointments');
}

/**
 * 通知用户：预约已被管理员确认
 * 触发时机：handleConfirmAppointment 成功后
 *
 * 建议申请包含以下字段的模板：thing1（内容）、phrase2（状态）、time3（日期）、thing4（备注）
 */
export async function notifyUserConfirmed(env, appointment) {
  const templateId = resolveTemplateId(env, 'TMPL_CONFIRMED');
  const data = buildAppointmentMessageData(
    appointment.date,
    `${appointment.mealType}预约已确认，请按时用餐`
  );

  await sendSubscribeMessage(env, appointment.openid, templateId, data, 'pages/appointment/appointment');
}

/**
 * 通知用户：预约被管理员取消
 * 触发时机：handleCancelAppointment 中管理员取消时
 *
 * 建议申请包含以下字段的模板：thing1（内容）、phrase2（状态）、thing3（原因）、time4（时间）
 */
export async function notifyUserCancelled(env, appointment, reason) {
  const templateId = resolveTemplateId(env, 'TMPL_CANCELLED');
  const data = buildAppointmentMessageData(
    appointment.date,
    `${appointment.mealType}预约已取消：${reason || '管理员操作'}`
  );

  await sendSubscribeMessage(env, appointment.openid, templateId, data, 'pages/appointment/appointment');
}

/**
 * 通知用户：预约已完成
 * 触发时机：handleCompleteAppointment 成功后
 *
 * 建议申请包含以下字段的模板：thing1（内容）、phrase2（状态）、time3（完成时间）、thing4（备注）
 */
export async function notifyUserCompleted(env, appointment) {
  const templateId = resolveTemplateId(env, 'TMPL_COMPLETED');
  const data = buildAppointmentMessageData(
    appointment.date,
    `${appointment.mealType}预约已完成，感谢光临`
  );

  await sendSubscribeMessage(env, appointment.openid, templateId, data, 'pages/appointment/appointment');
}

/**
 * 定时任务入口：发送当日预约提醒
 * 触发时机：Cron Trigger（UTC 00:00 = 北京时间 08:00）
 *
 * 建议申请包含以下字段的模板：thing1（提醒标题）、time2（用餐时间）、thing3（提示语）
 */
export async function sendDailyReminders(env) {
  const templateId = resolveTemplateId(env, 'TMPL_REMINDER');

  try {
    // 计算北京时间（UTC+8）的今日日期
    const bjDate = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const today = bjDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // 查询今日所有已确认的预约
    const result = await env.DB.prepare(
      `SELECT * FROM appointments WHERE date = ? AND status = '已确认'`
    ).bind(today).all();

    const appointments = result.results || [];
    console.log(`当日提醒：找到 ${appointments.length} 条已确认预约（${today}）`);

    for (const appointment of appointments) {
      if (!appointment.openid) continue;

      const data = buildAppointmentMessageData(
        `${appointment.date} ${appointment.mealType}`,
        '您今天有预约用餐，请准时到餐'
      );

      await sendSubscribeMessage(
        env,
        appointment.openid,
        templateId,
        data,
        'pages/appointment/appointment'
      );
    }

    console.log(`当日提醒任务完成，共发送 ${appointments.length} 条`);
  } catch (e) {
    console.error('sendDailyReminders 执行失败:', e.message);
  }
}
