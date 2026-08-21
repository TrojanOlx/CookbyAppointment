PRAGMA foreign_keys = ON;

CREATE TABLE recipe_templates (
  id TEXT PRIMARY KEY,
  templateKey TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  spicy TEXT NOT NULL DEFAULT '不辣',
  images TEXT NOT NULL DEFAULT '[]',
  steps TEXT NOT NULL DEFAULT '[]',
  notice TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE recipe_template_ingredients (
  id TEXT PRIMARY KEY,
  templateId TEXT NOT NULL,
  ingredientId TEXT,
  name TEXT NOT NULL,
  amount TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  legacyAmount TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (templateId) REFERENCES recipe_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredientId) REFERENCES ingredient_catalog(id)
);

CREATE INDEX idx_recipe_templates_status_type
  ON recipe_templates(status, type, sortOrder, createdAt);
CREATE INDEX idx_recipe_template_ingredients_template
  ON recipe_template_ingredients(templateId, sortOrder);

INSERT OR IGNORE INTO ingredient_catalog
  (id, canonicalName, category, defaultUnit, createdAt, updatedAt)
VALUES
  ('template-catalog-tomato', '西红柿', '蔬菜', 'g', 1787241600000, 1787241600000),
  ('template-catalog-egg', '鸡蛋', '蛋奶', '个', 1787241600000, 1787241600000),
  ('template-catalog-scallion', '葱', '调味', 'g', 1787241600000, 1787241600000),
  ('template-catalog-pork-tenderloin', '猪里脊', '肉类', 'g', 1787241600000, 1787241600000),
  ('template-catalog-green-pepper', '青椒', '蔬菜', '个', 1787241600000, 1787241600000),
  ('template-catalog-ginger', '姜', '调味', 'g', 1787241600000, 1787241600000),
  ('template-catalog-garlic', '蒜', '调味', 'g', 1787241600000, 1787241600000),
  ('template-catalog-water-spinach', '空心菜', '蔬菜', 'g', 1787241600000, 1787241600000),
  ('template-catalog-lettuce', '生菜', '蔬菜', 'g', 1787241600000, 1787241600000),
  ('template-catalog-pork-ribs', '排骨', '肉类', 'g', 1787241600000, 1787241600000),
  ('template-catalog-winter-melon', '冬瓜', '蔬菜', 'g', 1787241600000, 1787241600000),
  ('template-catalog-beef-brisket', '牛腩', '肉类', 'g', 1787241600000, 1787241600000),
  ('template-catalog-onion', '洋葱', '蔬菜', '个', 1787241600000, 1787241600000),
  ('template-catalog-pork-belly', '五花肉', '肉类', 'g', 1787241600000, 1787241600000),
  ('template-catalog-eggplant', '茄子', '蔬菜', 'g', 1787241600000, 1787241600000),
  ('template-catalog-minced-pork', '猪肉末', '肉类', 'g', 1787241600000, 1787241600000),
  ('template-catalog-sea-bass', '鲈鱼', '水产', '只', 1787241600000, 1787241600000),
  ('template-catalog-warm-water', '温水', '其他', 'ml', 1787241600000, 1787241600000);

INSERT OR IGNORE INTO recipe_templates (
  id, templateKey, name, type, spicy, images, steps, notice, remark, reference,
  status, sortOrder, createdAt, updatedAt
)
VALUES
  (
    'recipe-template-tomato-eggs', 'tomato_scrambled_eggs', '西红柿炒鸡蛋', '炒菜', '不辣', '[]',
    '["西红柿切块，鸡蛋打散，葱切末。","热锅放油，将鸡蛋炒至凝固后盛出。","下西红柿炒软，按口味加盐和少量糖。","倒回鸡蛋翻匀，撒葱花后出锅。"]',
    '西红柿炒出汤汁后再放鸡蛋，口感更入味。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 10, 1787241600000, 1787241600000
  ),
  (
    'recipe-template-pepper-pork', 'pepper_shredded_pork', '青椒肉丝', '炒菜', '微辣', '[]',
    '["猪里脊和青椒切丝，姜蒜切末。","肉丝用生抽、料酒和少量淀粉抓匀腌制十分钟。","热锅放油，将肉丝快速滑炒至变色后盛出。","炒香姜蒜和青椒，倒回肉丝调味后翻匀。"]',
    '肉丝不要久炒，变色后先盛出可以保持嫩滑。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 20, 1787241600000, 1787241600000
  ),
  (
    'recipe-template-garlic-spinach', 'garlic_water_spinach', '蒜蓉空心菜', '青菜', '不辣', '[]',
    '["空心菜洗净沥干，切成适口长段，蒜切末。","热锅放油，小火炒香一半蒜末。","转大火放入空心菜快速翻炒。","菜梗断生后加盐和剩余蒜末，翻匀出锅。"]',
    '洗净后充分沥水，全程大火快炒可保持翠绿。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 30, 1787241600000, 1787241600000
  ),
  (
    'recipe-template-oyster-lettuce', 'oyster_sauce_lettuce', '蚝油生菜', '青菜', '不辣', '[]',
    '["生菜逐片洗净沥干，蒜切末。","沸水中加少量盐和油，将生菜快速焯熟后装盘。","锅中放少量油炒香蒜末，加入蚝油、生抽和少量清水。","料汁煮开后均匀淋在生菜上。"]',
    '生菜焯水约二十秒即可，时间过长会失去脆嫩口感。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 40, 1787241600000, 1787241600000
  ),
  (
    'recipe-template-rib-soup', 'winter_melon_rib_soup', '排骨冬瓜汤', '炖汤', '不辣', '[]',
    '["排骨冷水下锅焯去浮沫，冬瓜去皮切块，姜切片。","排骨和姜片放入汤锅，加入足量热水。","小火炖约四十分钟，再放入冬瓜。","继续炖十五分钟至冬瓜透明，按口味加盐。"]',
    '冬瓜后放可避免炖得过软，汤也会更清爽。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 50, 1787241600000, 1787241600000
  ),
  (
    'recipe-template-brisket-soup', 'tomato_beef_brisket_soup', '番茄牛腩汤', '炖汤', '不辣', '[]',
    '["牛腩切块焯水，西红柿切块，洋葱切片，姜切片。","炒香洋葱和姜片，加入一半西红柿炒出汤汁。","放入牛腩和足量热水，小火炖约一小时。","加入剩余西红柿再炖十五分钟，按口味调味。"]',
    '分两次放西红柿，汤底浓郁且能保留部分果肉口感。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 60, 1787241600000, 1787241600000
  ),
  (
    'recipe-template-braised-pork', 'braised_pork', '红烧肉', '红烧', '不辣', '[]',
    '["五花肉切块后焯水，姜切片，葱切段。","锅中放少量油和冰糖，小火炒出糖色。","放入五花肉翻炒上色，加入姜葱、料酒、生抽和老抽。","加热水没过肉，小火炖约五十分钟后收汁。"]',
    '炒糖色使用小火，颜色变为琥珀色后立即下肉。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 70, 1787241600000, 1787241600000
  ),
  (
    'recipe-template-braised-eggplant', 'braised_eggplant', '红烧茄子', '红烧', '不辣', '[]',
    '["茄子切条并加少量盐腌十分钟，挤去多余水分，蒜切末。","锅中放油，将茄子煎软后盛出。","炒香肉末和蒜末，加入生抽、少量老抽和清水。","放回茄子焖煮片刻，水淀粉勾薄芡后出锅。"]',
    '茄子先用盐腌制，可以减少煎制时的吸油量。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 80, 1787241600000, 1787241600000
  ),
  (
    'recipe-template-steamed-bass', 'steamed_sea_bass', '清蒸鲈鱼', '蒸菜', '不辣', '[]',
    '["鲈鱼处理干净，在鱼身两侧划刀，姜切片，葱切丝。","鱼身铺姜片，水开后上锅大火蒸八至十分钟。","倒掉盘中汤汁并去掉旧姜片，铺上葱丝。","淋蒸鱼豉油，再浇少量热油激香。"]',
    '蒸制时间按鱼的大小调整，关火后不要长时间焖制。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 90, 1787241600000, 1787241600000
  ),
  (
    'recipe-template-steamed-egg', 'steamed_egg_with_pork', '肉末蒸蛋', '蒸菜', '不辣', '[]',
    '["鸡蛋打散，加入温水和少量盐搅匀后过滤。","蛋液盖上耐高温保鲜膜或盘子，水开后蒸十分钟。","肉末炒散，用生抽调味后铺在蛋羹上。","继续蒸三分钟，出锅后撒葱花。"]',
    '蛋液过滤并遮盖蒸制，表面会更平整细嫩。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 100, 1787241600000, 1787241600000
  );

INSERT OR IGNORE INTO recipe_template_ingredients (
  id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder
)
SELECT 'template-ingredient-tomato-eggs-tomato', 'recipe-template-tomato-eggs', id, '西红柿', '300g', 300, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '西红柿'
UNION ALL SELECT 'template-ingredient-tomato-eggs-egg', 'recipe-template-tomato-eggs', id, '鸡蛋', '3个', 3, '个', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '鸡蛋'
UNION ALL SELECT 'template-ingredient-tomato-eggs-scallion', 'recipe-template-tomato-eggs', id, '葱', '20g', 20, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '葱'
;
INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-pepper-pork-pork', 'recipe-template-pepper-pork', id, '猪里脊', '250g', 250, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '猪里脊'
UNION ALL SELECT 'template-ingredient-pepper-pork-pepper', 'recipe-template-pepper-pork', id, '青椒', '2个', 2, '个', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '青椒'
UNION ALL SELECT 'template-ingredient-pepper-pork-ginger', 'recipe-template-pepper-pork', id, '姜', '10g', 10, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '姜'
UNION ALL SELECT 'template-ingredient-pepper-pork-garlic', 'recipe-template-pepper-pork', id, '蒜', '10g', 10, 'g', NULL, 40 FROM ingredient_catalog WHERE canonicalName = '蒜'
;
INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-spinach-spinach', 'recipe-template-garlic-spinach', id, '空心菜', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '空心菜'
UNION ALL SELECT 'template-ingredient-spinach-garlic', 'recipe-template-garlic-spinach', id, '蒜', '20g', 20, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '蒜'
;
INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-lettuce-lettuce', 'recipe-template-oyster-lettuce', id, '生菜', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '生菜'
UNION ALL SELECT 'template-ingredient-lettuce-garlic', 'recipe-template-oyster-lettuce', id, '蒜', '15g', 15, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '蒜'
;
INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-rib-soup-ribs', 'recipe-template-rib-soup', id, '排骨', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '排骨'
UNION ALL SELECT 'template-ingredient-rib-soup-melon', 'recipe-template-rib-soup', id, '冬瓜', '500g', 500, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '冬瓜'
UNION ALL SELECT 'template-ingredient-rib-soup-ginger', 'recipe-template-rib-soup', id, '姜', '15g', 15, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '姜'
;
INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-brisket-soup-beef', 'recipe-template-brisket-soup', id, '牛腩', '500g', 500, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '牛腩'
UNION ALL SELECT 'template-ingredient-brisket-soup-tomato', 'recipe-template-brisket-soup', id, '西红柿', '400g', 400, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '西红柿'
UNION ALL SELECT 'template-ingredient-brisket-soup-onion', 'recipe-template-brisket-soup', id, '洋葱', '1个', 1, '个', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '洋葱'
UNION ALL SELECT 'template-ingredient-brisket-soup-ginger', 'recipe-template-brisket-soup', id, '姜', '15g', 15, 'g', NULL, 40 FROM ingredient_catalog WHERE canonicalName = '姜'
;
INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-braised-pork-pork', 'recipe-template-braised-pork', id, '五花肉', '500g', 500, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '五花肉'
UNION ALL SELECT 'template-ingredient-braised-pork-ginger', 'recipe-template-braised-pork', id, '姜', '15g', 15, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '姜'
UNION ALL SELECT 'template-ingredient-braised-pork-scallion', 'recipe-template-braised-pork', id, '葱', '20g', 20, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '葱'
;
INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-eggplant-eggplant', 'recipe-template-braised-eggplant', id, '茄子', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '茄子'
UNION ALL SELECT 'template-ingredient-eggplant-pork', 'recipe-template-braised-eggplant', id, '猪肉末', '100g', 100, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '猪肉末'
UNION ALL SELECT 'template-ingredient-eggplant-garlic', 'recipe-template-braised-eggplant', id, '蒜', '20g', 20, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '蒜'
;
INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-bass-fish', 'recipe-template-steamed-bass', id, '鲈鱼', '1只', 1, '只', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '鲈鱼'
UNION ALL SELECT 'template-ingredient-bass-ginger', 'recipe-template-steamed-bass', id, '姜', '20g', 20, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '姜'
UNION ALL SELECT 'template-ingredient-bass-scallion', 'recipe-template-steamed-bass', id, '葱', '30g', 30, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '葱'
;
INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-steamed-egg-egg', 'recipe-template-steamed-egg', id, '鸡蛋', '3个', 3, '个', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '鸡蛋'
UNION ALL SELECT 'template-ingredient-steamed-egg-pork', 'recipe-template-steamed-egg', id, '猪肉末', '100g', 100, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '猪肉末'
UNION ALL SELECT 'template-ingredient-steamed-egg-water', 'recipe-template-steamed-egg', id, '温水', '180ml', 180, 'ml', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '温水'
UNION ALL SELECT 'template-ingredient-steamed-egg-scallion', 'recipe-template-steamed-egg', id, '葱', '10g', 10, 'g', NULL, 40 FROM ingredient_catalog WHERE canonicalName = '葱';
