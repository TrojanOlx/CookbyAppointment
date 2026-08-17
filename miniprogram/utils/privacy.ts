// 隐私政策工具函数

/**
 * 获取隐私政策
 * 返回HTML格式的隐私政策内容
 */
export function getPrivacyPolicy(): string {
  // 尝试从本地文件读取隐私政策内容
  try {
    // 由于小程序限制，这里使用硬编码的隐私政策内容
    return `
      <div style="font-size:14px;line-height:1.6;">
        <h1 style="text-align:center;font-size:18px;margin-bottom:20px;">家庭菜单预约隐私政策</h1>
        
        <p>感谢您使用家庭菜单预约小程序。我们非常重视您的个人信息和隐私保护。为了更好地保障您的权益，在您使用我们的服务前，请您认真阅读并了解本隐私政策。</p>
        
        <h2 style="font-size:16px;margin-top:20px;">一、我们收集的信息</h2>
        
        <p>1. <strong>基本信息</strong>：微信账号标识、昵称、头像，以及您主动授权的手机号，用于登录、展示家庭成员身份和账号服务。</p>
        
        <p>2. <strong>使用信息</strong>：我们会收集您在使用过程中产生的数据，包括但不限于：</p>
        <ul style="padding-left:20px;">
          <li>家庭、家庭角色和邀请记录</li>
          <li>菜谱、冰箱库存、预约、采购、评价和上传文件</li>
          <li>过敏、忌口、喜好和辣度等口味标签</li>
          <li>保障服务运行所需的请求状态、故障和关键操作审计记录</li>
        </ul>
        
        <h2 style="font-size:16px;margin-top:20px;">二、我们如何使用这些信息</h2>
        
        <p>1. <strong>提供服务</strong>：基于家庭库存、预约用餐人和口味标签提供菜谱推荐、冲突提醒和采购清单。口味冲突仅作提醒，不会自动禁止预约。</p>
        
        <p>2. <strong>运行与安全</strong>：处理必要的请求状态、故障和关键操作审计记录，用于排查问题、防止滥用和保障家庭数据安全。</p>
        
        <p>3. <strong>通知提醒</strong>：向您发送预约确认、菜品准备完成等相关通知。</p>
        
        <h2 style="font-size:16px;margin-top:20px;">三、家庭内可见范围</h2>
        <p>您加入家庭后，昵称、头像、家庭角色，以及家庭内的菜谱、冰箱、预约、采购、评价和相关文件会对同一家庭成员可见。预约会保存用餐成员及当时的偏好提醒快照。家庭数据默认不会向其他家庭公开。</p>

        <h2 style="font-size:16px;margin-top:20px;">四、对外共享</h2>
        
        <p>我们不会将您的个人信息出售、出租或以其他方式提供给任何第三方，但以下情况除外：</p>
        <ul style="padding-left:20px;">
          <li>获得您的明确授权</li>
          <li>法律法规要求</li>
          <li>保护其他用户或公众的安全</li>
        </ul>
        
        <h2 style="font-size:16px;margin-top:20px;">五、信息存储与安全</h2>
        
        <p>登录令牌采用哈希保存并支持过期和撤销。家庭文件按家庭隔离存储，通过短期访问地址读取。我们会采取合理措施防止信息泄露、损毁或丢失。</p>
        
        <h2 style="font-size:16px;margin-top:20px;">六、您的权利与账号注销</h2>
        
        <p>您有权：</p>
        <ul style="padding-left:20px;">
          <li>查询、更正您的个人信息</li>
          <li>在“设置 - 数据导出与账号注销”中导出个人数据</li>
          <li>注销账号；家庭主需先转让家庭主身份或解散家庭</li>
          <li>撤回您的授权同意</li>
        </ul>
        <p>注销后会撤销全部登录会话、清除个人资料与口味标签并退出家庭。为保证家庭历史完整，已经产生的家庭记录会保留，但账号身份会匿名化。</p>
        
        <h2 style="font-size:16px;margin-top:20px;">七、隐私政策的更新</h2>
        
        <p>我们可能会不时更新本隐私政策。当政策发生重大变更时，我们会通过小程序内通知的方式向您发出提醒。</p>
        
        <p style="margin-top:30px;color:#999;">最后更新时间：2026年8月17日</p>
      </div>
    `;
  } catch (error) {
    console.error('读取隐私政策失败:', error);
    return '<p>隐私政策加载失败，请重试</p>';
  }
}

/**
 * 检查用户是否已经接受隐私政策
 */
export function hasUserAcceptedPrivacy(): boolean {
  return !!wx.getStorageSync('privacyAccepted');
}

/**
 * 获取用户隐私政策接受时间
 */
export function getPrivacyAcceptedTime(): number {
  return wx.getStorageSync('privacyAcceptedTime') || 0;
}

/**
 * 请求用户隐私授权
 * @param callback 授权后的回调函数
 */
export function requestPrivacyAuthorization(callback?: (accepted: boolean) => void): void {
  const accepted = hasUserAcceptedPrivacy();
  
  if (accepted) {
    callback && callback(true);
    return;
  }
  
  // 引导用户到隐私政策页面
  wx.navigateTo({
    url: '/pages/privacy/privacy',
    success: () => {
      console.log('成功跳转到隐私政策页面');
    },
    fail: (err) => {
      console.error('跳转到隐私政策页面失败:', err);
      callback && callback(false);
    }
  });
}
