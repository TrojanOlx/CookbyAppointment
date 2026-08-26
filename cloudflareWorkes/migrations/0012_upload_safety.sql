PRAGMA foreign_keys = ON;

CREATE TABLE user_files (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  objectKey TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contentType TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 5242880),
  purpose TEXT NOT NULL DEFAULT 'avatar' CHECK (purpose = 'avatar'),
  createdAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_files_active ON user_files(userId, purpose, deletedAt, createdAt DESC);

ALTER TABLE family_files ADD COLUMN targetType TEXT;
ALTER TABLE family_files ADD COLUMN targetId TEXT;
ALTER TABLE family_files ADD COLUMN attachedAt INTEGER;
ALTER TABLE family_files ADD COLUMN expiresAt INTEGER;

UPDATE family_files SET attachedAt = createdAt WHERE attachedAt IS NULL;

CREATE INDEX idx_family_files_user_active ON family_files(uploadedBy, deletedAt, createdAt DESC);
CREATE INDEX idx_family_files_expiry ON family_files(expiresAt, deletedAt);
CREATE INDEX idx_family_files_target ON family_files(familyId, targetType, targetId, deletedAt);
