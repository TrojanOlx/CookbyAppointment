// 格式化日期，如 2021-10-10
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  return [year, month, day].map(formatNumber).join('-');
}

// 格式化时间，如 12:30:00
export const formatTime = (date: Date): string => {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();

  return [hour, minute, second].map(formatNumber).join(':');
}

// 格式化数字，如 9 => '09'
const formatNumber = (n: number): string => {
  const s = n.toString();
  return s[1] ? s : '0' + s;
}

// 显示成功提示
export const showSuccess = (title: string): void => {
  wx.showToast({
    title,
    icon: 'success',
    duration: 2000
  });
}

// 显示失败提示
export const showError = (title: string): void => {
  wx.showToast({
    title,
    icon: 'error',
    duration: 2000
  });
}

// 显示普通提示
export const showToast = (title: string): void => {
  wx.showToast({
    title,
    icon: 'none',
    duration: 2000
  });
}

// 显示加载中
export const showLoading = (title: string): void => {
  wx.showLoading({
    title,
    mask: true
  });
}

// 隐藏加载中
export const hideLoading = (): void => {
  wx.hideLoading();
}

// 显示确认对话框
export const showConfirm = (title: string, content: string): Promise<boolean> => {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (res) => {
        if (res.confirm) {
          resolve(true);
        } else {
          resolve(false);
        }
      },
      fail: () => {
        resolve(false);
      }
    });
  });
}

// 检查日期是否过期（是否在当前日期之前）
export const isDateExpired = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // 设置为今天的00:00:00
  return date < today;
}

// 计算日期差（单位：天）
export const dateDiff = (date1Str: string, date2Str: string): number => {
  const date1 = new Date(date1Str);
  const date2 = new Date(date2Str);
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// 获取当前日期字符串 YYYY-MM-DD
export const getCurrentDate = (): string => {
  return formatDate(new Date());
}

// 根据年月获取当月天数
export const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
}

// 判断对象是否为空
export const isEmpty = (obj: object): boolean => {
  return Object.keys(obj).length === 0;
}
