// 微信订阅消息推送处理模块
//
// ⚠️ 模板字段说明：
// 微信订阅消息模板的字段名称因模板而异（如 thing1、time2、phrase3 等）。
// 以下各通知函数使用了常见模板的字段名称，申请模板后若字段名称不同，
// 请将对应函数中的 data 对象的 key 替换为实际模板中的字段名。
//
// 各通知场景对应的模板建议字段结构：
//   TMPL_NEW_APPT    (管理员收到新预约)  : thing1=内容, thing2=备注, time3=提交时间
//   TMPL_CONFIRMED   (用户收到确认)      : thing1=内容, phrase2=状态, time3=日期, thing4=提示
//   TMPL_CANCELLED   (用户收到取消)      : thing1=内容, phrase2=状态, thing3=原因, time4=时间
//   TMPL_COMPLETED   (用户收到完成)      : thing1=内容, phrase2=状态, time3=时间, thing4=提示
//   TMPL_REMINDER    (当日用餐提醒)      : thing1=提醒标题, time2=用餐时间, thing3=提示语
//
// 以上字段均为建议值，实际以申请到的模板为准。

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
      if (result.errcode !== 43101) {
        console.error(`订阅消息发送失败 openid=${openid} errcode=${result.errcode}: ${result.errmsg}`);
      }
      return false;
    }
    return true;
  } catch (e) {
    console.error('sendSubscribeMessage 发生异常:', e.message);
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
  const templateId = env.TMPL_NEW_APPT;
  if (!templateId) {
    console.warn('环境变量 TMPL_NEW_APPT 未配置，跳过新预约通知');
    return;
  }

  const dishNames = (dishes || []).map(d => d.name).filter(Boolean).join('、') || '未指定';
  const submitTime = new Date(appointment.createTime)
    .toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

  const content = `${appointment.date} ${appointment.mealType}：${dishNames}`;

  const data = {
    time12: { value: submitTime.substring(0, 20) },
    thing9: { value: content.substring(0, 20) }
  };

  await notifyAdmins(env, templateId, data, 'pages/profile/admin/appointments/appointments');
}

/**
 * 通知所有管理员：用户主动取消了预约
 * 触发时机：handleCancelAppointment 中用户（非管理员）取消时
 * 复用 TMPL_NEW_APPT 模板，内容字段说明为用户取消
 */
export async function notifyAdminsUserCancelled(env, appointment) {
  const templateId = env.TMPL_NEW_APPT;
  if (!templateId) return;

  const cancelTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const content = `${appointment.date} ${appointment.mealType} [用户取消]`;

  const data = {
    time12: { value: cancelTime.substring(0, 20) },
    thing9: { value: content.substring(0, 20) }
  };

  await notifyAdmins(env, templateId, data, 'pages/profile/admin/appointments/appointments');
}

/**
 * 通知用户：预约已被管理员确认
 * 触发时机：handleConfirmAppointment 成功后
 *
 * 建议申请包含以下字段的模板：thing1（内容）、phrase2（状态）、time3（日期）、thing4（备注）
 */
export async function notifyUserConfirmed(env, appointment) {
  const templateId = env.TMPL_CONFIRMED;
  if (!templateId) {
    console.warn('环境变量 TMPL_CONFIRMED 未配置，跳过预约确认通知');
    return;
  }

  const data = {
    time12: { value: appointment.date },
    thing9: { value: `${appointment.mealType}预约已确认，请按时用餐`.substring(0, 20) }
  };

  await sendSubscribeMessage(env, appointment.openid, templateId, data, 'pages/appointment/appointment');
}

/**
 * 通知用户：预约被管理员取消
 * 触发时机：handleCancelAppointment 中管理员取消时
 *
 * 建议申请包含以下字段的模板：thing1（内容）、phrase2（状态）、thing3（原因）、time4（时间）
 */
export async function notifyUserCancelled(env, appointment, reason) {
  const templateId = env.TMPL_CANCELLED;
  if (!templateId) {
    console.warn('环境变量 TMPL_CANCELLED 未配置，跳过预约取消通知');
    return;
  }

  const cancelTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

  const data = {
    time12: { value: appointment.date },
    thing9: { value: `${appointment.mealType}预约已取消：${(reason || '管理员操作')}`.substring(0, 20) }
  };

  await sendSubscribeMessage(env, appointment.openid, templateId, data, 'pages/appointment/appointment');
}

/**
 * 通知用户：预约已完成
 * 触发时机：handleCompleteAppointment 成功后
 *
 * 建议申请包含以下字段的模板：thing1（内容）、phrase2（状态）、time3（完成时间）、thing4（备注）
 */
export async function notifyUserCompleted(env, appointment) {
  const templateId = env.TMPL_COMPLETED;
  if (!templateId) {
    console.warn('环境变量 TMPL_COMPLETED 未配置，跳过预约完成通知');
    return;
  }

  const completeTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

  const data = {
    time12: { value: appointment.date },
    thing9: { value: `${appointment.mealType}预约已完成，感谢光临`.substring(0, 20) }
  };

  await sendSubscribeMessage(env, appointment.openid, templateId, data, 'pages/appointment/appointment');
}

/**
 * 定时任务入口：发送当日预约提醒
 * 触发时机：Cron Trigger（UTC 00:00 = 北京时间 08:00）
 *
 * 建议申请包含以下字段的模板：thing1（提醒标题）、time2（用餐时间）、thing3（提示语）
 */
export async function sendDailyReminders(env) {
  const templateId = env.TMPL_REMINDER;
  if (!templateId) {
    console.warn('环境变量 TMPL_REMINDER 未配置，跳过当日提醒');
    return;
  }

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

      const data = {
        time12: { value: `${appointment.date} ${appointment.mealType}` },
        thing9: { value: '您今天有预约用餐，请准时到餐' }
      };

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
