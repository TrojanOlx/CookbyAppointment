import type { Env } from '../core/types';

const DEFAULT_TEMPLATE_ID = 'bNsydRQbXtouRni5xtLXoJ7zB5Xbp26uZ9CN6nzhHB0';

async function accessToken(env: Env): Promise<string> {
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WX_APPID}&secret=${env.WX_SECRET}`);
  const result = await response.json<{ access_token?: string; errmsg?: string }>();
  if (!result.access_token) throw new Error(result.errmsg || 'Wechat access token unavailable');
  return result.access_token;
}

function template(env: Env, event: string): string {
  const key = event === 'created' ? env.TMPL_NEW_APPT
    : event === 'confirmed' ? env.TMPL_CONFIRMED
      : event === 'cancelled' ? env.TMPL_CANCELLED
        : event === 'completed' ? env.TMPL_COMPLETED : env.TMPL_REMINDER;
  return key || env.TMPL_APPOINTMENT || DEFAULT_TEMPLATE_ID;
}

function eventText(event: string): string {
  if (event === 'created') return '家庭有新的用餐预约';
  if (event === 'confirmed') return '家庭预约已确认';
  if (event === 'cancelled') return '家庭预约已取消';
  if (event === 'completed') return '家庭预约已完成';
  return '今天有家庭用餐预约';
}

async function recipients(env: Env, familyId: string, appointmentId: string): Promise<string[]> {
  const result = await env.DB.prepare(`
    SELECT DISTINCT u.openid
    FROM users u
    JOIN family_members fm ON fm.userId = u.id
    WHERE fm.familyId = ? AND fm.status = 'active' AND u.openid IS NOT NULL AND u.openid != ''
      AND (
        fm.role IN ('owner', 'admin', 'chef')
        OR EXISTS (
          SELECT 1 FROM appointment_diners ad WHERE ad.appointmentId = ? AND ad.userId = u.id
        )
      )
  `).bind(familyId, appointmentId).all<{ openid: string }>();
  return result.results.map(row => row.openid);
}

async function send(env: Env, token: string, openid: string, templateId: string, date: string, content: string): Promise<boolean> {
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: openid,
      template_id: templateId,
      page: 'pages/appointment/appointment',
      data: {
        time12: { value: date.slice(0, 20) },
        thing9: { value: content.slice(0, 20) },
      },
    }),
  });
  const result = await response.json<{ errcode?: number }>();
  return result.errcode === 0;
}

export async function notifyFamilyAppointment(env: Env, familyId: string, appointmentId: string, event: string): Promise<void> {
  try {
    const appointment = await env.DB.prepare('SELECT date, mealType FROM appointments WHERE id = ? AND familyId = ?')
      .bind(appointmentId, familyId).first<{ date: string; mealType: string }>();
    if (!appointment) return;
    const openids = await recipients(env, familyId, appointmentId);
    if (!openids.length) return;
    const token = await accessToken(env);
    const results = await Promise.all(openids.map(async openid => {
      try {
        return await send(env, token, openid, template(env, event), `${appointment.date} ${appointment.mealType}`, eventText(event));
      } catch (error) {
        console.error(JSON.stringify({
          message: 'notification.recipient_failed', familyId, appointmentId, event,
          error: error instanceof Error ? error.message : String(error),
        }));
        return false;
      }
    }));
    console.log(JSON.stringify({ message: 'notification.family_appointment', familyId, appointmentId, event, recipients: openids.length, sent: results.filter(Boolean).length }));
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
