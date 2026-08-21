PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));
ALTER TABLE users ADD COLUMN suspendedAt INTEGER;
ALTER TABLE users ADD COLUMN suspendedBy TEXT;
ALTER TABLE users ADD COLUMN suspendReason TEXT;

CREATE TABLE platform_admins (
  userId TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'super_admin' CHECK (role = 'super_admin'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO platform_admins (userId, role, status, createdAt, updatedAt)
SELECT id, 'super_admin', 'active', 1787306400000, 1787306400000
FROM users
WHERE id = 'e57743c5-7d24-4435-97eb-9a6d0dfffd23';

CREATE TABLE platform_files (
  id TEXT PRIMARY KEY,
  objectKey TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contentType TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size >= 0),
  purpose TEXT NOT NULL DEFAULT 'recipe-template',
  uploadedBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (uploadedBy) REFERENCES users(id)
);

ALTER TABLE recipe_templates ADD COLUMN createdBy TEXT;
ALTER TABLE recipe_templates ADD COLUMN updatedBy TEXT;
ALTER TABLE recipe_templates ADD COLUMN publishedAt INTEGER;
ALTER TABLE recipe_templates ADD COLUMN archivedAt INTEGER;

UPDATE recipe_templates
SET publishedAt = COALESCE(publishedAt, createdAt)
WHERE status = 'active';

CREATE INDEX idx_users_platform_status ON users(status, createTime);
CREATE INDEX idx_platform_admins_status ON platform_admins(status, userId);
CREATE INDEX idx_platform_files_active ON platform_files(deletedAt, createdAt);
CREATE INDEX idx_audit_events_platform ON audit_events(familyId, action, createdAt);
