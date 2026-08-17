export type FamilyRole = 'owner' | 'admin' | 'chef' | 'member';

export type Capability =
  | 'family.read'
  | 'family.manage'
  | 'family.invite'
  | 'family.inviteAdmin'
  | 'dish.manage'
  | 'appointment.manage'
  | 'inventory.write'
  | 'inventory.delete'
  | 'shopping.write'
  | 'review.write'
  | 'file.write';

export interface Env {
  DB: D1Database;
  FILE_BUCKET: R2Bucket;
  WX_APPID: string;
  WX_SECRET: string;
  R2_PUBLIC_URL?: string;
  FAMILY_MODE?: string;
  DEFAULT_TIMEZONE?: string;
  FAMILY_MEMBER_LIMIT?: string;
  INVITE_TTL_HOURS?: string;
  MAX_UPLOAD_BYTES?: string;
  FAMILY_STORAGE_QUOTA_BYTES?: string;
  FILE_SIGNING_SECRET?: string;
  MINIPROGRAM_VERSION?: string;
  MINIPROGRAM_MIN_VERSION?: string;
  MINIPROGRAM_UPDATE_MESSAGE?: string;
  TMPL_APPOINTMENT?: string;
  TMPL_NEW_APPT?: string;
  TMPL_CONFIRMED?: string;
  TMPL_CANCELLED?: string;
  TMPL_COMPLETED?: string;
  TMPL_REMINDER?: string;
}

export interface UserRow {
  id: string;
  openid: string;
  nickName: string | null;
  avatarUrl: string | null;
  phoneNumber: string | null;
}

export interface AuthContext {
  sessionId: string;
  user: UserRow;
}

export interface FamilyContext extends AuthContext {
  familyId: string;
  role: FamilyRole;
  familyName: string;
  timezone: string;
}
