// logs.ts
// const util = require('../../utils/util.js')
import { formatTime } from '../../utils/util'

Component({
  data: {
    logs: [],
    safeAreaBottom: 0
  },
  lifetimes: {
    attached() {
      this.setData({
        logs: (wx.getStorageSync('logs') || []).map((log: string) => {
          return {
            date: formatTime(new Date(log)),
            timeStamp: log
          }
        }),
      });
      this.setSafeArea();
    }
  },
  methods: {
    // 设置安全区域
    setSafeArea() {
      const app = getApp<IAppOption>();
      const systemInfo = (app.globalData as any).systemInfo;
      if (systemInfo) {
        // 如果已有系统信息
        this.processSafeArea(systemInfo);
      } else {
        // 重新获取系统信息
        wx.getSystemInfo({
          success: (res) => {
            this.processSafeArea(res);
          }
        });
      }
    },

    // 处理安全区域数据
    processSafeArea(systemInfo: WechatMiniprogram.SystemInfo) {
      const safeAreaBottom = systemInfo.safeArea ? 
        (systemInfo.screenHeight - systemInfo.safeArea.bottom) : 0;
      
      this.setData({
        safeAreaBottom
      });
    }
  }
})
