// 微信订阅消息前端服务
//
// ⚠️ 使用前必须完成以下配置：
//   1. 在微信公众平台申请订阅消息模板（功能 → 订阅消息）
//   2. 将申请到的 template_id 替换下方对应常量值
//
// 订阅消息使用一次性订阅模式：
//   - 每次弹窗授权对应 1 条推送配额
//   - 用户拒绝不阻断业务流程，只是收不到对应通知

// 各模板 ID 配置（申请后替换）
// 模板 ID：bNsydRQbXtouRni5xtLXoJ7zB5Xbp26uZ9CN6nzhHB0（预约订单提醒，字段：time12 + thing9）
// 所有通知类型复用同一模板，通过 thing9 内容区分通知含义
const TMPL_IDS = {
  NEW_APPT:  'bNsydRQbXtouRni5xtLXoJ7zB5Xbp26uZ9CN6nzhHB0',
  CONFIRMED: 'bNsydRQbXtouRni5xtLXoJ7zB5Xbp26uZ9CN6nzhHB0',
  CANCELLED: 'bNsydRQbXtouRni5xtLXoJ7zB5Xbp26uZ9CN6nzhHB0',
  COMPLETED: 'bNsydRQbXtouRni5xtLXoJ7zB5Xbp26uZ9CN6nzhHB0',
  REMINDER:  'bNsydRQbXtouRni5xtLXoJ7zB5Xbp26uZ9CN6nzhHB0',
};

// 判断模板 ID 是否已正式配置（非占位符）
function isConfigured(id: string): boolean {
  return Boolean(id) && !id.startsWith('REPLACE_WITH');
}

/**
 * 用户订阅：在提交新预约前调用，申请订阅 4 个用户侧通知模板
 * （预约确认 / 预约取消 / 预约完成 / 当日提醒）
 *
 * ⚠️ 必须在用户点击事件（tap handler）中调用，否则微信不会弹出授权弹窗
 */
export function requestSubscribeForUser(): Promise<void> {
  return new Promise((resolve) => {
    // 去重：当多个通知类型复用同一模板 ID 时，微信不允许数组中有重复项
    const tmplIds = [...new Set([
      TMPL_IDS.CONFIRMED,
      TMPL_IDS.CANCELLED,
      TMPL_IDS.COMPLETED,
      TMPL_IDS.REMINDER,
    ].filter(isConfigured))];

    if (tmplIds.length === 0) {
      console.warn('用户侧订阅消息模板 ID 均未配置，跳过订阅请求');
      resolve();
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds,
      success: (res: any) => {
        console.log('用户订阅结果:', res);
        resolve();
      },
      fail: (err: any) => {
        // 订阅失败不阻断预约提交
        console.warn('用户订阅请求失败（不影响预约流程）:', err);
        resolve();
      },
    });
  });
}

/**
 * 管理员订阅：在管理员执行预约操作（确认/取消/完成）时调用
 * 申请订阅「新预约提醒」模板，以便后续有新预约时能收到推送
 *
 * ⚠️ 必须在用户点击事件（tap handler）中调用
 */
export function requestSubscribeForAdmin(): Promise<void> {
  return new Promise((resolve) => {
    const tmplId = TMPL_IDS.NEW_APPT;

    if (!isConfigured(tmplId)) {
      console.warn('管理员通知模板 ID 未配置，跳过订阅请求');
      resolve();
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res: any) => {
        console.log('管理员订阅结果:', res);
        resolve();
      },
      fail: (err: any) => {
        console.warn('管理员订阅请求失败（不影响操作流程）:', err);
        resolve();
      },
    });
  });
}
