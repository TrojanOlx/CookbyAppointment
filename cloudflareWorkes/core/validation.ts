import { ApiError } from './http';

const MEANINGFUL_NAME = /\p{L}/u;
const PLACEHOLDER_NICKNAMES = new Set(['微信用户', '微信昵称', '用户']);

function hasForbiddenText(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.codePointAt(0) || 0;
    return code <= 0x1f
      || (code >= 0x7f && code <= 0x9f)
      || (code >= 0x200b && code <= 0x200f)
      || (code >= 0x202a && code <= 0x202e)
      || code === 0x2060
      || (code >= 0x2066 && code <= 0x2069)
      || code === 0xfeff;
  });
}

export interface TextRules {
  required?: boolean;
  meaningfulName?: boolean;
  allowNewlines?: boolean;
}

function validationError(field: string, message: string, details: Record<string, unknown> = {}): never {
  throw new ApiError(400, 'VALIDATION_ERROR', message, { field, ...details });
}

export function strictText(
  value: unknown,
  field: string,
  max: number,
  rules: TextRules = {},
): string {
  if (value === undefined || value === null || value === '') {
    if (rules.required) validationError(field, `${field}不能为空`, { min: 1, max });
    return '';
  }
  if (typeof value !== 'string') validationError(field, `${field}格式不正确`, { max });
  const normalized = value.trim().replace(/\r\n?/g, '\n');
  if (!normalized && rules.required) validationError(field, `${field}不能为空`, { min: 1, max });
  if (normalized.length > max) validationError(field, `${field}长度不能超过${max}`, { max });
  if (hasForbiddenText(normalized) || (!rules.allowNewlines && normalized.includes('\n'))) {
    validationError(field, `${field}包含不可用字符`, { reason: 'forbidden_characters' });
  }
  if (rules.meaningfulName && normalized && !MEANINGFUL_NAME.test(normalized)) {
    validationError(field, `${field}至少需要包含一个汉字或字母`, { reason: 'name_required' });
  }
  return normalized;
}

export function strictNickname(value: unknown): string {
  const nickname = strictText(value, '昵称', 20, { required: true });
  if (PLACEHOLDER_NICKNAMES.has(nickname)) {
    validationError('昵称', '请设置一个自己的昵称', { reason: 'placeholder' });
  }
  return nickname;
}

export function profileCompleteness(user: { nickName?: unknown; avatarUrl?: unknown }): {
  profileComplete: boolean;
  missingProfileFields: Array<'nickName' | 'avatarUrl'>;
} {
  const nickname = typeof user.nickName === 'string' ? user.nickName.trim() : '';
  const avatar = typeof user.avatarUrl === 'string' ? user.avatarUrl.trim() : '';
  const missingProfileFields: Array<'nickName' | 'avatarUrl'> = [];
  if (!nickname || PLACEHOLDER_NICKNAMES.has(nickname)) missingProfileFields.push('nickName');
  if (!avatar || avatar.startsWith('/images/')) missingProfileFields.push('avatarUrl');
  return { profileComplete: missingProfileFields.length === 0, missingProfileFields };
}

export function strictQuantity(value: unknown, field = '数量'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    validationError(field, `${field}必须大于0且不超过1000000`, { min: 0, max: 1_000_000 });
  }
  const scaled = value * 1000;
  if (Math.abs(scaled - Math.round(scaled)) > Number.EPSILON * Math.max(1, Math.abs(scaled))) {
    validationError(field, `${field}最多保留3位小数`, { maxDecimals: 3 });
  }
  return value;
}

export function strictAmountText(value: unknown, field = '数量/重量'): string {
  const amount = strictText(value, field, 20, { required: true });
  if (/(^|[^\d])-\d/.test(amount)) {
    validationError(field, `${field}中的数字必须大于0`, { min: 0 });
  }
  const numbers = amount.match(/\d+(?:\.\d+)?/g) || [];
  for (const text of numbers) {
    const parts = text.split('.');
    if ((parts[1]?.length || 0) > 3) validationError(field, `${field}最多保留3位小数`, { maxDecimals: 3 });
    if (Number(text) <= 0) validationError(field, `${field}中的数字必须大于0`, { min: 0 });
    if (Number(text) > 1_000_000) validationError(field, `${field}不能超过1000000`, { max: 1_000_000 });
  }
  return amount;
}

export function strictHttpUrl(value: unknown, field = '参考链接', max = 300): string {
  const text = strictText(value, field, max);
  if (!text) return '';
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
  } catch {
    validationError(field, `${field}必须是有效的 HTTP(S) 地址`, { reason: 'invalid_url' });
  }
  return text;
}

export function strictTimezone(value: unknown, fallback = 'Asia/Shanghai'): string {
  const timezone = strictText(value || fallback, '时区', 64, { required: true });
  try {
    new Intl.DateTimeFormat('zh-CN', { timeZone: timezone }).format(new Date());
  } catch {
    validationError('时区', '请输入有效的 IANA 时区，例如 Asia/Shanghai', { reason: 'invalid_timezone' });
  }
  return timezone;
}

export function strictTextArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
  rules: TextRules = {},
): string[] {
  if (!Array.isArray(value)) validationError(field, `${field}必须是数组`, { maxItems });
  if (value.length > maxItems) validationError(field, `${field}最多${maxItems}项`, { maxItems });
  return value.map(item => strictText(item, field, maxLength, { ...rules, required: true }));
}

export function validateSearchText(value: string | null, field = '搜索内容'): string {
  return strictText(value || '', field, 80);
}
