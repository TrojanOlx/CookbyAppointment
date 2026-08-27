PRAGMA foreign_keys = ON;

-- Expand the public starter library without changing any family-owned recipes.
INSERT OR IGNORE INTO ingredient_catalog
  (id, canonicalName, category, defaultUnit, createdAt, updatedAt)
VALUES
  ('template-catalog-chicken-breast', '鸡胸肉', '肉类', 'g', 1787760000000, 1787760000000),
  ('template-catalog-peanut', '花生米', '其他', 'g', 1787760000000, 1787760000000),
  ('template-catalog-cucumber', '黄瓜', '蔬菜', '个', 1787760000000, 1787760000000),
  ('template-catalog-wood-ear', '木耳', '蔬菜', 'g', 1787760000000, 1787760000000),
  ('template-catalog-beef', '牛肉', '肉类', 'g', 1787760000000, 1787760000000),
  ('template-catalog-small-bok-choy', '小白菜', '蔬菜', 'g', 1787760000000, 1787760000000),
  ('template-catalog-potato', '土豆', '蔬菜', 'g', 1787760000000, 1787760000000),
  ('template-catalog-dried-chili', '干辣椒', '调味', 'g', 1787760000000, 1787760000000),
  ('template-catalog-broccoli', '西兰花', '蔬菜', 'g', 1787760000000, 1787760000000),
  ('template-catalog-carrot', '胡萝卜', '蔬菜', 'g', 1787760000000, 1787760000000),
  ('template-catalog-shiitake', '香菇', '蔬菜', 'g', 1787760000000, 1787760000000),
  ('template-catalog-rapeseed', '油菜', '蔬菜', 'g', 1787760000000, 1787760000000),
  ('template-catalog-corn', '玉米', '蔬菜', '个', 1787760000000, 1787760000000),
  ('template-catalog-seaweed', '紫菜', '其他', 'g', 1787760000000, 1787760000000),
  ('template-catalog-chicken-thigh', '鸡腿肉', '肉类', 'g', 1787760000000, 1787760000000),
  ('template-catalog-daikon', '白萝卜', '蔬菜', 'g', 1787760000000, 1787760000000),
  ('template-catalog-chicken-wing', '鸡翅', '肉类', '只', 1787760000000, 1787760000000),
  ('template-catalog-cola', '可乐', '其他', 'ml', 1787760000000, 1787760000000),
  ('template-catalog-tofu', '豆腐', '豆制品', 'g', 1787760000000, 1787760000000),
  ('template-catalog-rice-flour', '蒸肉米粉', '其他', 'g', 1787760000000, 1787760000000),
  ('template-catalog-shrimp', '虾', '水产', '只', 1787760000000, 1787760000000),
  ('template-catalog-fermented-black-bean', '豆豉', '调味', 'g', 1787760000000, 1787760000000);

INSERT OR IGNORE INTO recipe_templates (
  id, templateKey, name, type, spicy, images, steps, notice, remark, reference,
  status, sortOrder, createdAt, updatedAt
)
VALUES
  (
    'recipe-template-kung-pao-chicken', 'kung_pao_chicken', '宫保鸡丁', '炒菜', '微辣', '[]',
    '["鸡胸肉切丁，用生抽、料酒和少量淀粉抓匀腌制十分钟。","黄瓜切丁，准备花生米和调味汁。","热锅放油，将鸡丁滑炒至变色后盛出。","炒香干辣椒和葱姜，放入鸡丁、黄瓜及料汁翻炒。","出锅前放花生米，快速翻匀。"]',
    '花生米最后放入，能保持酥脆口感。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 110, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-moo-shu-pork', 'moo_shu_pork', '木须肉', '炒菜', '不辣', '[]',
    '["木耳泡发洗净，猪里脊切片，鸡蛋打散。","热锅放油，将鸡蛋炒熟后盛出。","肉片滑炒至变色，放入木耳翻炒。","倒回鸡蛋，加生抽和盐调味后翻匀。"]',
    '木耳泡发后要洗净根部，肉片变色即可避免炒老。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 120, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-onion-beef', 'onion_stir_fried_beef', '洋葱炒牛肉', '炒菜', '不辣', '[]',
    '["牛肉逆纹切薄片，用生抽、料酒和少量淀粉腌制。","洋葱和青椒切块。","热锅放油，将牛肉快速滑炒至变色后盛出。","炒软洋葱和青椒，倒回牛肉调味后翻匀。"]',
    '牛肉要逆纹切片并大火快炒，口感更嫩。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 130, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-cucumber-eggs', 'cucumber_scrambled_eggs', '黄瓜炒鸡蛋', '炒菜', '不辣', '[]',
    '["黄瓜切片，鸡蛋打散，葱切末。","热锅放油，将鸡蛋炒至凝固后盛出。","放入黄瓜大火翻炒至断生。","倒回鸡蛋，加盐调味并撒葱花。"]',
    '黄瓜不宜久炒，断生即可保持清脆。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 140, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-stir-fried-bok-choy', 'stir_fried_small_bok_choy', '清炒小白菜', '青菜', '不辣', '[]',
    '["小白菜洗净沥干，菜梗和菜叶分开，姜蒜切末。","热锅放油，炒香姜蒜。","先放菜梗大火翻炒片刻，再放菜叶。","加盐调味，菜叶变软后立即出锅。"]',
    '菜梗先下锅、菜叶后下锅，成熟度更均匀。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 150, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-hot-sour-potato', 'hot_sour_shredded_potato', '酸辣土豆丝', '青菜', '中辣', '[]',
    '["土豆去皮切细丝，用清水冲洗掉表面淀粉。","青椒切丝，干辣椒切段。","热锅放油炒香干辣椒，放入土豆丝大火翻炒。","加入青椒、盐和米醋，炒至断生后出锅。"]',
    '土豆丝切好后冲洗并沥干，炒制时更爽脆。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 160, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-stir-fried-broccoli', 'stir_fried_broccoli', '清炒西兰花', '青菜', '不辣', '[]',
    '["西兰花切小朵浸泡洗净，胡萝卜切片，蒜切末。","沸水中加少量盐，将西兰花和胡萝卜焯至断生。","热锅放油炒香蒜末，放入蔬菜翻炒。","加盐调味，快速翻匀后出锅。"]',
    '焯水时间不宜过长，西兰花变翠绿即可。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 170, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-shiitake-rapeseed', 'shiitake_rapeseed', '香菇油菜', '青菜', '不辣', '[]',
    '["香菇洗净切片，油菜洗净，蒜切末。","沸水中加少量盐和油，将油菜焯熟后摆盘。","热锅放油炒香蒜末和香菇。","加入蚝油和少量清水煮开，淋在油菜上。"]',
    '油菜焯熟后及时沥水，能保持颜色和口感。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 180, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-corn-rib-soup', 'corn_rib_soup', '玉米排骨汤', '炖汤', '不辣', '[]',
    '["排骨冷水下锅焯去浮沫，玉米切段，胡萝卜切块。","排骨放入汤锅，加入足量热水并煮开。","放入玉米和胡萝卜，小火炖约五十分钟。","食材软熟后按口味加盐。"]',
    '排骨焯水后用热水炖煮，汤味更清甜。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 190, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-seaweed-egg-soup', 'seaweed_egg_drop_soup', '紫菜蛋花汤', '炖汤', '不辣', '[]',
    '["紫菜撕成小片，鸡蛋打散，葱切末。","锅中加水煮开，放入紫菜煮一分钟。","保持微沸，沿锅边缓慢淋入蛋液。","蛋花凝固后加盐调味，撒葱花出锅。"]',
    '淋入蛋液后不要立即搅动，蛋花会更完整。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 200, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-shiitake-chicken-stew', 'shiitake_chicken_stew', '香菇炖鸡', '炖汤', '不辣', '[]',
    '["鸡腿肉切块焯水，香菇洗净，姜切片。","锅中放少量油，炒香姜片和鸡块。","加入香菇和足量热水，煮开后转小火。","炖约四十分钟至鸡肉软熟，按口味加盐。"]',
    '使用鸡腿肉炖煮不易发柴，汤味也更浓郁。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 210, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-daikon-brisket-soup', 'daikon_beef_brisket_soup', '萝卜牛腩汤', '炖汤', '不辣', '[]',
    '["牛腩切块焯水，白萝卜切滚刀块，姜切片。","牛腩和姜片放入汤锅，加入足量热水。","小火炖约一小时，再放入白萝卜。","继续炖二十分钟至萝卜软熟，按口味加盐。"]',
    '白萝卜后放可以避免炖散，并保持清甜口感。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 220, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-cola-wings', 'cola_chicken_wings', '可乐鸡翅', '红烧', '不辣', '[]',
    '["鸡翅两面划刀，冷水下锅焯水，姜切片。","锅中放少量油，将鸡翅煎至两面微黄。","加入姜片、生抽和可乐，大火煮开。","转中小火焖二十分钟，最后大火收汁。"]',
    '收汁时要勤翻动，避免含糖汤汁粘锅。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 230, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-braised-ribs', 'braised_pork_ribs', '红烧排骨', '红烧', '不辣', '[]',
    '["排骨冷水下锅焯去浮沫，姜切片，葱切段。","锅中放少量油和冰糖，小火炒出糖色。","放入排骨翻炒上色，加入姜葱、生抽和料酒。","加热水没过排骨，小火炖四十分钟后收汁。"]',
    '排骨焯水后沥干再炒，避免热油飞溅。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 240, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-braised-chicken', 'braised_chicken_with_shiitake', '黄焖鸡', '红烧', '微辣', '[]',
    '["鸡腿肉切块，香菇切片，青椒切块。","热锅放油，将鸡块炒至表面微黄。","加入香菇、生抽、少量老抽和热水，焖煮二十分钟。","放入青椒翻炒至断生，大火收浓汤汁。"]',
    '青椒最后放入，能保留清香和脆嫩口感。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 250, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-braised-tofu', 'braised_tofu', '红烧豆腐', '红烧', '不辣', '[]',
    '["豆腐切块，葱切末，猪肉末准备好。","热锅放油，将豆腐煎至两面微黄后盛出。","炒散肉末，加入生抽、少量老抽和清水。","放回豆腐焖煮五分钟，撒葱花后出锅。"]',
    '豆腐煎定型后再翻动，烹煮时不容易碎。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 260, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-steamed-pork-rice-flour', 'steamed_pork_with_rice_flour', '粉蒸肉', '蒸菜', '不辣', '[]',
    '["五花肉切薄片，用生抽、料酒和少量糖腌制。","土豆切块铺在碗底。","腌好的肉片均匀裹上蒸肉米粉，码在土豆上。","水开后上锅蒸约五十分钟，至肉片软糯。"]',
    '米粉裹匀后静置十分钟吸收水分，蒸出来更软糯。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 270, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-garlic-steamed-shrimp', 'garlic_steamed_shrimp', '蒜蓉蒸虾', '蒸菜', '不辣', '[]',
    '["虾剪去须脚并开背去虾线，蒜和葱切末。","蒜末用少量热油炒香，加生抽调成蒜蓉汁。","将蒜蓉汁铺在虾上，水开后大火蒸六分钟。","出锅撒葱花，再淋少量热油。"]',
    '虾变红卷曲即可，蒸制过久肉质会变老。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 280, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-shiitake-steamed-chicken', 'shiitake_steamed_chicken', '香菇蒸鸡', '蒸菜', '不辣', '[]',
    '["鸡腿肉切块，香菇切片，姜切丝。","鸡肉加入生抽、料酒和少量淀粉腌制十五分钟。","拌入香菇和姜丝，平铺在盘中。","水开后上锅大火蒸十五分钟，确认熟透后出锅。"]',
    '食材尽量平铺，受热更均匀且鸡肉更嫩。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 290, 1787760000000, 1787760000000
  ),
  (
    'recipe-template-black-bean-steamed-ribs', 'black_bean_steamed_ribs', '豆豉蒸排骨', '蒸菜', '不辣', '[]',
    '["排骨剁小块并浸泡去血水，豆豉和蒜切碎。","排骨加入豆豉、蒜末、生抽和少量淀粉拌匀。","腌制二十分钟后平铺在盘中。","水开后上锅大火蒸二十五分钟，确认熟透后出锅。"]',
    '排骨块不宜过大，平铺蒸制更容易熟透入味。', '系统公共模板，导入后可自由修改或删除。', '',
    'active', 300, 1787760000000, 1787760000000
  );

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-kung-pao-chicken', 'recipe-template-kung-pao-chicken', id, '鸡胸肉', '300g', 300, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '鸡胸肉'
UNION ALL SELECT 'template-ingredient-kung-pao-peanut', 'recipe-template-kung-pao-chicken', id, '花生米', '80g', 80, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '花生米'
UNION ALL SELECT 'template-ingredient-kung-pao-cucumber', 'recipe-template-kung-pao-chicken', id, '黄瓜', '1个', 1, '个', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '黄瓜';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-moo-shu-pork', 'recipe-template-moo-shu-pork', id, '猪里脊', '200g', 200, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '猪里脊'
UNION ALL SELECT 'template-ingredient-moo-shu-egg', 'recipe-template-moo-shu-pork', id, '鸡蛋', '2个', 2, '个', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '鸡蛋'
UNION ALL SELECT 'template-ingredient-moo-shu-wood-ear', 'recipe-template-moo-shu-pork', id, '木耳', '50g', 50, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '木耳';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-onion-beef-beef', 'recipe-template-onion-beef', id, '牛肉', '250g', 250, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '牛肉'
UNION ALL SELECT 'template-ingredient-onion-beef-onion', 'recipe-template-onion-beef', id, '洋葱', '1个', 1, '个', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '洋葱'
UNION ALL SELECT 'template-ingredient-onion-beef-pepper', 'recipe-template-onion-beef', id, '青椒', '1个', 1, '个', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '青椒';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-cucumber-eggs-cucumber', 'recipe-template-cucumber-eggs', id, '黄瓜', '1个', 1, '个', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '黄瓜'
UNION ALL SELECT 'template-ingredient-cucumber-eggs-egg', 'recipe-template-cucumber-eggs', id, '鸡蛋', '3个', 3, '个', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '鸡蛋'
UNION ALL SELECT 'template-ingredient-cucumber-eggs-scallion', 'recipe-template-cucumber-eggs', id, '葱', '10g', 10, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '葱';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-bok-choy-vegetable', 'recipe-template-stir-fried-bok-choy', id, '小白菜', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '小白菜'
UNION ALL SELECT 'template-ingredient-bok-choy-garlic', 'recipe-template-stir-fried-bok-choy', id, '蒜', '15g', 15, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '蒜'
UNION ALL SELECT 'template-ingredient-bok-choy-ginger', 'recipe-template-stir-fried-bok-choy', id, '姜', '5g', 5, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '姜';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-potato-main', 'recipe-template-hot-sour-potato', id, '土豆', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '土豆'
UNION ALL SELECT 'template-ingredient-potato-pepper', 'recipe-template-hot-sour-potato', id, '青椒', '1个', 1, '个', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '青椒'
UNION ALL SELECT 'template-ingredient-potato-chili', 'recipe-template-hot-sour-potato', id, '干辣椒', '10g', 10, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '干辣椒';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-broccoli-main', 'recipe-template-stir-fried-broccoli', id, '西兰花', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '西兰花'
UNION ALL SELECT 'template-ingredient-broccoli-carrot', 'recipe-template-stir-fried-broccoli', id, '胡萝卜', '100g', 100, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '胡萝卜'
UNION ALL SELECT 'template-ingredient-broccoli-garlic', 'recipe-template-stir-fried-broccoli', id, '蒜', '15g', 15, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '蒜';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-shiitake-rapeseed-mushroom', 'recipe-template-shiitake-rapeseed', id, '香菇', '150g', 150, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '香菇'
UNION ALL SELECT 'template-ingredient-shiitake-rapeseed-vegetable', 'recipe-template-shiitake-rapeseed', id, '油菜', '400g', 400, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '油菜'
UNION ALL SELECT 'template-ingredient-shiitake-rapeseed-garlic', 'recipe-template-shiitake-rapeseed', id, '蒜', '15g', 15, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '蒜';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-corn-rib-soup-ribs', 'recipe-template-corn-rib-soup', id, '排骨', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '排骨'
UNION ALL SELECT 'template-ingredient-corn-rib-soup-corn', 'recipe-template-corn-rib-soup', id, '玉米', '1个', 1, '个', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '玉米'
UNION ALL SELECT 'template-ingredient-corn-rib-soup-carrot', 'recipe-template-corn-rib-soup', id, '胡萝卜', '150g', 150, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '胡萝卜';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-seaweed-soup-seaweed', 'recipe-template-seaweed-egg-soup', id, '紫菜', '15g', 15, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '紫菜'
UNION ALL SELECT 'template-ingredient-seaweed-soup-egg', 'recipe-template-seaweed-egg-soup', id, '鸡蛋', '2个', 2, '个', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '鸡蛋'
UNION ALL SELECT 'template-ingredient-seaweed-soup-scallion', 'recipe-template-seaweed-egg-soup', id, '葱', '10g', 10, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '葱';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-chicken-stew-chicken', 'recipe-template-shiitake-chicken-stew', id, '鸡腿肉', '500g', 500, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '鸡腿肉'
UNION ALL SELECT 'template-ingredient-chicken-stew-shiitake', 'recipe-template-shiitake-chicken-stew', id, '香菇', '150g', 150, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '香菇'
UNION ALL SELECT 'template-ingredient-chicken-stew-ginger', 'recipe-template-shiitake-chicken-stew', id, '姜', '15g', 15, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '姜';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-daikon-brisket-beef', 'recipe-template-daikon-brisket-soup', id, '牛腩', '500g', 500, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '牛腩'
UNION ALL SELECT 'template-ingredient-daikon-brisket-radish', 'recipe-template-daikon-brisket-soup', id, '白萝卜', '500g', 500, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '白萝卜'
UNION ALL SELECT 'template-ingredient-daikon-brisket-ginger', 'recipe-template-daikon-brisket-soup', id, '姜', '15g', 15, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '姜';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-cola-wings-chicken', 'recipe-template-cola-wings', id, '鸡翅', '8只', 8, '只', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '鸡翅'
UNION ALL SELECT 'template-ingredient-cola-wings-cola', 'recipe-template-cola-wings', id, '可乐', '330ml', 330, 'ml', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '可乐'
UNION ALL SELECT 'template-ingredient-cola-wings-ginger', 'recipe-template-cola-wings', id, '姜', '15g', 15, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '姜';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-braised-ribs-ribs', 'recipe-template-braised-ribs', id, '排骨', '500g', 500, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '排骨'
UNION ALL SELECT 'template-ingredient-braised-ribs-ginger', 'recipe-template-braised-ribs', id, '姜', '15g', 15, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '姜'
UNION ALL SELECT 'template-ingredient-braised-ribs-scallion', 'recipe-template-braised-ribs', id, '葱', '20g', 20, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '葱';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-braised-chicken-chicken', 'recipe-template-braised-chicken', id, '鸡腿肉', '500g', 500, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '鸡腿肉'
UNION ALL SELECT 'template-ingredient-braised-chicken-shiitake', 'recipe-template-braised-chicken', id, '香菇', '150g', 150, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '香菇'
UNION ALL SELECT 'template-ingredient-braised-chicken-pepper', 'recipe-template-braised-chicken', id, '青椒', '2个', 2, '个', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '青椒';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-braised-tofu-tofu', 'recipe-template-braised-tofu', id, '豆腐', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '豆腐'
UNION ALL SELECT 'template-ingredient-braised-tofu-pork', 'recipe-template-braised-tofu', id, '猪肉末', '100g', 100, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '猪肉末'
UNION ALL SELECT 'template-ingredient-braised-tofu-scallion', 'recipe-template-braised-tofu', id, '葱', '10g', 10, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '葱';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-powdered-pork-pork', 'recipe-template-steamed-pork-rice-flour', id, '五花肉', '400g', 400, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '五花肉'
UNION ALL SELECT 'template-ingredient-powdered-pork-flour', 'recipe-template-steamed-pork-rice-flour', id, '蒸肉米粉', '150g', 150, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '蒸肉米粉'
UNION ALL SELECT 'template-ingredient-powdered-pork-potato', 'recipe-template-steamed-pork-rice-flour', id, '土豆', '300g', 300, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '土豆';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-garlic-shrimp-shrimp', 'recipe-template-garlic-steamed-shrimp', id, '虾', '12只', 12, '只', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '虾'
UNION ALL SELECT 'template-ingredient-garlic-shrimp-garlic', 'recipe-template-garlic-steamed-shrimp', id, '蒜', '30g', 30, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '蒜'
UNION ALL SELECT 'template-ingredient-garlic-shrimp-scallion', 'recipe-template-garlic-steamed-shrimp', id, '葱', '10g', 10, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '葱';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-steamed-chicken-chicken', 'recipe-template-shiitake-steamed-chicken', id, '鸡腿肉', '500g', 500, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '鸡腿肉'
UNION ALL SELECT 'template-ingredient-steamed-chicken-shiitake', 'recipe-template-shiitake-steamed-chicken', id, '香菇', '150g', 150, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '香菇'
UNION ALL SELECT 'template-ingredient-steamed-chicken-ginger', 'recipe-template-shiitake-steamed-chicken', id, '姜', '15g', 15, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '姜';

INSERT OR IGNORE INTO recipe_template_ingredients
  (id, templateId, ingredientId, name, amount, quantity, unit, legacyAmount, sortOrder)
SELECT 'template-ingredient-black-bean-ribs-ribs', 'recipe-template-black-bean-steamed-ribs', id, '排骨', '500g', 500, 'g', NULL, 10 FROM ingredient_catalog WHERE canonicalName = '排骨'
UNION ALL SELECT 'template-ingredient-black-bean-ribs-bean', 'recipe-template-black-bean-steamed-ribs', id, '豆豉', '30g', 30, 'g', NULL, 20 FROM ingredient_catalog WHERE canonicalName = '豆豉'
UNION ALL SELECT 'template-ingredient-black-bean-ribs-garlic', 'recipe-template-black-bean-steamed-ribs', id, '蒜', '20g', 20, 'g', NULL, 30 FROM ingredient_catalog WHERE canonicalName = '蒜';
