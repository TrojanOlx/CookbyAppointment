-- Baseline for fresh staging databases. Every statement is safe against an
-- existing legacy production schema because tables are created only if absent.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  openid TEXT NOT NULL UNIQUE,
  nickName TEXT,
  avatarUrl TEXT,
  gender INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT '',
  province TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'zh_CN',
  phoneNumber TEXT,
  isAdmin INTEGER NOT NULL DEFAULT 0,
  createTime INTEGER NOT NULL,
  updateTime INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_info (
  id TEXT PRIMARY KEY,
  openid TEXT NOT NULL,
  session_key TEXT,
  unionid TEXT,
  token TEXT,
  createTime INTEGER NOT NULL,
  expireTime INTEGER
);

CREATE TABLE IF NOT EXISTS user_phones (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  openid TEXT NOT NULL,
  phoneNumber TEXT,
  purePhoneNumber TEXT,
  countryCode TEXT,
  createTime INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dishes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  spicy TEXT NOT NULL DEFAULT '不辣',
  images TEXT,
  steps TEXT,
  notice TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  creatorId TEXT,
  creatorOpenid TEXT,
  createTime INTEGER NOT NULL,
  updateTime INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  dishId TEXT NOT NULL,
  name TEXT NOT NULL,
  amount TEXT,
  createTime INTEGER NOT NULL,
  updateTime INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  openid TEXT,
  date TEXT NOT NULL,
  mealType TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '待确认',
  remarks TEXT NOT NULL DEFAULT '',
  createTime INTEGER NOT NULL,
  updateTime INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS appointment_dishes (
  id TEXT PRIMARY KEY,
  appointmentId TEXT NOT NULL,
  dishId TEXT NOT NULL,
  createTime INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  appointmentId TEXT NOT NULL,
  userId TEXT NOT NULL,
  openid TEXT,
  dishId TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5,
  content TEXT NOT NULL DEFAULT '',
  images TEXT,
  createTime INTEGER NOT NULL,
  updateTime INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  openid TEXT,
  name TEXT NOT NULL,
  amount TEXT,
  category TEXT NOT NULL DEFAULT '其他',
  status TEXT NOT NULL DEFAULT '正常',
  putInDate TEXT,
  expiryDate TEXT,
  image TEXT,
  remarks TEXT NOT NULL DEFAULT '',
  createTime INTEGER NOT NULL,
  updateTime INTEGER NOT NULL
);
