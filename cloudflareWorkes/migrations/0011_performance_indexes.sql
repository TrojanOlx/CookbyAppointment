CREATE INDEX IF NOT EXISTS idx_dishes_family_type_created
  ON dishes(familyId, type, createTime DESC);
