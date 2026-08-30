/**
 * Achievement and dish atlas models used by the profile achievement page.
 *
 * The API is intentionally kept separate from the history models.  History
 * records can grow independently while the achievement screen only needs the
 * aggregate progress and a compact dish index.
 */

export type AchievementCategory = 'meal' | 'dish' | 'special' | 'time' | 'memory' | string;

export interface AchievementDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  target: number;
  unit: string;
  tone: 'mint' | 'yellow' | 'coral' | 'blue' | 'green' | string;
  sortOrder: number;
}

export interface AchievementProgress extends AchievementDefinition {
  current: number;
  unlocked: boolean;
  pinned: boolean;
  unlockedAt?: number | string | null;
  notified?: boolean;
  progressLabel: string;
  progressPercent: number;
}

export interface AchievementSummary {
  total: number;
  unlocked: number;
  pinnedAchievementId: string | null;
  newlyUnlockedIds: string[];
  achievements: AchievementProgress[];
  /** Alias fields mirror the compact summary contract used by the profile. */
  totalCount: number;
  unlockedCount: number;
  pinnedAchievement: AchievementProgress | null;
  unacknowledged: AchievementProgress[];
}

export interface AchievementPinResponse {
  success?: boolean;
  pinnedAchievementId?: string | null;
  achievement?: AchievementProgress | null;
}

export interface DishAtlasItem {
  id: string;
  scopeId: string;
  scopeLabel: string;
  normalizedName: string;
  name: string;
  count: number;
  firstDate: string;
  latestDate: string;
  imageUrl: string;
  dishId?: string;
  recordIds: string[];
}

export interface AchievementListResponse {
  total: number;
  list: AchievementProgress[];
}

export interface AchievementAtlasResponse {
  total: number;
  list: DishAtlasItem[];
}

export interface AchievementUnlockAckResponse {
  success?: boolean;
  acknowledged?: string[];
}

export const ACHIEVEMENT_ICON_PATHS: Record<string, string> = {
  'meal-first': '/images/achievements/meal-first.svg',
  'meal-ten': '/images/achievements/meal-ten.svg',
  'meal-thirty': '/images/achievements/meal-thirty.svg',
  'meal-hundred': '/images/achievements/meal-hundred.svg',
  'dish-five': '/images/achievements/dish-five.svg',
  'dish-fifteen': '/images/achievements/dish-fifteen.svg',
  'dish-thirty': '/images/achievements/dish-thirty.svg',
  'dish-return-five': '/images/achievements/dish-return.svg',
  'meal-types-three': '/images/achievements/meal-complete.svg',
  'months-three': '/images/achievements/time-months.svg',
  'photo-first': '/images/achievements/memory-photo.svg',
  'note-five': '/images/achievements/memory-notes.svg',
  first_meal: '/images/achievements/meal-first.svg',
  ten_meals: '/images/achievements/meal-ten.svg',
  thirty_meals: '/images/achievements/meal-thirty.svg',
  hundred_meals: '/images/achievements/meal-hundred.svg',
  five_dishes: '/images/achievements/dish-five.svg',
  fifteen_dishes: '/images/achievements/dish-fifteen.svg',
  thirty_dishes: '/images/achievements/dish-thirty.svg',
  favorite_return: '/images/achievements/dish-return.svg',
  three_meals: '/images/achievements/meal-complete.svg',
  three_months: '/images/achievements/time-months.svg',
  first_photo: '/images/achievements/memory-photo.svg',
  five_notes: '/images/achievements/memory-notes.svg'
};

/** The product catalog is always rendered, even if an older API omits a row. */
export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    id: 'meal-first',
    key: 'meal-first',
    name: '第一餐',
    description: '完成你的第一顿餐桌记录',
    category: 'meal',
    icon: ACHIEVEMENT_ICON_PATHS.first_meal,
    target: 1,
    unit: '餐',
    tone: 'mint',
    sortOrder: 10
  },
  {
    id: 'meal-ten',
    key: 'meal-ten',
    name: '十餐烟火',
    description: '累计完成十顿餐桌记录',
    category: 'meal',
    icon: ACHIEVEMENT_ICON_PATHS.ten_meals,
    target: 10,
    unit: '餐',
    tone: 'yellow',
    sortOrder: 20
  },
  {
    id: 'meal-thirty',
    key: 'meal-thirty',
    name: '常伴三十餐',
    description: '累计完成三十顿餐桌记录',
    category: 'meal',
    icon: ACHIEVEMENT_ICON_PATHS.thirty_meals,
    target: 30,
    unit: '餐',
    tone: 'coral',
    sortOrder: 30
  },
  {
    id: 'meal-hundred',
    key: 'meal-hundred',
    name: '百餐纪念',
    description: '累计完成一百顿餐桌记录',
    category: 'meal',
    icon: ACHIEVEMENT_ICON_PATHS.hundred_meals,
    target: 100,
    unit: '餐',
    tone: 'blue',
    sortOrder: 40
  },
  {
    id: 'dish-five',
    key: 'dish-five',
    name: '五味初尝',
    description: '在不同范围尝过五道不同菜品',
    category: 'dish',
    icon: ACHIEVEMENT_ICON_PATHS.five_dishes,
    target: 5,
    unit: '道菜',
    tone: 'green',
    sortOrder: 50
  },
  {
    id: 'dish-fifteen',
    key: 'dish-fifteen',
    name: '菜单探险家',
    description: '在不同范围尝过十五道不同菜品',
    category: 'dish',
    icon: ACHIEVEMENT_ICON_PATHS.fifteen_dishes,
    target: 15,
    unit: '道菜',
    tone: 'mint',
    sortOrder: 60
  },
  {
    id: 'dish-thirty',
    key: 'dish-thirty',
    name: '百味收藏家',
    description: '在不同范围尝过三十道不同菜品',
    category: 'dish',
    icon: ACHIEVEMENT_ICON_PATHS.thirty_dishes,
    target: 30,
    unit: '道菜',
    tone: 'yellow',
    sortOrder: 70
  },
  {
    id: 'dish-return-five',
    key: 'dish-return-five',
    name: '最爱返场',
    description: '同一道菜累计出现在五次记录中',
    category: 'special',
    icon: ACHIEVEMENT_ICON_PATHS.favorite_return,
    target: 5,
    unit: '次',
    tone: 'coral',
    sortOrder: 80
  },
  {
    id: 'meal-types-three',
    key: 'meal-types-three',
    name: '三餐集齐',
    description: '早餐、午餐、晚餐各完成至少一次',
    category: 'time',
    icon: ACHIEVEMENT_ICON_PATHS.three_meals,
    target: 3,
    unit: '餐次',
    tone: 'blue',
    sortOrder: 90
  },
  {
    id: 'months-three',
    key: 'months-three',
    name: '月月有味',
    description: '餐桌记录覆盖三个自然月',
    category: 'time',
    icon: ACHIEVEMENT_ICON_PATHS.three_months,
    target: 3,
    unit: '个月',
    tone: 'green',
    sortOrder: 100
  },
  {
    id: 'photo-first',
    key: 'photo-first',
    name: '有图有味',
    description: '第一次为餐桌记录添加照片',
    category: 'memory',
    icon: ACHIEVEMENT_ICON_PATHS.first_photo,
    target: 1,
    unit: '张照片',
    tone: 'mint',
    sortOrder: 110
  },
  {
    id: 'note-five',
    key: 'note-five',
    name: '滋味成册',
    description: '累计留下五条文字感想',
    category: 'memory',
    icon: ACHIEVEMENT_ICON_PATHS.five_notes,
    target: 5,
    unit: '条感想',
    tone: 'yellow',
    sortOrder: 120
  }
];
