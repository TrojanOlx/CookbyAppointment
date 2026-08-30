import type { Env } from './types';

export const APPOINTMENT_RECORD_PREFIX = 'appointment:';

export interface MealRecordMaterializationResult {
  id: string;
  created: boolean;
}

export interface MealHistoryExport {
  records: unknown[];
  dishes: unknown[];
  contributions: unknown[];
  files: unknown[];
  achievements: unknown[];
  achievementState: Record<string, unknown> | null;
}

export function normalizeDishName(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[\s·・_-]+/g, '');
}

function completedStatusSql(): string {
  return "a.status IN ('已完成', 'completed')";
}

/**
 * Build INSERT ... SELECT statements that can be placed in the same D1 batch
 * as the appointment's final status UPDATE.  Every ID is deterministic and
 * every statement is conflict-tolerant, so retries do not duplicate history.
 */
export function buildAppointmentMealRecordStatements(
  env: Env,
  appointmentId: string,
  familyId: string,
  completedAt: number,
): D1PreparedStatement[] {
  const recordId = `${APPOINTMENT_RECORD_PREFIX}${appointmentId}`;
  const timestamp = Number.isFinite(completedAt) && completedAt > 0 ? completedAt : Date.now();
  return [
    env.DB.prepare(`
      INSERT OR IGNORE INTO meal_records (
        id, source, appointmentId, scope, scopeKey, familyId, familyNameSnapshot,
        date, mealType, completedAt, ownerUserId, createdBy, frozenAt, createdAt, updatedAt
      )
      SELECT ?, 'appointment', a.id, 'family', 'family:' || a.familyId,
        a.familyId, COALESCE(f.name, ''), a.date, a.mealType, ?,
        a.userId, a.userId,
        CASE WHEN f.status = 'active' THEN NULL ELSE ? END,
        COALESCE(a.createTime, ?), ?
      FROM appointments a
      LEFT JOIN families f ON f.id = a.familyId
      WHERE a.id = ? AND a.familyId = ? AND ${completedStatusSql()}
    `).bind(recordId, timestamp, timestamp, timestamp, timestamp, appointmentId, familyId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO meal_record_dishes (
        id, mealRecordId, originalDishId, normalizedName, nameSnapshot,
        typeSnapshot, imagesSnapshot, sortOrder
      )
      SELECT ? || ':dish:' || ad.id, ?, d.id,
        lower(replace(replace(replace(replace(replace(trim(COALESCE(d.name, '')), ' ', ''), char(12288), ''), '·', ''), '_', ''), '-', '')),
        COALESCE(d.name, ''), COALESCE(d.type, ''),
        CASE WHEN json_valid(COALESCE(d.images, '[]')) THEN COALESCE(d.images, '[]') ELSE '[]' END,
        ROW_NUMBER() OVER (PARTITION BY ad.appointmentId ORDER BY ad.createTime, ad.id) - 1
      FROM appointment_dishes ad
      JOIN appointments a ON a.id = ad.appointmentId AND ${completedStatusSql()}
      JOIN dishes d ON d.id = ad.dishId AND d.familyId = a.familyId
      WHERE ad.appointmentId = ? AND a.familyId = ?
    `).bind(recordId, recordId, appointmentId, familyId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO meal_record_participants (
        id, mealRecordId, userId, userNameSnapshot, userAvatarSnapshot,
        note, frozenAt, badgeSnapshot, legacyFallback, createdAt, updatedAt
      )
      SELECT ? || ':participant:' || ad.userId, ?, ad.userId,
        COALESCE(u.nickName, ''), COALESCE(u.avatarUrl, ''), '',
        CASE WHEN fm.status = 'active' AND f.status = 'active' THEN NULL ELSE ? END,
        CASE WHEN uas.pinnedAchievementId IS NULL THEN '[]' ELSE json_array(uas.pinnedAchievementId) END,
        0, ?, ?
      FROM appointment_diners ad
      JOIN appointments a ON a.id = ad.appointmentId AND ${completedStatusSql()}
      JOIN family_members fm ON fm.familyId = a.familyId AND fm.userId = ad.userId
      LEFT JOIN families f ON f.id = a.familyId
      LEFT JOIN users u ON u.id = ad.userId
      LEFT JOIN user_achievement_state uas ON uas.userId = ad.userId
      WHERE ad.appointmentId = ? AND a.familyId = ?
    `).bind(recordId, recordId, timestamp, timestamp, timestamp, appointmentId, familyId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO meal_record_participants (
        id, mealRecordId, userId, userNameSnapshot, userAvatarSnapshot,
        note, frozenAt, badgeSnapshot, legacyFallback, createdAt, updatedAt
      )
      SELECT ? || ':participant:legacy-fallback', ?, a.userId,
        COALESCE(u.nickName, ''), COALESCE(u.avatarUrl, ''), '',
        CASE WHEN fm.status = 'active' AND f.status = 'active' THEN NULL ELSE ? END,
        CASE WHEN uas.pinnedAchievementId IS NULL THEN '[]' ELSE json_array(uas.pinnedAchievementId) END,
        1, ?, ?
      FROM appointments a
      LEFT JOIN family_members fm ON fm.familyId = a.familyId AND fm.userId = a.userId
      LEFT JOIN families f ON f.id = a.familyId
      LEFT JOIN users u ON u.id = a.userId
      LEFT JOIN user_achievement_state uas ON uas.userId = a.userId
      WHERE a.id = ? AND a.familyId = ? AND ${completedStatusSql()}
        AND NOT EXISTS (
          SELECT 1 FROM appointment_diners ad
          JOIN family_members dinerMembership
            ON dinerMembership.familyId = a.familyId AND dinerMembership.userId = ad.userId
          WHERE ad.appointmentId = a.id
        )
    `).bind(recordId, recordId, timestamp, timestamp, timestamp, appointmentId, familyId),
  ];
}

export async function createMealRecordFromAppointment(
  env: Env,
  appointmentId: string,
  familyId: string,
  completedAt: number,
): Promise<MealRecordMaterializationResult> {
  const id = `${APPOINTMENT_RECORD_PREFIX}${appointmentId}`;
  const result = await env.DB.batch(buildAppointmentMealRecordStatements(env, appointmentId, familyId, completedAt));
  return { id, created: Boolean(result[0]?.meta?.changes) };
}

export function buildFreezeMealContributionsForMemberStatements(
  env: Env,
  familyId: string,
  userId: string,
  frozenAt = Date.now(),
): D1PreparedStatement[] {
  const timestamp = Number.isFinite(frozenAt) && frozenAt > 0 ? frozenAt : Date.now();
  return [
    env.DB.prepare(`
      UPDATE meal_record_participants
      SET frozenAt = COALESCE(frozenAt, ?), updatedAt = MAX(updatedAt, ?)
      WHERE userId = ? AND mealRecordId IN (
        SELECT id FROM meal_records WHERE familyId = ?
      )
    `).bind(timestamp, timestamp, userId, familyId),
    env.DB.prepare(`
      UPDATE meal_memory_files
      SET frozenAt = COALESCE(frozenAt, ?)
      WHERE participantUserId = ? AND mealRecordId IN (
        SELECT id FROM meal_records WHERE familyId = ?
      ) AND deletedAt IS NULL
    `).bind(timestamp, userId, familyId),
  ];
}

export async function freezeMealContributionsForMember(
  env: Env,
  familyId: string,
  userId: string,
  frozenAt = Date.now(),
): Promise<void> {
  await env.DB.batch(buildFreezeMealContributionsForMemberStatements(env, familyId, userId, frozenAt));
}

export function buildFreezeMealRecordsForFamilyStatements(
  env: Env,
  familyId: string,
  frozenAt = Date.now(),
): D1PreparedStatement[] {
  const timestamp = Number.isFinite(frozenAt) && frozenAt > 0 ? frozenAt : Date.now();
  return [
    env.DB.prepare(`
      UPDATE meal_records SET frozenAt = COALESCE(frozenAt, ?), updatedAt = MAX(updatedAt, ?)
      WHERE familyId = ? AND deletedAt IS NULL
    `).bind(timestamp, timestamp, familyId),
    env.DB.prepare(`
      UPDATE meal_record_participants SET frozenAt = COALESCE(frozenAt, ?), updatedAt = MAX(updatedAt, ?)
      WHERE mealRecordId IN (SELECT id FROM meal_records WHERE familyId = ?)
    `).bind(timestamp, timestamp, familyId),
    env.DB.prepare(`
      UPDATE meal_memory_files SET frozenAt = COALESCE(frozenAt, ?)
      WHERE familyId = ? AND deletedAt IS NULL
    `).bind(timestamp, familyId),
  ];
}

export async function freezeMealRecordsForFamily(env: Env, familyId: string, frozenAt = Date.now()): Promise<void> {
  await env.DB.batch(buildFreezeMealRecordsForFamilyStatements(env, familyId, frozenAt));
}

export async function exportMealHistoryForUser(env: Env, userId: string): Promise<MealHistoryExport> {
  const [records, dishes, contributions, files, achievements, state] = await env.DB.batch([
    env.DB.prepare(`
      SELECT mr.*
      FROM meal_records mr
      WHERE mr.ownerUserId = ?
         OR EXISTS (
           SELECT 1 FROM meal_record_participants p
           WHERE p.mealRecordId = mr.id AND p.userId = ?
         )
      ORDER BY mr.date DESC, mr.createdAt DESC
    `).bind(userId, userId),
    env.DB.prepare(`
      SELECT d.*
      FROM meal_record_dishes d
      JOIN meal_records mr ON mr.id = d.mealRecordId
      WHERE mr.ownerUserId = ?
         OR EXISTS (
           SELECT 1 FROM meal_record_participants p
           WHERE p.mealRecordId = mr.id AND p.userId = ?
         )
      ORDER BY mr.date DESC, mr.createdAt DESC, d.sortOrder ASC, d.id ASC
    `).bind(userId, userId),
    env.DB.prepare(`
      SELECT p.*
      FROM meal_record_participants p
      WHERE p.userId = ?
      ORDER BY p.updatedAt DESC
    `).bind(userId),
    env.DB.prepare(`
      SELECT f.id, f.mealRecordId, f.participantUserId, f.familyId, f.name,
        f.contentType, f.size, f.purpose, f.createdAt, f.attachedAt, f.frozenAt, f.deletedAt
      FROM meal_memory_files f
      WHERE f.ownerUserId = ? OR f.participantUserId = ?
      ORDER BY f.createdAt DESC
    `).bind(userId, userId),
    env.DB.prepare('SELECT userId, achievementId, unlockedAt, acknowledgedAt FROM user_achievements WHERE userId = ? ORDER BY unlockedAt DESC').bind(userId),
    env.DB.prepare('SELECT userId, pinnedAchievementId, updatedAt FROM user_achievement_state WHERE userId = ?').bind(userId),
  ]);
  return {
    records: records.results,
    dishes: dishes.results,
    contributions: contributions.results,
    files: files.results,
    achievements: achievements.results,
    achievementState: (state.results[0] as Record<string, unknown> | undefined) || null,
  };
}

export function buildAnonymizeMealHistoryForDeletedUserStatements(
  env: Env,
  userId: string,
  at = Date.now(),
): D1PreparedStatement[] {
  const timestamp = Number.isFinite(at) && at > 0 ? at : Date.now();
  return [
    env.DB.prepare(`
      DELETE FROM meal_records
      WHERE scope = 'personal' AND (ownerUserId = ? OR EXISTS (
        SELECT 1 FROM meal_record_participants p
        WHERE p.mealRecordId = meal_records.id AND p.userId = ?
      ))
    `).bind(userId, userId),
    env.DB.prepare(`
      UPDATE meal_record_participants
      SET userId = NULL, userNameSnapshot = '已注销用户', userAvatarSnapshot = '',
        frozenAt = COALESCE(frozenAt, ?), updatedAt = MAX(updatedAt, ?)
      WHERE userId = ? AND mealRecordId IN (
        SELECT id FROM meal_records WHERE scope = 'family'
      )
    `).bind(timestamp, timestamp, userId),
    env.DB.prepare(`
      UPDATE meal_memory_files
      SET deletedAt = COALESCE(deletedAt, ?), expiresAt = NULL
      WHERE ownerUserId = ? AND deletedAt IS NULL AND (
        mealRecordId IS NULL OR mealRecordId IN (
          SELECT id FROM meal_records WHERE scope = 'personal'
        )
      )
    `).bind(timestamp, userId),
    env.DB.prepare(`
      UPDATE meal_memory_files
      SET ownerUserId = NULL, participantUserId = NULL, frozenAt = COALESCE(frozenAt, ?)
      WHERE participantUserId = ? AND mealRecordId IN (
        SELECT id FROM meal_records WHERE scope = 'family'
      ) AND deletedAt IS NULL
    `).bind(timestamp, userId),
    env.DB.prepare(`
      UPDATE meal_records
      SET ownerUserId = NULL, createdBy = NULL, updatedAt = MAX(updatedAt, ?)
      WHERE scope = 'family' AND (ownerUserId = ? OR createdBy = ?)
    `).bind(timestamp, userId, userId),
    env.DB.prepare('DELETE FROM user_achievements WHERE userId = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_achievement_state WHERE userId = ?').bind(userId),
  ];
}

export async function deletePersonalMealHistoryObjectsForDeletedUser(
  env: Env,
  userId: string,
  deletedAt: number,
): Promise<number> {
  const personalFiles = await env.DB.prepare(`
    SELECT f.id, f.objectKey
    FROM meal_memory_files f
    LEFT JOIN meal_records mr ON mr.id = f.mealRecordId
    WHERE f.ownerUserId = ? AND f.deletedAt = ?
      AND (f.mealRecordId IS NULL OR mr.scope = 'personal')
  `).bind(userId, deletedAt).all<{ id: string; objectKey: string }>();

  for (const file of personalFiles.results) {
    try {
      await env.FILE_BUCKET.delete(file.objectKey);
      await env.DB.prepare('DELETE FROM meal_memory_files WHERE id = ? AND deletedAt = ?')
        .bind(file.id, deletedAt).run();
    } catch {
      // The soft-deleted row remains available for the scheduled storage retry.
    }
  }
  return personalFiles.results.length;
}

export async function anonymizeMealHistoryForDeletedUser(
  env: Env,
  userId: string,
  at = Date.now(),
): Promise<{ personalRecords: number; frozenContributions: number; deletedFiles: number }> {
  const timestamp = Number.isFinite(at) && at > 0 ? at : Date.now();
  const [personalRecords, familyContributions] = await env.DB.batch(
    buildAnonymizeMealHistoryForDeletedUserStatements(env, userId, timestamp),
  );
  const deletedFiles = await deletePersonalMealHistoryObjectsForDeletedUser(env, userId, timestamp);
  return {
    personalRecords: Number(personalRecords?.meta.changes || 0),
    frozenContributions: Number(familyContributions?.meta.changes || 0),
    deletedFiles,
  };
}
