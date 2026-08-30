PRAGMA foreign_keys = ON;

-- Meal history is deliberately snapshot based.  Existing dishes, users and
-- families may be renamed or removed after a meal has happened, so the
-- readable values below are retained independently of their source rows.
CREATE TABLE IF NOT EXISTS meal_records (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('appointment', 'manual')),
  appointmentId TEXT,
  scope TEXT NOT NULL DEFAULT 'family' CHECK (scope IN ('family', 'personal')),
  scopeKey TEXT NOT NULL,
  familyId TEXT,
  familyNameSnapshot TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  mealType TEXT NOT NULL,
  completedAt INTEGER,
  ownerUserId TEXT,
  createdBy TEXT,
  frozenAt INTEGER,
  legacyBackfilled INTEGER NOT NULL DEFAULT 0 CHECK (legacyBackfilled IN (0, 1)),
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (familyId) REFERENCES families(id) ON DELETE SET NULL,
  FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meal_record_dishes (
  id TEXT PRIMARY KEY,
  mealRecordId TEXT NOT NULL,
  originalDishId TEXT,
  normalizedName TEXT NOT NULL,
  nameSnapshot TEXT NOT NULL,
  typeSnapshot TEXT NOT NULL DEFAULT '',
  imagesSnapshot TEXT NOT NULL DEFAULT '[]',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (mealRecordId) REFERENCES meal_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_record_participants (
  id TEXT PRIMARY KEY,
  mealRecordId TEXT NOT NULL,
  userId TEXT,
  userNameSnapshot TEXT NOT NULL DEFAULT '',
  userAvatarSnapshot TEXT NOT NULL DEFAULT '',
  personalHiddenAt INTEGER,
  note TEXT NOT NULL DEFAULT '',
  frozenAt INTEGER,
  badgeSnapshot TEXT NOT NULL DEFAULT '[]',
  legacyFallback INTEGER NOT NULL DEFAULT 0 CHECK (legacyFallback IN (0, 1)),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (mealRecordId) REFERENCES meal_records(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS meal_memory_files (
  id TEXT PRIMARY KEY,
  objectKey TEXT NOT NULL UNIQUE,
  ownerUserId TEXT,
  mealRecordId TEXT,
  participantId TEXT,
  participantUserId TEXT,
  familyId TEXT,
  name TEXT NOT NULL,
  contentType TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 5242880),
  purpose TEXT NOT NULL DEFAULT 'meal-memory',
  createdAt INTEGER NOT NULL,
  attachedAt INTEGER,
  expiresAt INTEGER,
  frozenAt INTEGER,
  deletedAt INTEGER,
  FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (mealRecordId) REFERENCES meal_records(id) ON DELETE SET NULL,
  FOREIGN KEY (familyId) REFERENCES families(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  userId TEXT NOT NULL,
  achievementId TEXT NOT NULL,
  unlockedAt INTEGER NOT NULL,
  acknowledgedAt INTEGER,
  PRIMARY KEY (userId, achievementId),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_achievement_state (
  userId TEXT PRIMARY KEY,
  pinnedAchievementId TEXT,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_records_appointment
  ON meal_records(appointmentId) WHERE appointmentId IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meal_records_scope_date
  ON meal_records(scopeKey, date DESC, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_meal_records_family_date
  ON meal_records(familyId, date DESC, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_meal_record_dishes_record
  ON meal_record_dishes(mealRecordId, sortOrder);
CREATE INDEX IF NOT EXISTS idx_meal_record_dishes_name
  ON meal_record_dishes(normalizedName, mealRecordId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_record_participant_user
  ON meal_record_participants(mealRecordId, userId) WHERE userId IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meal_record_participants_user
  ON meal_record_participants(userId, personalHiddenAt, mealRecordId);
CREATE INDEX IF NOT EXISTS idx_meal_memory_files_record
  ON meal_memory_files(mealRecordId, participantUserId, deletedAt, createdAt);
CREATE INDEX IF NOT EXISTS idx_meal_memory_files_owner
  ON meal_memory_files(ownerUserId, deletedAt, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_meal_memory_files_expiry
  ON meal_memory_files(expiresAt, deletedAt, createdAt)
  WHERE expiresAt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meal_memory_files_deleted
  ON meal_memory_files(deletedAt, createdAt)
  WHERE deletedAt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_achievements_user
  ON user_achievements(userId, unlockedAt DESC);

-- Import every completed appointment.  The deterministic IDs and INSERT OR
-- IGNORE make this safe when a deployment retries the migration/backfill.
INSERT OR IGNORE INTO meal_records (
  id, source, appointmentId, scope, scopeKey, familyId, familyNameSnapshot,
  date, mealType, completedAt, ownerUserId, createdBy, frozenAt, legacyBackfilled,
  createdAt, updatedAt
)
SELECT
  'appointment:' || a.id,
  'appointment',
  a.id,
  CASE WHEN a.familyId IS NULL THEN 'personal' ELSE 'family' END,
  CASE WHEN a.familyId IS NULL THEN 'personal:' || a.userId ELSE 'family:' || a.familyId END,
  a.familyId,
  COALESCE(f.name, ''),
  a.date,
  a.mealType,
  a.updateTime,
  a.userId,
  a.userId,
  CASE
    WHEN a.familyId IS NULL OR f.status = 'active' THEN NULL
    ELSE a.updateTime
  END,
  1,
  COALESCE(a.createTime, a.updateTime),
  a.updateTime
FROM appointments a
LEFT JOIN families f ON f.id = a.familyId
WHERE a.status IN ('已完成', 'completed');

INSERT OR IGNORE INTO meal_record_dishes (
  id, mealRecordId, originalDishId, normalizedName, nameSnapshot,
  typeSnapshot, imagesSnapshot, sortOrder
)
SELECT
  'appointment:' || a.id || ':dish:' || ad.id,
  'appointment:' || a.id,
  d.id,
  lower(replace(replace(replace(replace(replace(trim(COALESCE(d.name, '')), ' ', ''), '　', ''), '·', ''), '_', ''), '-', '')),
  COALESCE(d.name, ''),
  COALESCE(d.type, ''),
  CASE WHEN json_valid(COALESCE(d.images, '[]')) THEN COALESCE(d.images, '[]') ELSE '[]' END,
  ROW_NUMBER() OVER (PARTITION BY ad.appointmentId ORDER BY ad.createTime, ad.id) - 1
FROM appointment_dishes ad
JOIN appointments a ON a.id = ad.appointmentId AND a.status IN ('已完成', 'completed')
JOIN dishes d ON d.id = ad.dishId AND d.familyId = a.familyId;

-- A current or former membership proves the diner belonged to this family.
-- If an old completed appointment has no valid diner rows, its creator
-- receives the legacy fallback so the meal remains visible in personal history.
INSERT OR IGNORE INTO meal_record_participants (
  id, mealRecordId, userId, userNameSnapshot, userAvatarSnapshot,
  note, frozenAt, badgeSnapshot, legacyFallback, createdAt, updatedAt
)
SELECT
  'appointment:' || a.id || ':participant:' || ad.userId,
  'appointment:' || a.id,
  ad.userId,
  COALESCE(u.nickName, ''),
  COALESCE(u.avatarUrl, ''),
  '', CASE WHEN fm.status = 'active' AND f.status = 'active' THEN NULL ELSE a.updateTime END, '[]', 0,
  COALESCE(a.createTime, a.updateTime),
  a.updateTime
FROM appointment_diners ad
JOIN appointments a ON a.id = ad.appointmentId AND a.status IN ('已完成', 'completed')
JOIN family_members fm ON fm.familyId = a.familyId AND fm.userId = ad.userId
LEFT JOIN families f ON f.id = a.familyId
LEFT JOIN users u ON u.id = ad.userId;

INSERT OR IGNORE INTO meal_record_participants (
  id, mealRecordId, userId, userNameSnapshot, userAvatarSnapshot,
  note, frozenAt, badgeSnapshot, legacyFallback, createdAt, updatedAt
)
SELECT
  'appointment:' || a.id || ':participant:legacy-fallback',
  'appointment:' || a.id,
  a.userId,
  COALESCE(u.nickName, ''),
  COALESCE(u.avatarUrl, ''),
  '', CASE
    WHEN a.familyId IS NULL THEN NULL
    WHEN fm.status = 'active' AND f.status = 'active' THEN NULL
    ELSE a.updateTime
  END, '[]', 1,
  COALESCE(a.createTime, a.updateTime),
  a.updateTime
FROM appointments a
LEFT JOIN family_members fm ON fm.familyId = a.familyId AND fm.userId = a.userId
LEFT JOIN families f ON f.id = a.familyId
LEFT JOIN users u ON u.id = a.userId
WHERE a.status IN ('已完成', 'completed')
  AND NOT EXISTS (
    SELECT 1
    FROM appointment_diners ad
    JOIN family_members fm2 ON fm2.familyId = a.familyId AND fm2.userId = ad.userId
    WHERE ad.appointmentId = a.id
  );
