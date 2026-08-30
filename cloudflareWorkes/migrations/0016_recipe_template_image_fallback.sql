PRAGMA foreign_keys = ON;

-- 0014 could not assign seeded assets in a completely empty environment because
-- platform_files requires a user-backed uploader. Keep a non-login identity only
-- when neither an active administrator nor an active user is available.
INSERT OR IGNORE INTO users (
  id, openid, nickName, gender, country, province, city, language,
  isAdmin, createTime, updateTime, status
)
SELECT
  'system-recipe-template-assets', '__system_recipe_template_assets__', '系统菜谱资源',
  0, '', '', '', 'zh_CN', 0, 1787840000000, 1787840000000, 'suspended'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_admins WHERE status = 'active'
)
AND NOT EXISTS (
  SELECT 1 FROM users WHERE status = 'active'
);

-- Upload the matching objects from assets/recipe-templates/v1 before applying remotely.
WITH assets(id, objectKey, name, contentType, size) AS (
  VALUES
    ('platform-recipe-image-v1-tomato-scrambled-eggs', 'platform/recipe-templates/seed/v1/tomato-scrambled-eggs.jpg', 'tomato-scrambled-eggs.jpg', 'image/jpeg', 206843),
    ('platform-recipe-image-v1-pepper-shredded-pork', 'platform/recipe-templates/seed/v1/pepper-shredded-pork.jpg', 'pepper-shredded-pork.jpg', 'image/jpeg', 211277),
    ('platform-recipe-image-v1-garlic-water-spinach', 'platform/recipe-templates/seed/v1/garlic-water-spinach.jpg', 'garlic-water-spinach.jpg', 'image/jpeg', 225658),
    ('platform-recipe-image-v1-oyster-sauce-lettuce', 'platform/recipe-templates/seed/v1/oyster-sauce-lettuce.jpg', 'oyster-sauce-lettuce.jpg', 'image/jpeg', 194022),
    ('platform-recipe-image-v1-winter-melon-rib-soup', 'platform/recipe-templates/seed/v1/winter-melon-rib-soup.jpg', 'winter-melon-rib-soup.jpg', 'image/jpeg', 131915),
    ('platform-recipe-image-v1-tomato-beef-brisket-soup', 'platform/recipe-templates/seed/v1/tomato-beef-brisket-soup.jpg', 'tomato-beef-brisket-soup.jpg', 'image/jpeg', 168231),
    ('platform-recipe-image-v1-braised-pork', 'platform/recipe-templates/seed/v1/braised-pork.jpg', 'braised-pork.jpg', 'image/jpeg', 184274),
    ('platform-recipe-image-v1-braised-eggplant', 'platform/recipe-templates/seed/v1/braised-eggplant.jpg', 'braised-eggplant.jpg', 'image/jpeg', 288303),
    ('platform-recipe-image-v1-steamed-sea-bass', 'platform/recipe-templates/seed/v1/steamed-sea-bass.jpg', 'steamed-sea-bass.jpg', 'image/jpeg', 154678),
    ('platform-recipe-image-v1-steamed-egg-with-pork', 'platform/recipe-templates/seed/v1/steamed-egg-with-pork.jpg', 'steamed-egg-with-pork.jpg', 'image/jpeg', 181021),
    ('platform-recipe-image-v1-kung-pao-chicken', 'platform/recipe-templates/seed/v1/kung-pao-chicken.jpg', 'kung-pao-chicken.jpg', 'image/jpeg', 201000),
    ('platform-recipe-image-v1-moo-shu-pork', 'platform/recipe-templates/seed/v1/moo-shu-pork.jpg', 'moo-shu-pork.jpg', 'image/jpeg', 224287),
    ('platform-recipe-image-v1-onion-stir-fried-beef', 'platform/recipe-templates/seed/v1/onion-stir-fried-beef.jpg', 'onion-stir-fried-beef.jpg', 'image/jpeg', 212187),
    ('platform-recipe-image-v1-cucumber-scrambled-eggs', 'platform/recipe-templates/seed/v1/cucumber-scrambled-eggs.jpg', 'cucumber-scrambled-eggs.jpg', 'image/jpeg', 218171),
    ('platform-recipe-image-v1-stir-fried-small-bok-choy', 'platform/recipe-templates/seed/v1/stir-fried-small-bok-choy.jpg', 'stir-fried-small-bok-choy.jpg', 'image/jpeg', 184756),
    ('platform-recipe-image-v1-hot-sour-shredded-potato', 'platform/recipe-templates/seed/v1/hot-sour-shredded-potato.jpg', 'hot-sour-shredded-potato.jpg', 'image/jpeg', 204356),
    ('platform-recipe-image-v1-stir-fried-broccoli', 'platform/recipe-templates/seed/v1/stir-fried-broccoli.jpg', 'stir-fried-broccoli.jpg', 'image/jpeg', 188469),
    ('platform-recipe-image-v1-shiitake-rapeseed', 'platform/recipe-templates/seed/v1/shiitake-rapeseed.jpg', 'shiitake-rapeseed.jpg', 'image/jpeg', 188712),
    ('platform-recipe-image-v1-corn-rib-soup', 'platform/recipe-templates/seed/v1/corn-rib-soup.jpg', 'corn-rib-soup.jpg', 'image/jpeg', 178597),
    ('platform-recipe-image-v1-seaweed-egg-drop-soup', 'platform/recipe-templates/seed/v1/seaweed-egg-drop-soup.jpg', 'seaweed-egg-drop-soup.jpg', 'image/jpeg', 187585),
    ('platform-recipe-image-v1-shiitake-chicken-stew', 'platform/recipe-templates/seed/v1/shiitake-chicken-stew.jpg', 'shiitake-chicken-stew.jpg', 'image/jpeg', 197869),
    ('platform-recipe-image-v1-daikon-beef-brisket-soup', 'platform/recipe-templates/seed/v1/daikon-beef-brisket-soup.jpg', 'daikon-beef-brisket-soup.jpg', 'image/jpeg', 131224),
    ('platform-recipe-image-v1-cola-chicken-wings', 'platform/recipe-templates/seed/v1/cola-chicken-wings.jpg', 'cola-chicken-wings.jpg', 'image/jpeg', 241665),
    ('platform-recipe-image-v1-braised-pork-ribs', 'platform/recipe-templates/seed/v1/braised-pork-ribs.jpg', 'braised-pork-ribs.jpg', 'image/jpeg', 243702),
    ('platform-recipe-image-v1-braised-chicken-with-shiitake', 'platform/recipe-templates/seed/v1/braised-chicken-with-shiitake.jpg', 'braised-chicken-with-shiitake.jpg', 'image/jpeg', 220701),
    ('platform-recipe-image-v1-braised-tofu', 'platform/recipe-templates/seed/v1/braised-tofu.jpg', 'braised-tofu.jpg', 'image/jpeg', 217291),
    ('platform-recipe-image-v1-steamed-pork-with-rice-flour', 'platform/recipe-templates/seed/v1/steamed-pork-with-rice-flour.jpg', 'steamed-pork-with-rice-flour.jpg', 'image/jpeg', 241669),
    ('platform-recipe-image-v1-garlic-steamed-shrimp', 'platform/recipe-templates/seed/v1/garlic-steamed-shrimp.jpg', 'garlic-steamed-shrimp.jpg', 'image/jpeg', 266507),
    ('platform-recipe-image-v1-shiitake-steamed-chicken', 'platform/recipe-templates/seed/v1/shiitake-steamed-chicken.jpg', 'shiitake-steamed-chicken.jpg', 'image/jpeg', 187710),
    ('platform-recipe-image-v1-black-bean-steamed-ribs', 'platform/recipe-templates/seed/v1/black-bean-steamed-ribs.jpg', 'black-bean-steamed-ribs.jpg', 'image/jpeg', 179214)
),
uploader_candidates(userId, priority) AS (
  SELECT userId, 0 FROM platform_admins WHERE status = 'active'
  UNION ALL
  SELECT id, 1 FROM users WHERE status = 'active'
  UNION ALL
  SELECT id, 2 FROM users WHERE id = 'system-recipe-template-assets'
),
uploader(userId) AS (
  SELECT userId FROM uploader_candidates ORDER BY priority, userId LIMIT 1
)
INSERT OR IGNORE INTO platform_files (
  id, objectKey, name, contentType, size, purpose, uploadedBy, createdAt
)
SELECT assets.id, assets.objectKey, assets.name, assets.contentType, assets.size,
  'recipe-template', uploader.userId, 1787840000000
FROM assets CROSS JOIN uploader;

WITH template_images(templateId, fileId) AS (
  VALUES
    ('recipe-template-tomato-eggs', 'platform-recipe-image-v1-tomato-scrambled-eggs'),
    ('recipe-template-pepper-pork', 'platform-recipe-image-v1-pepper-shredded-pork'),
    ('recipe-template-garlic-spinach', 'platform-recipe-image-v1-garlic-water-spinach'),
    ('recipe-template-oyster-lettuce', 'platform-recipe-image-v1-oyster-sauce-lettuce'),
    ('recipe-template-rib-soup', 'platform-recipe-image-v1-winter-melon-rib-soup'),
    ('recipe-template-brisket-soup', 'platform-recipe-image-v1-tomato-beef-brisket-soup'),
    ('recipe-template-braised-pork', 'platform-recipe-image-v1-braised-pork'),
    ('recipe-template-braised-eggplant', 'platform-recipe-image-v1-braised-eggplant'),
    ('recipe-template-steamed-bass', 'platform-recipe-image-v1-steamed-sea-bass'),
    ('recipe-template-steamed-egg', 'platform-recipe-image-v1-steamed-egg-with-pork'),
    ('recipe-template-kung-pao-chicken', 'platform-recipe-image-v1-kung-pao-chicken'),
    ('recipe-template-moo-shu-pork', 'platform-recipe-image-v1-moo-shu-pork'),
    ('recipe-template-onion-beef', 'platform-recipe-image-v1-onion-stir-fried-beef'),
    ('recipe-template-cucumber-eggs', 'platform-recipe-image-v1-cucumber-scrambled-eggs'),
    ('recipe-template-stir-fried-bok-choy', 'platform-recipe-image-v1-stir-fried-small-bok-choy'),
    ('recipe-template-hot-sour-potato', 'platform-recipe-image-v1-hot-sour-shredded-potato'),
    ('recipe-template-stir-fried-broccoli', 'platform-recipe-image-v1-stir-fried-broccoli'),
    ('recipe-template-shiitake-rapeseed', 'platform-recipe-image-v1-shiitake-rapeseed'),
    ('recipe-template-corn-rib-soup', 'platform-recipe-image-v1-corn-rib-soup'),
    ('recipe-template-seaweed-egg-soup', 'platform-recipe-image-v1-seaweed-egg-drop-soup'),
    ('recipe-template-shiitake-chicken-stew', 'platform-recipe-image-v1-shiitake-chicken-stew'),
    ('recipe-template-daikon-brisket-soup', 'platform-recipe-image-v1-daikon-beef-brisket-soup'),
    ('recipe-template-cola-wings', 'platform-recipe-image-v1-cola-chicken-wings'),
    ('recipe-template-braised-ribs', 'platform-recipe-image-v1-braised-pork-ribs'),
    ('recipe-template-braised-chicken', 'platform-recipe-image-v1-braised-chicken-with-shiitake'),
    ('recipe-template-braised-tofu', 'platform-recipe-image-v1-braised-tofu'),
    ('recipe-template-steamed-pork-rice-flour', 'platform-recipe-image-v1-steamed-pork-with-rice-flour'),
    ('recipe-template-garlic-steamed-shrimp', 'platform-recipe-image-v1-garlic-steamed-shrimp'),
    ('recipe-template-shiitake-steamed-chicken', 'platform-recipe-image-v1-shiitake-steamed-chicken'),
    ('recipe-template-black-bean-steamed-ribs', 'platform-recipe-image-v1-black-bean-steamed-ribs')
)
UPDATE recipe_templates AS template
SET images = json_array(
      '/api/platform/template-assets/' || (
        SELECT fileId FROM template_images WHERE templateId = template.id
      )
    ),
    updatedAt = MAX(updatedAt, 1787840000000),
    updatedBy = (
      SELECT file.uploadedBy
      FROM template_images image
      JOIN platform_files file ON file.id = image.fileId AND file.deletedAt IS NULL
      WHERE image.templateId = template.id
    )
WHERE EXISTS (
  SELECT 1
  FROM template_images image
  JOIN platform_files file ON file.id = image.fileId AND file.deletedAt IS NULL
  WHERE image.templateId = template.id
);
