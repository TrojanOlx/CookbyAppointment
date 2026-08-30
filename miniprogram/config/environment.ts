export type MiniProgramEnvironment = 'develop' | 'trial' | 'release';

export const STAGING_API_BASE_URL = 'https://homemenu-staging.yunma.oulongxing.com';
export const PRODUCTION_API_BASE_URL = 'https://homemenu.yunma.oulongxing.com';

const readMiniProgramEnvironment = (): MiniProgramEnvironment => {
  const value = wx.getAccountInfoSync().miniProgram.envVersion;
  return value === 'develop' || value === 'trial' || value === 'release'
    ? value
    : 'release';
};

export const MINI_PROGRAM_ENVIRONMENT = readMiniProgramEnvironment();
export const API_BASE_URL = MINI_PROGRAM_ENVIRONMENT === 'release'
  ? PRODUCTION_API_BASE_URL
  : STAGING_API_BASE_URL;
