import { describe, expect, it } from 'vitest';
import { calculateAchievementMetrics } from '../core/achievement';
import {
  buildAnonymizeMealHistoryForDeletedUserStatements,
  buildAppointmentMealRecordStatements,
  buildFreezeMealContributionsForMemberStatements,
  buildFreezeMealRecordsForFamilyStatements,
  exportMealHistoryForUser,
} from '../core/mealHistory';
import type { Env } from '../core/types';

interface FakeStatement {
  sql: string;
  bindings: unknown[];
  bind: (...bindings: unknown[]) => FakeStatement;
}

function fakeEnv(batchResults: unknown[][] = []): Env {
  const db = {
    prepare(sql: string): FakeStatement {
      const statement: FakeStatement = {
        sql,
        bindings: [],
        bind(...bindings: unknown[]) {
          statement.bindings = bindings;
          return statement;
        },
      };
      return statement;
    },
    batch() {
      return Promise.resolve(batchResults.map(results => ({ results })));
    },
  };
  return { DB: db } as unknown as Env;
}

describe('meal history lifecycle statement builders', () => {
  it('counts a repeated dish once per record when duplicate snapshot rows exist', async () => {
    const metrics = await calculateAchievementMetrics(fakeEnv([
      [
        { id: 'record-1', date: '2026-08-01', mealType: '晚餐', scopeKey: 'family:one' },
        { id: 'record-2', date: '2026-08-02', mealType: '晚餐', scopeKey: 'family:one' },
      ],
      [
        { recordId: 'record-1', scopeKey: 'family:one', normalizedName: '番茄炒蛋' },
        { recordId: 'record-1', scopeKey: 'family:one', normalizedName: '番茄炒蛋' },
        { recordId: 'record-2', scopeKey: 'family:one', normalizedName: '番茄炒蛋' },
      ],
      [{ count: 0 }],
      [{ count: 0 }],
    ]), 'user-1');

    expect(metrics.uniqueDishCount).toBe(1);
    expect(metrics.repeatedDishMax).toBe(2);
  });

  it('exports dish snapshots alongside records and contributions', async () => {
    const dishSnapshot = {
      id: 'dish-snapshot-1',
      mealRecordId: 'record-1',
      originalDishId: 'dish-1',
      normalizedName: '番茄炒蛋',
      nameSnapshot: '番茄炒蛋',
      typeSnapshot: '家常菜',
      imagesSnapshot: '[]',
      sortOrder: 0,
    };
    const exported = await exportMealHistoryForUser(fakeEnv([
      [{ id: 'record-1', scope: 'family' }],
      [dishSnapshot],
      [{ id: 'participant-1', userId: 'user-1' }],
      [{ id: 'file-1', mealRecordId: 'record-1' }],
      [{ achievementId: 'meal-first', unlockedAt: 123, acknowledgedAt: null }],
      [{ pinnedAchievementId: 'meal-first' }],
    ]), 'user-1');

    expect(exported.records).toEqual([{ id: 'record-1', scope: 'family' }]);
    expect(exported.dishes).toEqual([dishSnapshot]);
    expect(exported.contributions).toEqual([{ id: 'participant-1', userId: 'user-1' }]);
  });

  it('keeps automatic snapshots within the appointment family and freezes former members', () => {
    const statements = buildAppointmentMealRecordStatements(fakeEnv(), 'appointment-1', 'family-1', 123);
    const dishSql = (statements[1] as unknown as FakeStatement).sql;
    const participantSql = (statements[2] as unknown as FakeStatement).sql;
    const fallbackSql = (statements[3] as unknown as FakeStatement).sql;

    expect(dishSql).toContain('JOIN dishes d ON d.id = ad.dishId AND d.familyId = a.familyId');
    expect(participantSql).toContain('JOIN family_members fm ON fm.familyId = a.familyId AND fm.userId = ad.userId');
    expect(participantSql).toContain("CASE WHEN fm.status = 'active'");
    expect(fallbackSql).toContain('JOIN family_members dinerMembership');
    expect(fallbackSql).toContain('dinerMembership.familyId = a.familyId');
    expect(fallbackSql).toContain("CASE WHEN fm.status = 'active'");
  });

  it('builds member contribution and file freezes for one atomic batch', () => {
    const statements = buildFreezeMealContributionsForMemberStatements(fakeEnv(), 'family-1', 'user-1', 123);

    expect(statements).toHaveLength(2);
    expect((statements[0] as unknown as FakeStatement).sql).toContain('UPDATE meal_record_participants');
    expect((statements[1] as unknown as FakeStatement).sql).toContain('UPDATE meal_memory_files');
  });

  it('builds record, participant, and file freezes for family dissolution', () => {
    const statements = buildFreezeMealRecordsForFamilyStatements(fakeEnv(), 'family-1', 123);

    expect(statements).toHaveLength(3);
    expect(statements.map(statement => (statement as unknown as FakeStatement).sql)).toEqual([
      expect.stringContaining('UPDATE meal_records'),
      expect.stringContaining('UPDATE meal_record_participants'),
      expect.stringContaining('UPDATE meal_memory_files'),
    ]);
  });

  it('builds every D1 mutation needed for account-history anonymization', () => {
    const statements = buildAnonymizeMealHistoryForDeletedUserStatements(fakeEnv(), 'user-1', 123);
    const sql = statements.map(statement => (statement as unknown as FakeStatement).sql).join('\n');

    expect(statements).toHaveLength(7);
    expect(sql).toContain('DELETE FROM meal_records');
    expect(sql).toContain('UPDATE meal_record_participants');
    expect(sql).toContain('UPDATE meal_memory_files');
    expect(sql).toContain('DELETE FROM user_achievements');
    expect(sql).toContain('DELETE FROM user_achievement_state');
  });
});
