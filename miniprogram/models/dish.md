```sql
-- 第一组菜品
INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('qingjiaochaorou1', '青椒炒肉', '炒菜', '中辣', 
  '["猪肉切丝，青椒切条。","热锅倒油，放入肉丝翻炒至变色。","加入青椒继续翻炒。","加入生抽和盐调味，炒匀即可出锅。"]', 
  '青椒不要炒太久，保持脆嫩口感。', '可根据口味加入蒜片。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pork1', 'qingjiaochaorou1', '猪肉', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pepper1', 'qingjiaochaorou1', '青椒', '2个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil1', 'qingjiaochaorou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy1', 'qingjiaochaorou1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt1', 'qingjiaochaorou1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('huiguorou1', '回锅肉', '炒菜', '中辣', 
  '["五花肉冷水下锅煮至八成熟，切片。","锅中放油，炒香蒜片和豆瓣酱。","下五花肉片煸炒出油。","加入青椒翻炒，调味后出锅。"]', 
  '五花肉要煮至八成熟再切片。', '可加入蒜苗提升风味。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pork2', 'huiguorou1', '五花肉', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pepper2', 'huiguorou1', '青椒', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('garlic1', 'huiguorou1', '大蒜', '2瓣', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('beanpaste1', 'huiguorou1', '郫县豆瓣酱', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil2', 'huiguorou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy2', 'huiguorou1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt2', 'huiguorou1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('paojiaoniurou1', '泡椒牛肉', '炒菜', '特辣', 
  '["牛肉切片，用生抽腌制10分钟。","锅中热油，爆香姜片和泡椒。","下牛肉大火快炒至变色，调味后出锅。"]', 
  '牛肉要大火快炒，保持嫩滑。', '泡椒可根据口味增减。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('beef1', 'paojiaoniurou1', '牛肉', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pickledpepper1', 'paojiaoniurou1', '泡椒', '10个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger1', 'paojiaoniurou1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil3', 'paojiaoniurou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy3', 'paojiaoniurou1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt3', 'paojiaoniurou1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('xiangcainiurou1', '香菜牛肉', '炒菜', '微辣', 
  '["牛肉切片，用生抽腌制10分钟。","锅中热油，下牛肉大火快炒至变色。","加入香菜快速翻炒，调味后出锅。"]', 
  '香菜最后放，保持清香。', '牛肉可提前用淀粉抓匀更嫩滑。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('beef2', 'xiangcainiurou1', '牛肉', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('cilantro1', 'xiangcainiurou1', '香菜', '1把', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil4', 'xiangcainiurou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy4', 'xiangcainiurou1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt4', 'xiangcainiurou1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('yaqianniurou1', '牙签牛肉', '炒菜', '特辣', 
  '["牛肉切条，用孜然粉、盐腌制10分钟。","用牙签串好牛肉条。","锅中热油，放入干辣椒爆香。","下牛肉牙签串煎至两面金黄，调味后出锅。"]', 
  '牛肉条不要切太粗，易熟。', '可撒少许白芝麻提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('beef3', 'yaqianniurou1', '牛肉', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili1', 'yaqianniurou1', '干辣椒', '10根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('cumin1', 'yaqianniurou1', '孜然粉', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil5', 'yaqianniurou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt5', 'yaqianniurou1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('toothpick1', 'yaqianniurou1', '牙签', '适量', 1718000000000, 1718000000000);

-- 第二组菜品
INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('suanlajiza1', '酸辣鸡杂', '炒菜', '特辣', 
  '["鸡杂洗净切片，焯水备用。","锅中热油，爆香姜片、泡椒和小米辣。","下鸡杂大火快炒，加入米醋和盐调味，炒匀出锅。"]', 
  '鸡杂要焯水去腥。', '可加青椒提色。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chickenmix1', 'suanlajiza1', '鸡杂', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili2', 'suanlajiza1', '小米辣', '5根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pickledpepper2', 'suanlajiza1', '泡椒', '5个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger2', 'suanlajiza1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil6', 'suanlajiza1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('vinegar1', 'suanlajiza1', '米醋', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt6', 'suanlajiza1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('jiangxilajizhua1', '江西辣鸡爪', '红烧', '特辣', 
  '["鸡爪剪指甲，焯水备用。","锅中热油，爆香姜片和干辣椒。","下鸡爪翻炒，加入生抽、盐和适量水焖煮20分钟。","收汁后出锅。"]', 
  '鸡爪要焯水去腥。', '可加花椒提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chickenfeet1', 'jiangxilajizhua1', '鸡爪', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili3', 'jiangxilajizhua1', '干辣椒', '10根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger3', 'jiangxilajizhua1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy5', 'jiangxilajizhua1', '生抽', '2勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil7', 'jiangxilajizhua1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt7', 'jiangxilajizhua1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('kelejichi1', '可乐鸡翅', '红烧', '不辣', 
  '["鸡翅洗净划口，焯水备用。","锅中热油，煎香鸡翅两面。","加入姜片、生抽、可乐，焖煮15分钟。","收汁后加盐调味即可。"]', 
  '可乐要一次性倒完，焖煮时盖盖子。', '可加葱段提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chickenwing1', 'kelejichi1', '鸡翅', '8个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('cola1', 'kelejichi1', '可乐', '1罐', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger4', 'kelejichi1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy6', 'kelejichi1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil8', 'kelejichi1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt8', 'kelejichi1', '食盐', '适量', 1718000000000, 1718000000000);

-- 第三组菜品
INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('ningmengjizhua1', '柠檬鸡爪', '红烧', '微辣', 
  '["鸡爪剪指甲，焯水煮熟，捞出过凉水。","柠檬切片，小米辣切圈。","将鸡爪、柠檬、小米辣、生抽、米醋、盐拌匀，腌制2小时。"]', 
  '鸡爪要充分冷却，口感更脆。', '可加香菜、蒜末提味。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chickenfeet2', 'ningmengjizhua1', '鸡爪', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('lemon1', 'ningmengjizhua1', '柠檬', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili4', 'ningmengjizhua1', '小米辣', '5根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy7', 'ningmengjizhua1', '生抽', '2勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('vinegar2', 'ningmengjizhua1', '米醋', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt9', 'ningmengjizhua1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('kouweixia1', '口味虾', '红烧', '特辣', 
  '["小龙虾刷洗干净，剪须去肠线。","锅中热油，爆香姜蒜、干辣椒和豆瓣酱。","下小龙虾翻炒，加入适量水焖煮10分钟。","收汁后加盐调味即可。"]', 
  '小龙虾要处理干净。', '可加啤酒焖煮更入味。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('shrimp1', 'kouweixia1', '小龙虾', '500g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili5', 'kouweixia1', '干辣椒', '15根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('garlic2', 'kouweixia1', '大蒜', '5瓣', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger5', 'kouweixia1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('beanpaste2', 'kouweixia1', '豆瓣酱', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil9', 'kouweixia1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt10', 'kouweixia1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('qingchaodabaicai1', '清炒大白菜', '青菜', '不辣', 
  '["大白菜洗净切段，蒜切片。","锅中热油，爆香蒜片。","下大白菜大火快炒，加盐调味即可。"]', 
  '大白菜炒至断生即可，避免出水太多。', '可加少许胡椒粉提味。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('cabbage1', 'qingchaodabaicai1', '大白菜', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('garlic4', 'qingchaodabaicai1', '大蒜', '3瓣', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil13', 'qingchaodabaicai1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt14', 'qingchaodabaicai1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('suanxiangjichi1', '蒜香鸡翅', '炒菜', '微辣', 
  '["鸡翅洗净划口，用生抽腌制10分钟。","锅中热油，爆香蒜末。","下鸡翅煎至两面金黄，加盐调味即可。"]', 
  '鸡翅要煎至表皮微脆。', '可加黑胡椒提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chickenwing2', 'suanxiangjichi1', '鸡翅', '8个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('garlic5', 'suanxiangjichi1', '大蒜', '5瓣', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil14', 'suanxiangjichi1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy9', 'suanxiangjichi1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt15', 'suanxiangjichi1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('baicaichaolamei1', '白菜炒腊肉', '炒菜', '中辣', 
  '["腊肉切片，白菜切段。","锅中热油，炒香腊肉。","加入白菜和蒜片翻炒，加盐调味即可。"]', 
  '腊肉先炒出油脂更香。', '可加辣椒提味。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('cabbage2', 'baicaichaolamei1', '白菜', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('bacon1', 'baicaichaolamei1', '腊肉', '100g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil15', 'baicaichaolamei1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('garlic6', 'baicaichaolamei1', '大蒜', '2瓣', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt16', 'baicaichaolamei1', '食盐', '适量', 1718000000000, 1718000000000);

-- 第四组菜品
INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('qingguachaorou1', '青瓜炒肉', '炒菜', '微辣', 
  '["猪肉切丝，青瓜切片。","锅中热油，炒熟肉丝。","加入青瓜翻炒，加生抽和盐调味即可。"]', 
  '青瓜不要炒太久，保持脆嫩。', '可加胡萝卜丝提色。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pork3', 'qingguachaorou1', '猪肉', '150g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('cucumber2', 'qingguachaorou1', '青瓜', '1根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil17', 'qingguachaorou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy10', 'qingguachaorou1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt18', 'qingguachaorou1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('lajiaochaodan1', '辣椒炒蛋', '炒菜', '中辣', 
  '["鸡蛋打散，辣椒切圈。","锅中热油，炒香辣椒。","倒入蛋液炒熟，加盐调味即可。"]', 
  '蛋液可加少许水更嫩滑。', '可用红辣椒搭配更美观。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('egg3', 'lajiaochaodan1', '鸡蛋', '3个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili6', 'lajiaochaodan1', '青辣椒', '2根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil18', 'lajiaochaodan1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt19', 'lajiaochaodan1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('laziji1', '辣子鸡', '炒菜', '特辣', 
  '["鸡腿肉切块，用生抽腌制10分钟。","锅中热油，炸鸡块至金黄捞出。","锅留底油，爆香干辣椒和花椒。","下鸡块翻炒，加盐调味即可。"]', 
  '辣椒和花椒用量可根据口味调整。', '可撒葱花提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chicken3', 'laziji1', '鸡腿肉', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili7', 'laziji1', '干辣椒', '20根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('peppercorn1', 'laziji1', '花椒', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil19', 'laziji1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy11', 'laziji1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt20', 'laziji1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('xiaochaohuangniurou1', '小炒黄牛肉', '炒菜', '特辣', 
  '["牛肉切片，用生抽腌制10分钟。","锅中热油，炒香牛肉片。","加入青红椒翻炒，加盐调味即可。"]', 
  '牛肉要大火快炒，保持嫩滑。', '可加蒜片提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('beef4', 'xiaochaohuangniurou1', '黄牛肉', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili8', 'xiaochaohuangniurou1', '青椒', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili9', 'xiaochaohuangniurou1', '红椒', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil20', 'xiaochaohuangniurou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy12', 'xiaochaohuangniurou1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt21', 'xiaochaohuangniurou1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('suanlatudousi1', '酸辣土豆丝', '青菜', '中辣', 
  '["土豆切丝泡水去淀粉。","锅中热油，炒香小米辣。","下土豆丝大火快炒，加醋和盐调味即可。"]', 
  '土豆丝要脆爽，炒至断生即可。', '可加葱花提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('potato1', 'suanlatudousi1', '土豆', '2个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili10', 'suanlatudousi1', '小米辣', '2根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('vinegar3', 'suanlatudousi1', '米醋', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil21', 'suanlatudousi1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt22', 'suanlatudousi1', '食盐', '适量', 1718000000000, 1718000000000);

-- 第五组菜品
INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('mayishangshu1', '蚂蚁上树', '炒菜', '中辣', 
  '["粉丝泡软，猪肉末加生抽腌制。","锅中热油，炒香肉末和小米辣。","加入粉丝翻炒，加盐调味即可。"]', 
  '粉丝不要炒太久，避免糊锅。', '可加葱花提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('vermicelli1', 'mayishangshu1', '粉丝', '100g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pork4', 'mayishangshu1', '猪肉末', '80g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili11', 'mayishangshu1', '小米辣', '2根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil22', 'mayishangshu1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy13', 'mayishangshu1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt23', 'mayishangshu1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('ganbiansijidou1', '干煸四季豆', '青菜', '中辣', 
  '["四季豆掰段，油炸至表皮起皱捞出。","锅中留底油，炒香肉末和干辣椒。","下四季豆翻炒，加盐调味即可。"]', 
  '四季豆要炸熟，避免中毒。', '可加蒜末提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('beans1', 'ganbiansijidou1', '四季豆', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pork5', 'ganbiansijidou1', '猪肉末', '50g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili12', 'ganbiansijidou1', '干辣椒', '5根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil23', 'ganbiansijidou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt24', 'ganbiansijidou1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('shousibaocai1', '手撕包菜', '青菜', '中辣', 
  '["包菜手撕成片，蒜切片。","锅中热油，爆香蒜片和干辣椒。","下包菜大火快炒，加盐调味即可。"]', 
  '包菜要大火快炒，保持脆嫩。', '可加少许醋提味。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('cabbage3', 'shousibaocai1', '包菜', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili13', 'shousibaocai1', '干辣椒', '5根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('garlic7', 'shousibaocai1', '大蒜', '3瓣', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil24', 'shousibaocai1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt25', 'shousibaocai1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('suanrongkongxincai1', '蒜蓉空心菜', '青菜', '不辣', 
  '["空心菜洗净切段，蒜切末。","锅中热油，爆香蒜末。","下空心菜大火快炒，加盐调味即可。"]', 
  '空心菜要大火快炒，保持翠绿。', '可加红椒丝提色。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('watercress1', 'suanrongkongxincai1', '空心菜', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('garlic8', 'suanrongkongxincai1', '大蒜', '5瓣', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil25', 'suanrongkongxincai1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt26', 'suanrongkongxincai1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('yumupaigutang1', '玉米排骨汤', '炖汤', '不辣', 
  '["排骨焯水，玉米和胡萝卜切块。","锅中加水，放入排骨、玉米、胡萝卜、姜片。","大火煮开转小火炖1小时，加盐调味即可。"]', 
  '排骨要焯水去腥。', '可加枸杞提鲜。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ribs1', 'yumupaigutang1', '排骨', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('corn1', 'yumupaigutang1', '玉米', '1根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('carrot1', 'yumupaigutang1', '胡萝卜', '1根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger6', 'yumupaigutang1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt27', 'yumupaigutang1', '食盐', '适量', 1718000000000, 1718000000000);

-- 第六组菜品
INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('fanqieniuanbao1', '番茄牛腩煲', '红烧', '微辣', 
  '["牛腩切块焯水，西红柿切块，土豆切块。","锅中热油，炒香西红柿。","加入牛腩、土豆和适量水炖1小时，加盐调味即可。"]', 
  '牛腩要炖至软烂。', '可加胡萝卜提鲜。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('beef5', 'fanqieniuanbao1', '牛腩', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('tomato2', 'fanqieniuanbao1', '西红柿', '2个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('potato2', 'fanqieniuanbao1', '土豆', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil26', 'fanqieniuanbao1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt28', 'fanqieniuanbao1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('xianggudunji1', '香菇炖鸡', '红烧', '不辣', 
  '["鸡块焯水，香菇切片。","锅中热油，炒香姜片和鸡块。","加入香菇和适量水炖40分钟，加盐调味即可。"]', 
  '香菇提前泡发更入味。', '可加枸杞提鲜。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chicken4', 'xianggudunji1', '鸡块', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('mushroom1', 'xianggudunji1', '香菇', '5朵', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger7', 'xianggudunji1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil27', 'xianggudunji1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt29', 'xianggudunji1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('huangdouzhutitang1', '黄豆猪蹄汤', '炖汤', '不辣', 
  '["猪蹄切块焯水，黄豆提前泡发。","锅中加水，放入猪蹄、黄豆、姜片。","大火煮开转小火炖1.5小时，加盐调味即可。"]', 
  '黄豆提前泡发更易熟。', '可加花生同炖。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pigtrotter1', 'huangdouzhutitang1', '猪蹄', '400g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soybean1', 'huangdouzhutitang1', '黄豆', '50g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger8', 'huangdouzhutitang1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt30', 'huangdouzhutitang1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('xiandanhuangtudousi1', '咸蛋黄土豆丝', '炒菜', '微辣', 
  '["土豆切丝泡水去淀粉。","锅中热油，炒熟咸蛋黄。","下土豆丝翻炒，加盐调味即可。"]', 
  '咸蛋黄提前碾碎更易炒散。', '可加青椒丝提色。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('potato3', 'xiandanhuangtudousi1', '土豆', '2个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('egg4', 'xiandanhuangtudousi1', '咸蛋黄', '2个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil28', 'xiandanhuangtudousi1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt31', 'xiandanhuangtudousi1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('yangcongchaoniurou1', '洋葱炒牛肉', '炒菜', '微辣', 
  '["牛肉切片，用生抽腌制10分钟。","锅中热油，炒香牛肉片。","加入洋葱丝翻炒，加盐调味即可。"]', 
  '洋葱最后放，保持脆甜。', '可加青椒丝提色。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('beef6', 'yangcongchaoniurou1', '牛肉', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('onion1', 'yangcongchaoniurou1', '洋葱', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil29', 'yangcongchaoniurou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy14', 'yangcongchaoniurou1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt32', 'yangcongchaoniurou1', '食盐', '适量', 1718000000000, 1718000000000);

-- 第七组菜品
INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('fenzhengrou1', '粉蒸肉', '蒸菜', '中辣', 
  '["五花肉切片，用生抽腌制。","裹上蒸肉米粉，铺在土豆片上。","上锅蒸40分钟，加盐调味即可。"]', 
  '米粉可用现成蒸肉米粉。', '可加南瓜片同蒸。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pork6', 'fenzhengrou1', '五花肉', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('riceflour1', 'fenzhengrou1', '蒸肉米粉', '50g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('potato4', 'fenzhengrou1', '土豆', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy15', 'fenzhengrou1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil30', 'fenzhengrou1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt33', 'fenzhengrou1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('huangmenji1', '黄焖鸡', '红烧', '中辣', 
  '["鸡块焯水，土豆切块，青椒切块。","锅中热油，炒香鸡块。","加入土豆、青椒和适量水焖煮30分钟，加盐调味即可。"]', 
  '鸡块要炖至软烂。', '可加香菇同炖。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chicken5', 'huangmenji1', '鸡块', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('potato5', 'huangmenji1', '土豆', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('greenpepper1', 'huangmenji1', '青椒', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil31', 'huangmenji1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy16', 'huangmenji1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt34', 'huangmenji1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('jiaoyanpaigu1', '椒盐排骨', '炒菜', '中辣', 
  '["排骨切段，用椒盐粉腌制10分钟。","锅中热油，炸至金黄捞出。","撒椒盐粉和盐拌匀即可。"]', 
  '排骨要炸熟。', '可加孜然粉提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ribs2', 'jiaoyanpaigu1', '排骨', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pepper3', 'jiaoyanpaigu1', '椒盐粉', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil32', 'jiaoyanpaigu1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt35', 'jiaoyanpaigu1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('qingchaohelan1', '清炒荷兰豆', '青菜', '不辣', 
  '["荷兰豆去筋洗净，蒜切片。","锅中热油，爆香蒜片。","下荷兰豆大火快炒，加盐调味即可。"]', 
  '荷兰豆要大火快炒，保持翠绿。', '可加胡萝卜丝提色。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('peas1', 'qingchaohelan1', '荷兰豆', '200g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('garlic9', 'qingchaohelan1', '大蒜', '3瓣', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil33', 'qingchaohelan1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt36', 'qingchaohelan1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('disanxian1', '地三鲜', '炒菜', '微辣', 
  '["土豆、茄子、青椒切块。","锅中热油，先炸土豆和茄子至金黄捞出。","锅留底油，炒香青椒。","倒入土豆和茄子，加生抽和盐翻炒均匀即可。"]', 
  '茄子可提前泡盐水防止吸油。', '可加蒜末提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('potato6', 'disanxian1', '土豆', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('eggplant1', 'disanxian1', '茄子', '1根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('greenpepper2', 'disanxian1', '青椒', '1个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil34', 'disanxian1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy17', 'disanxian1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt37', 'disanxian1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('ganguohuacai1', '干锅花菜', '炒菜', '中辣', 
  '["花菜掰小朵焯水，腊肉切片。","锅中热油，炒香腊肉和干辣椒。","下花菜翻炒，加盐调味即可。"]', 
  '花菜焯水后更易入味。', '可加蒜末提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('cauliflower1', 'ganguohuacai1', '花菜', '300g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('bacon2', 'ganguohuacai1', '腊肉', '80g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chili14', 'ganguohuacai1', '干辣椒', '5根', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil35', 'ganguohuacai1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt38', 'ganguohuacai1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('huashengzhujiaotang1', '花生猪脚汤', '炖汤', '不辣', 
  '["猪脚切块焯水，花生提前泡发。","锅中加水，放入猪脚、花生、姜片。","大火煮开转小火炖1.5小时，加盐调味即可。"]', 
  '花生提前泡发更易熟。', '可加红枣同炖。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pigtrotter2', 'huashengzhujiaotang1', '猪脚', '400g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('peanut1', 'huashengzhujiaotang1', '花生', '50g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger9', 'huashengzhujiaotang1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt39', 'huashengzhujiaotang1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('shaguojijichi1', '砂锅焗鸡翅', '红烧', '微辣', 
  '["鸡翅洗净划口，用生抽腌制10分钟。","砂锅加油，放入姜片和鸡翅。","小火焗至鸡翅熟透，加盐调味即可。"]', 
  '砂锅焗制更入味。', '可加葱段提香。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('chickenwing3', 'shaguojijichi1', '鸡翅', '8个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('ginger10', 'shaguojijichi1', '姜', '2片', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy18', 'shaguojijichi1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil36', 'shaguojijichi1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt40', 'shaguojijichi1', '食盐', '适量', 1718000000000, 1718000000000);

INSERT INTO dishes (id, name, type, spicy, steps, notice, remark, reference, creatorId, creatorOpenid, createTime, updateTime)
VALUES ('chaigurouhebaodan1', '拆骨肉荷包蛋', '炒菜', '微辣', 
  '["鸡蛋煎成荷包蛋。","锅中热油，炒香拆骨肉。","加入荷包蛋和生抽、盐翻炒均匀即可。"]', 
  '荷包蛋可提前煎好备用。', '可加青椒丝提色。', '', '', '', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('pork7', 'chaigurouhebaodan1', '拆骨肉', '150g', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('egg5', 'chaigurouhebaodan1', '鸡蛋', '2个', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('oil37', 'chaigurouhebaodan1', '食用油', '适量', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('soy19', 'chaigurouhebaodan1', '生抽', '1勺', 1718000000000, 1718000000000);

INSERT INTO ingredients (id, dishId, name, amount, createTime, updateTime)
VALUES ('salt41', 'chaigurouhebaodan1', '食盐', '适量', 1718000000000, 1718000000000);
```