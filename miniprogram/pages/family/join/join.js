const parseInvitationToken = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = raw.match(/(?:^|[?&#])(?:token|scene)=([^&#]+)/i);
  const candidate = match ? match[1] : raw;
  if (!match && /[/?#=&]/.test(candidate)) return '';

  try {
    return decodeURIComponent(candidate).trim();
  } catch (error) {
    return candidate.trim();
  }
};

Page({
  data: {
    invitationCode: '',
    scanning: false
  },

  onCodeInput(event) {
    this.setData({ invitationCode: String(event.detail.value || '').trim() });
  },

  openPreview(token) {
    if (!token) {
      wx.showToast({ title: '未识别到有效邀请码', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/family/invite/invite?token=${encodeURIComponent(token)}`
    });
  },

  submitCode() {
    this.openPreview(parseInvitationToken(this.data.invitationCode));
  },

  pasteCode() {
    wx.getClipboardData({
      success: (result) => {
        const token = parseInvitationToken(result.data);
        if (!token) {
          wx.showToast({ title: '剪贴板中没有有效邀请码', icon: 'none' });
          return;
        }
        this.setData({ invitationCode: token });
        wx.showToast({ title: '邀请码已粘贴', icon: 'success', duration: 1200 });
      },
      fail: () => wx.showToast({ title: '无法读取剪贴板', icon: 'none' })
    });
  },

  scanInvite() {
    if (this.data.scanning) return;
    this.setData({ scanning: true });
    wx.scanCode({
      onlyFromCamera: false,
      success: (result) => {
        const token = parseInvitationToken(result.path) || parseInvitationToken(result.result);
        this.openPreview(token);
      },
      fail: (error) => {
        if (!error || !String(error.errMsg || '').toLowerCase().includes('cancel')) {
          wx.showToast({ title: '未识别到家庭邀请', icon: 'none' });
        }
      },
      complete: () => this.setData({ scanning: false })
    });
  }
});
