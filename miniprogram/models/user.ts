// 用户相关数据模型

// 用户信息接口
export interface User {
  id: string;           // 用户ID，数据库主键
  openid: string;       // 微信openid
  nickName: string;     // 用户昵称
  avatarUrl: string;    // 头像URL
  gender: number;       // 性别，0:未知，1:男，2:女
  country: string;      // 国家
  province: string;     // 省份
  city: string;         // 城市
  language: string;     // 语言
  phoneNumber: string;  // 手机号码
  isAdmin: boolean;     // 是否为管理员
  createTime: number;   // 创建时间
  updateTime: number;   // 更新时间
}

// 登录信息接口
export interface LoginInfo {
  id: string;           // ID，数据库主键
  openid: string;       // 微信openid
  session_key: string;  // 会话密钥
  unionid?: string;     // 用户在开放平台的唯一标识符
  token?: string;       // 自定义登录态token
  createTime: number;   // 创建时间
  expireTime: number;   // 过期时间
}

// 用户手机号信息
export interface UserPhone {
  id: string;           // ID，数据库主键
  userId: string;       // 关联的用户ID
  openid: string;       // 微信openid
  phoneNumber: string;  // 手机号（带区号）
  purePhoneNumber: string; // 不带区号的手机号
  countryCode: string;  // 区号
  createTime: number;   // 创建时间
} 