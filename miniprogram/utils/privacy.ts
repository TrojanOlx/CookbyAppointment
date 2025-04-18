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
        
        <p>1. <strong>基本信息</strong>：在您使用我们的小程序时，我们可能会收集您的微信昵称、头像等公开信息，以便为您提供个性化的用户体验。</p>
        
        <p>2. <strong>使用信息</strong>：我们会收集您在使用过程中产生的数据，包括但不限于：</p>
        <ul style="padding-left:20px;">
          <li>菜品预约记录</li>
          <li>浏览历史</li>
          <li>菜品偏好设置</li>
          <li>设备信息</li>
        </ul>
        
        <h2 style="font-size:16px;margin-top:20px;">二、我们如何使用这些信息</h2>
        
        <p>1. <strong>提供服务</strong>：基于您的预约记录和偏好设置，为您提供家庭菜单预约服务。</p>
        
        <p>2. <strong>改进服务</strong>：分析用户行为数据，持续优化我们的服务体验。</p>
        
        <p>3. <strong>通知提醒</strong>：向您发送预约确认、菜品准备完成等相关通知。</p>
        
        <h2 style="font-size:16px;margin-top:20px;">三、信息共享</h2>
        
        <p>我们不会将您的个人信息出售、出租或以其他方式提供给任何第三方，但以下情况除外：</p>
        <ul style="padding-left:20px;">
          <li>获得您的明确授权</li>
          <li>法律法规要求</li>
          <li>保护其他用户或公众的安全</li>
        </ul>
        
        <h2 style="font-size:16px;margin-top:20px;">四、信息存储</h2>
        
        <p>我们会采取合理的技术手段和安全措施来保护您的个人信息安全，防止信息泄露、损毁或丢失。</p>
        
        <h2 style="font-size:16px;margin-top:20px;">五、您的权利</h2>
        
        <p>您有权：</p>
        <ul style="padding-left:20px;">
          <li>查询、更正您的个人信息</li>
          <li>删除您的账号和相关数据</li>
          <li>撤回您的授权同意</li>
        </ul>
        
        <h2 style="font-size:16px;margin-top:20px;">六、隐私政策的更新</h2>
        
        <p>我们可能会不时更新本隐私政策。当政策发生重大变更时，我们会通过小程序内通知的方式向您发出提醒。</p>
        
        <h2 style="font-size:16px;margin-top:20px;">七、联系我们</h2>
        
        <p>如您对本隐私政策有任何疑问或建议，请通过小程序内的"联系我们"功能与我们联系。</p>
        
        <p style="margin-top:30px;color:#999;">最后更新时间：2023年12月1日</p>
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