import { requireCapability, requireFamilyContext } from '../core/auth';
import { json } from '../core/http';
import type { Env } from '../core/types';

function localDateBoundary(value: string, timezone: string, nextDay = false): number {
  const [year, month, day] = value.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day + (nextDay ? 1 : 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const field = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(part => part.type === type)?.value || 0);
  const representedAsUtc = Date.UTC(
    field('year'), field('month') - 1, field('day'),
    field('hour'), field('minute'), field('second'),
  );
  return guess - (representedAsUtc - guess);
}

export async function handleStatisticsV2(request: Request, env: Env): Promise<Response> {
  const context = await requireFamilyContext(request, env);
  requireCapability(context, 'family.manage');
  const url = new URL(request.url);
  const requestedStartDate = url.searchParams.get('startDate') || '';
  const requestedEndDate = url.searchParams.get('endDate') || '';
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedStartDate) ? requestedStartDate : '';
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedEndDate) ? requestedEndDate : '';
  const appointmentConditions = ['familyId = ?'];
  const appointmentBindings: unknown[] = [context.familyId];
  if (startDate) { appointmentConditions.push('date >= ?'); appointmentBindings.push(startDate); }
  if (endDate) { appointmentConditions.push('date <= ?'); appointmentBindings.push(endDate); }
  const appointmentWhere = appointmentConditions.join(' AND ');
  const reviewConditions = ['familyId = ?'];
  const reviewBindings: unknown[] = [context.familyId];
  if (startDate) { reviewConditions.push('createTime >= ?'); reviewBindings.push(localDateBoundary(startDate, context.timezone)); }
  if (endDate) { reviewConditions.push('createTime < ?'); reviewBindings.push(localDateBoundary(endDate, context.timezone, true)); }
  const [appointments, status, dishes, reviews, inventory] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM appointments WHERE ${appointmentWhere}`).bind(...appointmentBindings),
    env.DB.prepare(`SELECT status, COUNT(*) AS count FROM appointments WHERE ${appointmentWhere} GROUP BY status`).bind(...appointmentBindings),
    env.DB.prepare(`
      SELECT d.id, d.name, COUNT(*) AS count FROM appointment_dishes ad
      JOIN appointments a ON a.id = ad.appointmentId
      JOIN dishes d ON d.id = ad.dishId AND d.familyId = a.familyId
      WHERE ${appointmentWhere.replaceAll('familyId', 'a.familyId').replaceAll('date', 'a.date')}
      GROUP BY d.id, d.name ORDER BY count DESC LIMIT 5
    `).bind(...appointmentBindings),
    env.DB.prepare(`SELECT COUNT(*) AS total, AVG(rating) AS averageRating FROM reviews WHERE ${reviewConditions.join(' AND ')}`)
      .bind(...reviewBindings),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM inventory_items WHERE familyId = ? AND status NOT IN ('已用完', 'discarded')`).bind(context.familyId),
  ]);
  return json({
    appointments: { total: Number((appointments.results[0] as { total?: unknown } | undefined)?.total || 0), byStatus: status.results },
    popularDishes: dishes.results,
    reviews: {
      total: Number((reviews.results[0] as { total?: unknown } | undefined)?.total || 0),
      averageRating: Number((reviews.results[0] as { averageRating?: unknown } | undefined)?.averageRating || 0),
    },
    inventory: { total: Number((inventory.results[0] as { total?: unknown } | undefined)?.total || 0) },
  });
}
