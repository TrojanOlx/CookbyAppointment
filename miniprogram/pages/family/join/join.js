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

let pasteRequestId = 0;
let scanRequestId = 0;

Page({
  data: {
    invitationCode: '',
    scanning: false,
    submitting: false
  },

  onCodeInput(event) {
    pasteRequestId += 1;
    this.setData({ invitationCode: String(event.detail.value || '').trim() });
  },

  openPreview(token) {
    if (!token) {
      wx.showToast({ title: '未识别到有效邀请码', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    const requestId = ++pasteRequestId;
    this.setData({ submitting: true });
    wx.navigateTo({
      url: `/pages/family/invite/invite?token=${encodeURIComponent(token)}`,
      complete: () => {
        if (requestId === pasteRequestId) this.setData({ submitting: false });
      }
    });
  },

  submitCode() {
    this.openPreview(parseInvitationToken(this.data.invitationCode));
  },

  pasteCode() {
    const requestId = ++pasteRequestId;
    wx.getClipboardData({
      success: (result) => {
        if (requestId !== pasteRequestId) return;
        const token = parseInvitationToken(result.data);
        if (!token) {
          wx.showToast({ title: '剪贴板中没有有效邀请码', icon: 'none' });
          return;
        }
        this.setData({ invitationCode: token });
        wx.showToast({ title: '邀请码已粘贴', icon: 'success', duration: 1200 });
      },
      fail: () => {
        if (requestId === pasteRequestId) wx.showToast({ title: '无法读取剪贴板', icon: 'none' });
      }
    });
  },

  scanInvite() {
    if (this.data.scanning) return;
    pasteRequestId += 1;
    const requestId = ++scanRequestId;
    this.setData({ scanning: true });
    wx.scanCode({
      onlyFromCamera: false,
      success: (result) => {
        if (requestId !== scanRequestId) return;
        const token = parseInvitationToken(result.path) || parseInvitationToken(result.result);
        this.openPreview(token);
      },
      fail: (error) => {
        if (requestId !== scanRequestId) return;
        if (!error || !String(error.errMsg || '').toLowerCase().includes('cancel')) {
          wx.showToast({ title: '未识别到家庭邀请', icon: 'none' });
        }
      },
      complete: () => {
        if (requestId === scanRequestId) this.setData({ scanning: false });
      }
    });
  },

  onUnload() {
    pasteRequestId += 1;
    scanRequestId += 1;
  }
});
