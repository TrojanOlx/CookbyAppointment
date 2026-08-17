PRAGMA foreign_keys = ON;

CREATE TABLE families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  memberLimit INTEGER NOT NULL DEFAULT 20 CHECK (memberLimit BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dissolved')),
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  dissolvedAt INTEGER,
  FOREIGN KEY (createdBy) REFERENCES users(id)
);

CREATE TABLE family_members (
  familyId TEXT NOT NULL,
  userId TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'chef', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'removed')),
  joinedAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (familyId, userId),
  FOREIGN KEY (familyId) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE family_invitations (
  id TEXT PRIMARY KEY,
  familyId TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'chef', 'member')),
  tokenHash TEXT NOT NULL UNIQUE,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  revokedAt INTEGER,
  acceptedAt INTEGER,
  acceptedBy TEXT,
  FOREIGN KEY (familyId) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (createdBy) REFERENCES users(id)
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  tokenHash TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  lastSeenAt INTEGER NOT NULL,
  revokedAt INTEGER,
  userAgent TEXT,
  appVersion TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE ingredient_catalog (
  id TEXT PRIMARY KEY,
  canonicalName TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '其他',
  defaultUnit TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE ingredient_aliases (
  id TEXT PRIMARY KEY,
  ingredientId TEXT NOT NULL,
  alias TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (ingredientId) REFERENCES ingredient_catalog(id) ON DELETE CASCADE
);

CREATE TABLE user_food_preferences (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('allergy', 'avoid', 'like', 'spice')),
  value TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  UNIQUE (userId, type, value),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE appointment_diners (
  appointmentId TEXT NOT NULL,
  userId TEXT NOT NULL,
  preferenceSnapshot TEXT NOT NULL DEFAULT '[]',
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (appointmentId, userId),
  FOREIGN KEY (appointmentId) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE shopping_lists (
  id TEXT PRIMARY KEY,
  familyId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (familyId) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE shopping_list_items (
  id TEXT PRIMARY KEY,
  shoppingListId TEXT NOT NULL,
  ingredientId TEXT,
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  legacyAmount TEXT,
  sourceType TEXT NOT NULL DEFAULT 'manual' CHECK (sourceType IN ('manual', 'appointment')),
  assigneeId TEXT,
  checked INTEGER NOT NULL DEFAULT 0,
  purchasedAt INTEGER,
  stockedAt INTEGER,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (shoppingListId) REFERENCES shopping_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredientId) REFERENCES ingredient_catalog(id),
  FOREIGN KEY (assigneeId) REFERENCES users(id),
  FOREIGN KEY (createdBy) REFERENCES users(id)
);

CREATE TABLE shopping_item_sources (
  itemId TEXT NOT NULL,
  appointmentId TEXT NOT NULL,
  requiredQuantity REAL,
  unit TEXT,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (itemId, appointmentId),
  FOREIGN KEY (itemId) REFERENCES shopping_list_items(id) ON DELETE CASCADE,
  FOREIGN KEY (appointmentId) REFERENCES appointments(id) ON DELETE CASCADE
);

CREATE TABLE family_files (
  id TEXT PRIMARY KEY,
  familyId TEXT NOT NULL,
  objectKey TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contentType TEXT NOT NULL,
  size INTEGER NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'general',
  uploadedBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (familyId) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (uploadedBy) REFERENCES users(id)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  familyId TEXT,
  actorUserId TEXT,
  action TEXT NOT NULL,
  targetType TEXT,
  targetId TEXT,
  details TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (familyId) REFERENCES families(id) ON DELETE SET NULL,
  FOREIGN KEY (actorUserId) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE idempotency_keys (
  familyId TEXT NOT NULL,
  userId TEXT NOT NULL,
  key TEXT NOT NULL,
  operation TEXT NOT NULL,
  responseStatus INTEGER,
  responseBody TEXT,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (familyId, userId, key)
);

CREATE TABLE api_rate_limits (
  scope TEXT NOT NULL,
  windowStart INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (scope, windowStart)
);

ALTER TABLE dishes ADD COLUMN familyId TEXT;
ALTER TABLE ingredients ADD COLUMN ingredientId TEXT;
ALTER TABLE ingredients ADD COLUMN quantity REAL;
ALTER TABLE ingredients ADD COLUMN unit TEXT;
ALTER TABLE ingredients ADD COLUMN legacyAmount TEXT;
ALTER TABLE appointments ADD COLUMN familyId TEXT;
ALTER TABLE appointments ADD COLUMN preferenceWarnings TEXT NOT NULL DEFAULT '[]';
ALTER TABLE appointments ADD COLUMN warningsAcknowledged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN familyId TEXT;
ALTER TABLE inventory_items ADD COLUMN familyId TEXT;
ALTER TABLE inventory_items ADD COLUMN ingredientId TEXT;
ALTER TABLE inventory_items ADD COLUMN quantity REAL;
ALTER TABLE inventory_items ADD COLUMN unit TEXT;
ALTER TABLE inventory_items ADD COLUMN legacyAmount TEXT;

CREATE INDEX idx_family_members_user ON family_members(userId, status);
CREATE INDEX idx_family_members_family_role ON family_members(familyId, role, status);
CREATE INDEX idx_family_invites_family ON family_invitations(familyId, expiresAt);
CREATE INDEX idx_sessions_hash_active ON user_sessions(tokenHash, expiresAt, revokedAt);
CREATE INDEX idx_preferences_user ON user_food_preferences(userId, type);
CREATE INDEX idx_dishes_family ON dishes(familyId, createTime DESC);
CREATE INDEX idx_appointments_family_date ON appointments(familyId, date, mealType);
CREATE INDEX idx_reviews_family ON reviews(familyId, createTime DESC);
CREATE INDEX idx_inventory_family ON inventory_items(familyId, status, expiryDate);
CREATE INDEX idx_shopping_lists_family ON shopping_lists(familyId, status);
CREATE INDEX idx_shopping_items_list ON shopping_list_items(shoppingListId, checked, createdAt);
CREATE INDEX idx_family_files_family ON family_files(familyId, deletedAt, createdAt DESC);
CREATE INDEX idx_audit_family_time ON audit_events(familyId, createdAt DESC);
