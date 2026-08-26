import type { Env } from '../core/types';

export type AppointmentNotificationEvent = 'created' | 'confirmed' | 'cancelled' | 'reminder';

interface AppointmentNotificationDetails {
  date: string;
  mealType: string;
  status: string;
  creatorName: string | null;
  dishNames: string | null;
}

interface WechatMessageData {
  [key: string]: { value: string };
}

const DEFAULT_TEMPLATE_IDS: Record<AppointmentNotificationEvent, string> = {
  created: 'T1TUgP2VEEzz_3lAAypK1sP4AyJ_YIpSsX_hy1tU2is',
  confirmed: '7-mOlcEKprjQzibpS0P8q9Buyz4zA0cgm4W3DcWZVqM',
  cancelled: '7-mOlcEKprjQzibpS0P8q9Buyz4zA0cgm4W3DcWZVqM',
  reminder: '_EAlByNCdkJmmWr-UjT8sSaY5mmbTPcdqmSIAYO3bPQ',
};

async function accessToken(env: Env): Promise<string> {
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WX_APPID}&secret=${env.WX_SECRET}`);
  const result = await response.json<{ access_token?: string; errmsg?: string }>();
  if (!result.access_token) throw new Error(result.errmsg || 'Wechat access token unavailable');
  return result.access_token;
}

function template(env: Env, event: AppointmentNotificationEvent): string {
  const key = event === 'created' ? env.TMPL_NEW_APPT
    : event === 'confirmed' ? env.TMPL_CONFIRMED
      : event === 'cancelled' ? env.TMPL_CANCELLED
        : env.TMPL_REMINDER;
  return key || DEFAULT_TEMPLATE_IDS[event];
}

function limitedText(value: unknown, fallback: string, maxLength = 20): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return Array.from(text || fallback).slice(0, maxLength).join('');
}

function mealTime(date: string, mealType: string): string {
  const slot = mealType.includes('早') ? '08:00'
    : mealType.includes('午') ? '12:00'
      : mealType.includes('晚') ? '18:00'
        : mealType.includes('夜') ? '21:00' : '12:00';
  return `${date.slice(0, 10)} ${slot}`;
}

export function buildAppointmentNotificationData(
  event: AppointmentNotificationEvent,
  appointment: AppointmentNotificationDetails,
): WechatMessageData {
  const date = limitedText(appointment.date, '日期待定', 10);
  const mealType = limitedText(appointment.mealType, '用餐', 20);
  const dishes = limitedText(appointment.dishNames, '未指定菜品', 20);

  if (event === 'created') {
    return {
      time9: { value: mealTime(date, mealType) },
      thing7: { value: limitedText(appointment.creatorName, '家庭成员', 20) },
      thing3: { value: dishes },
      phrase4: { value: '待确认' },
      thing5: { value: '家庭有新的用餐预约，请及时处理' },
    };
  }
  if (event === 'reminder') {
    return {
      date4: { value: date },
      thing8: { value: mealType },
      thing18: { value: dishes },
      thing6: { value: '今天有家庭用餐安排，请按时用餐' },
    };
  }
  const confirmed = event === 'confirmed';
  return {
    date3: { value: date },
    thing28: { value: mealType },
    phrase14: { value: confirmed ? '已确认' : '已取消' },
    thing8: { value: confirmed ? '菜品已安排，请按时用餐' : '家庭预约已取消，请查看详情' },
  };
}

function messagePage(event: AppointmentNotificationEvent): string {
  return event === 'created'
    ? 'pages/profile/admin/appointments/appointments'
    : 'pages/appointment/appointment';
}

async function activeAppointmentUser(
  env: Env,
  familyId: string,
  appointmentId: string,
): Promise<string[]> {
  const result = await env.DB.prepare(`
    SELECT DISTINCT u.openid
    FROM appointments a
    JOIN users u ON u.id = a.userId
    JOIN family_members fm ON fm.userId = u.id AND fm.familyId = a.familyId
    WHERE a.id = ? AND a.familyId = ? AND fm.status = 'active'
      AND COALESCE(u.status, 'active') = 'active'
      AND u.openid IS NOT NULL AND u.openid != ''
  `).bind(appointmentId, familyId).all<{ openid: string }>();
  return result.results.map(row => row.openid);
}

async function recipients(
  env: Env,
  familyId: string,
  appointmentId: string,
  event: AppointmentNotificationEvent,
): Promise<string[]> {
  if (event === 'created') {
    const result = await env.DB.prepare(`
      SELECT DISTINCT u.openid
      FROM family_members fm JOIN users u ON u.id = fm.userId
      WHERE fm.familyId = ? AND fm.status = 'active'
        AND fm.role IN ('owner', 'admin', 'chef')
        AND COALESCE(u.status, 'active') = 'active'
        AND u.openid IS NOT NULL AND u.openid != ''
    `).bind(familyId).all<{ openid: string }>();
    return result.results.map(row => row.openid);
  }
  if (event !== 'reminder') return activeAppointmentUser(env, familyId, appointmentId);

  const result = await env.DB.prepare(`
    SELECT DISTINCT u.openid
    FROM appointment_diners ad
    JOIN appointments a ON a.id = ad.appointmentId
    JOIN users u ON u.id = ad.userId
    JOIN family_members fm ON fm.userId = u.id AND fm.familyId = a.familyId
    WHERE ad.appointmentId = ? AND a.familyId = ? AND fm.status = 'active'
      AND COALESCE(u.status, 'active') = 'active'
      AND u.openid IS NOT NULL AND u.openid != ''
  `).bind(appointmentId, familyId).all<{ openid: string }>();
  if (result.results.length) return result.results.map(row => row.openid);
  return activeAppointmentUser(env, familyId, appointmentId);
}

async function send(
  token: string,
  openid: string,
  templateId: string,
  page: string,
  data: WechatMessageData,
): Promise<{ ok: boolean; errcode: number; errmsg: string }> {
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: openid,
      template_id: templateId,
      page,
      data,
    }),
  });
  const result = await response.json<{ errcode?: number; errmsg?: string }>();
  const errcode = result.errcode ?? (response.ok ? -1 : response.status);
  return { ok: response.ok && errcode === 0, errcode, errmsg: result.errmsg || '' };
}

export async function notifyFamilyAppointment(
  env: Env,
  familyId: string,
  appointmentId: string,
  event: AppointmentNotificationEvent,
): Promise<void> {
  try {
    const appointment = await env.DB.prepare(`
      SELECT a.date, a.mealType, a.status, u.nickName AS creatorName,
        (SELECT group_concat(d.name, '、')
         FROM appointment_dishes ad JOIN dishes d ON d.id = ad.dishId
         WHERE ad.appointmentId = a.id AND d.familyId = a.familyId) AS dishNames
      FROM appointments a JOIN users u ON u.id = a.userId
      WHERE a.id = ? AND a.familyId = ?
    `).bind(appointmentId, familyId).first<AppointmentNotificationDetails>();
    if (!appointment) return;
    const openids = await recipients(env, familyId, appointmentId, event);
    if (!openids.length) return;
    const token = await accessToken(env);
    const data = buildAppointmentNotificationData(event, appointment);
    const templateId = template(env, event);
    const page = messagePage(event);
    const results = await Promise.all(openids.map(async openid => {
      try {
        return await send(token, openid, templateId, page, data);
      } catch (error) {
        console.error(JSON.stringify({
          message: 'notification.recipient_failed', familyId, appointmentId, event,
          error: error instanceof Error ? error.message : String(error),
        }));
        return { ok: false, errcode: -1, errmsg: error instanceof Error ? error.message : String(error) };
      }
    }));
    const failures = results.filter(result => !result.ok);
    console.log(JSON.stringify({
      message: 'notification.family_appointment', familyId, appointmentId, event,
      recipients: openids.length, sent: results.length - failures.length,
      failures: failures.map(({ errcode, errmsg }) => ({ errcode, errmsg })),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      message: 'notification.family_appointment_failed', familyId, appointmentId, event,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

export async function sendFamilyDailyReminders(env: Env): Promise<void> {
  const timezoneRows = await env.DB.prepare(`
    SELECT DISTINCT timezone FROM families WHERE status = 'active'
  `).all<{ timezone: string }>();
  const fallbackTimezone = env.DEFAULT_TIMEZONE || 'Asia/Shanghai';
  const statements: D1PreparedStatement[] = [];
  for (const row of timezoneRows.results) {
    let timezone = row.timezone || fallbackTimezone;
    let today: string;
    try {
      today = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
    } catch {
      timezone = fallbackTimezone;
      today = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
    }
    statements.push(env.DB.prepare(`
      SELECT a.id, a.familyId FROM appointments a
      JOIN families f ON f.id = a.familyId
      WHERE a.date = ? AND a.status IN ('已确认', 'confirmed')
        AND f.status = 'active' AND f.timezone = ?
    `).bind(today, row.timezone));
  }
  if (!statements.length) return;
  const results = await env.DB.batch(statements);
  const appointments = results.flatMap(result => result.results as Array<{ id: string; familyId: string }>);
  for (const appointment of appointments) {
    await notifyFamilyAppointment(env, appointment.familyId, appointment.id, 'reminder');
  }
}
