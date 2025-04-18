// 隐私检查组件
import { hasUserAcceptedPrivacy } from '../../utils/privacy';

Component({
  properties: {},
  
  data: {
    hasAcceptedPrivacy: false
  },
  
  lifetimes: {
    attached() {
      // 检查用户是否已接受隐私政策
      const hasAccepted = hasUserAcceptedPrivacy();
      this.setData({
        hasAcceptedPrivacy: hasAccepted
      });
      
      // 如果未接受隐私政策，跳转到隐私政策页面
      if (!hasAccepted) {
        const currentPage = getCurrentPages()[getCurrentPages().length - 1];
        const route = currentPage.route || '';
        
        // 如果当前不在隐私政策页面，则跳转
        if (route !== 'pages/privacy/privacy') {
          wx.redirectTo({
            url: '/pages/privacy/privacy'
          });
        }
      }
    }
  },
  
  methods: {}
}); 