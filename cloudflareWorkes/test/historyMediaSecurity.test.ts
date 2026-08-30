import { describe, expect, it } from 'vitest';
import { validatePendingFiles } from '../handlers/historyV2Handler';
import {
  assertFamilyUploadQuota,
  assertUserUploadQuota,
  cleanupExpiredUploads,
  FAMILY_STORAGE_QUOTA_BYTES,
  USER_STORAGE_QUOTA_BYTES,
} from '../core/uploadSecurity';
import type { Env } from '../core/types';

type FakeStatement = {
  sql: string;
  bindings: unknown[];
  bind: (...values: unknown[]) => FakeStatement;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  first: <T = unknown>(columnName?: string) => Promise<T | null>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function fakeDb(options: {
  allRows?: unknown[];
  firstValue?: unknown;
  batchValues?: unknown[];
  onRun?: (statement: FakeStatement) => void;
} = {}): { db: D1Database; statements: FakeStatement[] } {
  const statements: FakeStatement[] = [];
  const db = {
    prepare(sql: string) {
      const statement: FakeStatement = {
        sql,
        bindings: [],
        bind(...values: unknown[]) {
          statement.bindings = values;
          return statement;
        },
        all<T = Record<string, unknown>>() {
          return Promise.resolve({ results: (options.allRows || []) as T[] });
        },
        first<T = unknown>() {
          return Promise.resolve((options.firstValue ?? null) as T | null);
        },
        run() {
          options.onRun?.(statement);
          return Promise.resolve({ success: true, meta: { changes: 1 } });
        },
      };
      statements.push(statement);
      return statement;
    },
    batch(prepared: FakeStatement[]) {
      return Promise.resolve(prepared.map((_, index) => ({
        results: [{ used: options.batchValues?.[index] ?? options.firstValue ?? 0 }],
        success: true,
        meta: { changes: 0 },
      })));
    },
  } as unknown as D1Database;
  return { db, statements };
}

function testEnv(db: D1Database, deletes: string[] = []): Env {
  return {
    DB: db,
    FILE_BUCKET: {
      delete(key: string) {
        deletes.push(key);
        return Promise.resolve(true);
      },
    },
    WX_APPID: 'test-app',
    WX_SECRET: 'test-secret',
  } as unknown as Env;
}

describe('history memory upload security', () => {
  it('rejects an expired pending file before it can be attached', async () => {
    const now = Date.now();
    const { db, statements } = fakeDb({
      allRows: [{
        id: 'expired-file',
        objectKey: 'users/user-1/expired.jpg',
        ownerUserId: 'user-1',
        mealRecordId: null,
        participantId: null,
        participantUserId: null,
        familyId: null,
        name: 'expired.jpg',
        contentType: 'image/jpeg',
        size: 32,
        createdAt: now - 2_000,
        attachedAt: null,
        expiresAt: now - 1,
        frozenAt: null,
        deletedAt: null,
      }],
    });
    const env = testEnv(db);

    await expect(validatePendingFiles(
      env,
      'user-1',
      ['expired-file'],
      'record-1',
      'participant-1',
      null,
      now,
    )).rejects.toMatchObject({ code: 'IMAGE_REFERENCE_INVALID' });
    expect(statements[0].sql).toContain('expiresAt');
  });

  it('counts active history memory files in the user quota query', async () => {
    const userId = 'user-1';
    const { db, statements } = fakeDb({ firstValue: USER_STORAGE_QUOTA_BYTES - 1 });
    const env = testEnv(db);

    await expect(assertUserUploadQuota(env, userId, 2)).rejects.toMatchObject({
      code: 'USER_STORAGE_QUOTA',
    });
    expect(statements[0].sql).toContain('meal_memory_files');
    expect(statements[0].sql).toContain('ownerUserId = ? AND deletedAt IS NULL');
    expect(statements[0].bindings).toEqual([userId, userId, userId, userId]);
  });

  it('counts history files in the shared family quota', async () => {
    const { db, statements } = fakeDb({
      batchValues: [FAMILY_STORAGE_QUOTA_BYTES - 1, 0],
    });
    const env = testEnv(db);
    const context = { familyId: 'family-1', user: { id: 'user-1' } } as never;

    await expect(assertFamilyUploadQuota(env, context, 2)).rejects.toMatchObject({
      code: 'FAMILY_STORAGE_QUOTA',
    });
    expect(statements[0].sql).toContain('FROM meal_memory_files');
    expect(statements[0].sql).toContain('familyId = ? AND deletedAt IS NULL');
  });

  it('returns a transactional guard for concurrent history file binding', async () => {
    const now = Date.now();
    const { db } = fakeDb({
      allRows: [{
        id: 'pending-file',
        objectKey: 'users/user-1/pending.jpg',
        ownerUserId: 'user-1',
        mealRecordId: null,
        participantId: null,
        participantUserId: null,
        familyId: null,
        name: 'pending.jpg',
        contentType: 'image/jpeg',
        size: 32,
        createdAt: now,
        attachedAt: null,
        expiresAt: now + 10_000,
        frozenAt: null,
        deletedAt: null,
      }],
    });
    const env = testEnv(db);

    const result = await validatePendingFiles(env, 'user-1', ['pending-file'], 'record-1', 'participant-1', null, now);

    expect(result.statements).toHaveLength(1);
    const guardSql = (result.guard as unknown as FakeStatement | null)?.sql || '';
    expect(guardSql).toContain('COUNT(*)');
    expect(guardSql).toContain('UPDATE meal_record_participants SET note = NULL');
    expect(guardSql).toContain('frozenAt IS NULL');
  });

  it('cleans family and history files under one total limit', async () => {
    const deletes: string[] = [];
    const updates: FakeStatement[] = [];
    const { db, statements } = fakeDb({
      allRows: [
        { id: 'memory-expired', objectKey: 'users/user-1/memory.jpg', sourceType: 'meal_memory', deletedAt: null },
        { id: 'family-expired', objectKey: 'families/family-1/photo.jpg', sourceType: 'family', deletedAt: null },
      ],
      onRun: statement => updates.push(statement),
    });
    const env = testEnv(db, deletes);

    await expect(cleanupExpiredUploads(env, 2)).resolves.toBe(2);
    expect(deletes).toEqual([
      'users/user-1/memory.jpg',
      'families/family-1/photo.jpg',
    ]);
    expect(statements[0].sql).toContain('FROM family_files');
    expect(statements[0].sql).toContain('FROM meal_memory_files');
    expect(statements[0].sql).toContain('UNION ALL');
    expect(statements[0].sql).toContain('deletedAt IS NOT NULL');
    expect(statements[0].sql).toContain('LIMIT ?');
    expect(statements[0].bindings).toEqual([
      expect.any(Number),
      expect.any(Number),
      2,
    ]);
    expect(updates.map(statement => statement.sql)).toEqual([
      expect.stringContaining('UPDATE meal_memory_files'),
      expect.stringContaining('DELETE FROM meal_memory_files'),
      expect.stringContaining('UPDATE family_files'),
      expect.stringContaining('DELETE FROM family_files'),
    ]);
    expect(updates.map(statement => statement.bindings)).toEqual([
      [expect.any(Number), 'memory-expired', expect.any(Number)],
      ['memory-expired'],
      [expect.any(Number), 'family-expired', expect.any(Number)],
      ['family-expired'],
    ]);
  });
});
