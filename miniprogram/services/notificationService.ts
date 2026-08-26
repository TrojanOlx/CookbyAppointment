// 微信订阅消息前端服务
//
// ⚠️ 使用前必须完成以下配置：
//   1. 在微信公众平台申请订阅消息模板（功能 → 订阅消息）
//   2. 将申请到的 template_id 替换下方对应常量值
//
// 订阅消息使用一次性订阅模式：
//   - 每次弹窗授权对应 1 条推送配额
//   - 用户拒绝不阻断业务流程，只是收不到对应通知

export const SUBSCRIBE_TEMPLATE_IDS = {
  NEW_APPT: 'T1TUgP2VEEzz_3lAAypK1sP4AyJ_YIpSsX_hy1tU2is',
  STATUS: '7-mOlcEKprjQzibpS0P8q9Buyz4zA0cgm4W3DcWZVqM',
  REMINDER: '_EAlByNCdkJmmWr-UjT8sSaY5mmbTPcdqmSIAYO3bPQ',
} as const;

// 判断模板 ID 是否已正式配置（非占位符）
function isConfigured(id: string): boolean {
  return Boolean(id) && !id.startsWith('REPLACE_WITH');
}

function uniqueConfiguredTemplateIds(ids: string[]): string[] {
  return [...new Set(ids.filter(isConfigured))];
}

function logSubscribeResult(scene: string, tmplIds: string[], res: Record<string, string>) {
  const result = tmplIds.map(tmplId => ({
    tmplId,
    status: res[tmplId] || 'unknown'
  }));
  console.log(`${scene}订阅结果:`, result);
}

function requestSubscribe(scene: string, tmplIds: string[]): Promise<void> {
  return new Promise((resolve) => {
    const uniqueTmplIds = uniqueConfiguredTemplateIds(tmplIds);

    if (uniqueTmplIds.length === 0) {
      console.warn(`${scene}订阅消息模板 ID 均未配置，跳过订阅请求`);
      resolve();
      return;
    }

    if (typeof wx.requestSubscribeMessage !== 'function') {
      console.warn('当前基础库不支持 requestSubscribeMessage，跳过订阅请求');
      resolve();
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: uniqueTmplIds,
      success: (res: any) => {
        logSubscribeResult(scene, uniqueTmplIds, res);
        resolve();
      },
      fail: (err: any) => {
        // 订阅失败不阻断预约流程
        console.warn(`${scene}订阅请求失败（不影响业务流程）:`, err);
        resolve();
      },
    });
  });
}

/**
 * 用户订阅：在提交或恢复预约前调用，一次申请状态通知和当日提醒。
 *
 * ⚠️ 必须在用户点击事件（tap handler）中调用，否则微信不会弹出授权弹窗
 */
export function requestSubscribeForUser(): Promise<void> {
  return requestSubscribe('用户侧', [
    SUBSCRIBE_TEMPLATE_IDS.STATUS,
    SUBSCRIBE_TEMPLATE_IDS.REMINDER,
  ]);
}

/**
 * 管理员订阅：在管理员执行预约操作（确认/取消/完成）时调用
 * 申请订阅「新预约提醒」模板，以便后续有新预约时能收到推送
 *
 * ⚠️ 必须在用户点击事件（tap handler）中调用
 */
export function requestSubscribeForAdmin(): Promise<void> {
  return requestSubscribe('管理员', [SUBSCRIBE_TEMPLATE_IDS.NEW_APPT]);
}
