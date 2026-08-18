const { BASE_URL } = require('./http');

const INVITE_CODE_PREFIX = 'family-invite-';
const INVITE_CODE_MAX_AGE = 60 * 60 * 1000;

const getFamilyId = () => {
  const value = wx.getStorageSync('active_family_id');
  if (value && typeof value === 'object') {
    return String(value.id || value.familyId || value.family_id || '');
  }
  return value ? String(value) : '';
};

const getAppVersion = () => {
  try {
    return wx.getAccountInfoSync().miniProgram.version || '2.1.0-dev';
  } catch (error) {
    return '2.1.0-dev';
  }
};

const decodeJsonBuffer = (buffer) => {
  if (!(buffer instanceof ArrayBuffer)) return null;
  const bytes = new Uint8Array(buffer).slice(0, 4096);
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 1) {
    encoded += `%${bytes[index].toString(16).padStart(2, '0')}`;
  }
  try {
    return JSON.parse(decodeURIComponent(encoded));
  } catch (error) {
    return null;
  }
};

const cleanupStaleInviteCodes = () => {
  const fileSystem = wx.getFileSystemManager();
  try {
    const files = fileSystem.readdirSync(wx.env.USER_DATA_PATH);
    const now = Date.now();
    files.forEach((name) => {
      const match = String(name).match(/^family-invite-(\d+)(?:-[^.]+)?\.(?:jpg|png)$/);
      if (!match || now - Number(match[1]) <= INVITE_CODE_MAX_AGE) return;
      fileSystem.unlink({
        filePath: `${wx.env.USER_DATA_PATH}/${name}`,
        fail: () => {}
      });
    });
  } catch (error) {
    // 首次使用或目录不可读时，当前小程序码仍可正常写入。
  }
};

const writeInviteCode = (data, contentType) => new Promise((resolve, reject) => {
  cleanupStaleInviteCodes();
  const extension = String(contentType || '').includes('png') ? 'png' : 'jpg';
  const suffix = Math.random().toString(36).slice(2, 10);
  const filePath = `${wx.env.USER_DATA_PATH}/${INVITE_CODE_PREFIX}${Date.now()}-${suffix}.${extension}`;
  wx.getFileSystemManager().writeFile({
    filePath,
    data,
    success: () => resolve(filePath),
    fail: () => reject(new Error('小程序码保存失败，请稍后重试'))
  });
});

const removeLocalInviteCode = (filePath) => {
  if (!filePath || !String(filePath).startsWith(wx.env.USER_DATA_PATH)) return;
  try {
    wx.getFileSystemManager().unlink({ filePath, fail: () => {} });
  } catch (error) {
    // 临时文件可能已由微信清理，无需打断当前操作。
  }
};

const downloadInviteCode = (token) => new Promise((resolve, reject) => {
  const authToken = wx.getStorageSync('token') || '';
  const familyId = getFamilyId();
  if (!authToken) {
    reject(new Error('请先登录后生成小程序码'));
    return;
  }
  if (!familyId) {
    reject(new Error('请先选择家庭'));
    return;
  }

  wx.request({
    url: `${BASE_URL}/api/family/invite/code?token=${encodeURIComponent(token)}`,
    method: 'GET',
    responseType: 'arraybuffer',
    header: {
      Authorization: `Bearer ${authToken}`,
      'X-Family-Id': familyId,
      'X-App-Version': getAppVersion()
    },
    success: async (response) => {
      const contentType = String(
        (response.header && (response.header['content-type'] || response.header['Content-Type'])) || ''
      ).toLowerCase();
      const decodedData = decodeJsonBuffer(response.data);
      const isJsonResponse = contentType.includes('application/json') || Boolean(decodedData);
      if (response.statusCode < 200 || response.statusCode >= 300 || isJsonResponse) {
        reject(new Error((decodedData && decodedData.message) || '小程序码生成失败，请稍后重试'));
        return;
      }
      if (!(response.data instanceof ArrayBuffer) || response.data.byteLength === 0) {
        reject(new Error('小程序码内容为空，请重新生成'));
        return;
      }
      try {
        resolve(await writeInviteCode(response.data, contentType));
      } catch (error) {
        reject(error);
      }
    },
    fail: () => reject(new Error('小程序码下载失败，请检查网络'))
  });
});

module.exports = {
  downloadInviteCode,
  removeLocalInviteCode
};
