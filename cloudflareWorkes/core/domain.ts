import type { Capability, FamilyRole } from './types';

export type { Capability } from './types';

const CAPABILITIES: Record<FamilyRole, ReadonlySet<Capability>> = {
  owner: new Set<Capability>([
    'family.read', 'family.manage', 'family.invite', 'family.inviteAdmin',
    'dish.manage', 'appointment.manage', 'inventory.write', 'inventory.delete',
    'shopping.write', 'review.write', 'file.write',
  ]),
  admin: new Set<Capability>([
    'family.read', 'family.manage', 'family.invite', 'dish.manage',
    'appointment.manage', 'inventory.write', 'inventory.delete',
    'shopping.write', 'review.write', 'file.write',
  ]),
  chef: new Set<Capability>([
    'family.read', 'dish.manage', 'appointment.manage', 'inventory.write',
    'inventory.delete', 'shopping.write', 'review.write', 'file.write',
  ]),
  member: new Set<Capability>([
    'family.read', 'inventory.write', 'shopping.write', 'review.write', 'file.write',
  ]),
};

export function hasCapability(role: FamilyRole, capability: Capability): boolean {
  return CAPABILITIES[role].has(capability);
}

export function canManageRole(actor: FamilyRole, target: FamilyRole, nextRole?: FamilyRole): boolean {
  if (actor === 'owner') return target !== 'owner' && nextRole !== 'owner';
  if (actor === 'admin') {
    return (target === 'chef' || target === 'member') && (!nextRole || nextRole === 'chef' || nextRole === 'member');
  }
  return false;
}

export type UnitDimension = 'mass' | 'volume' | 'count' | 'unknown';

const UNIT_FACTORS: Record<string, { dimension: UnitDimension; factor: number; canonical: string }> = {
  g: { dimension: 'mass', factor: 1, canonical: 'g' },
  gram: { dimension: 'mass', factor: 1, canonical: 'g' },
  '克': { dimension: 'mass', factor: 1, canonical: 'g' },
  kg: { dimension: 'mass', factor: 1000, canonical: 'g' },
  '千克': { dimension: 'mass', factor: 1000, canonical: 'g' },
  '公斤': { dimension: 'mass', factor: 1000, canonical: 'g' },
  ml: { dimension: 'volume', factor: 1, canonical: 'ml' },
  '毫升': { dimension: 'volume', factor: 1, canonical: 'ml' },
  l: { dimension: 'volume', factor: 1000, canonical: 'ml' },
  '升': { dimension: 'volume', factor: 1000, canonical: 'ml' },
  piece: { dimension: 'count', factor: 1, canonical: 'piece' },
  pieces: { dimension: 'count', factor: 1, canonical: 'piece' },
  '个': { dimension: 'count', factor: 1, canonical: 'piece' },
  '只': { dimension: 'count', factor: 1, canonical: 'piece' },
};

export interface NormalizedQuantity {
  quantity: number;
  unit: string;
  dimension: UnitDimension;
}

export interface ParsedQuantityText {
  quantity: number;
  unit: string;
}

export function parseQuantityText(value: unknown): ParsedQuantityText | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(g|gram|kg|ml|l|piece|pieces|克|千克|公斤|毫升|升|个|只)$/i);
  if (!match) return null;
  const quantity = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(quantity) || quantity < 0 || !normalizeQuantity(quantity, unit)) return null;
  return { quantity, unit };
}

export function normalizeQuantity(quantity: unknown, unit: unknown): NormalizedQuantity | null {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || typeof unit !== 'string') return null;
  const definition = UNIT_FACTORS[unit.trim().toLowerCase()] || UNIT_FACTORS[unit.trim()];
  if (!definition) return null;
  return { quantity: quantity * definition.factor, unit: definition.canonical, dimension: definition.dimension };
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number | null {
  const from = normalizeQuantity(quantity, fromUnit);
  const target = normalizeQuantity(1, toUnit);
  if (!from || !target || from.dimension !== target.dimension) return null;
  return from.quantity / target.quantity;
}

export interface RecommendationScore {
  coverageRate: number;
  expiringIngredientCount: number;
  warningCount: number;
  name?: string;
}

export function compareRecommendations(a: RecommendationScore, b: RecommendationScore): number {
  return b.coverageRate - a.coverageRate
    || b.expiringIngredientCount - a.expiringIngredientCount
    || a.warningCount - b.warningCount
    || (a.name || '').localeCompare(b.name || '', 'zh-CN');
}

export function normalizeIngredientName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s·・_-]+/g, '');
}

export interface PreferenceInput {
  type: 'allergy' | 'avoid' | 'like' | 'spice';
  value: string;
  userId?: string;
  userName?: string | null;
}

export interface PreferenceWarning {
  type: 'allergy' | 'avoid' | 'spice';
  value: string;
  dinerId?: string;
  dinerName?: string | null;
  ingredient?: string;
  message: string;
}

export function collectPreferenceWarnings(
  ingredientNames: string[],
  spicy: string | null | undefined,
  preferences: PreferenceInput[],
): PreferenceWarning[] {
  const normalizedIngredients = ingredientNames.map(name => ({ name, key: normalizeIngredientName(name) }));
  const warnings: PreferenceWarning[] = [];
  for (const preference of preferences) {
    if (preference.type === 'like') continue;
    if (preference.type === 'spice') {
      const wantsNone = ['none', '不辣'].includes(preference.value);
      if (wantsNone && spicy && !['none', '不辣'].includes(spicy)) {
        warnings.push({
          type: 'spice', value: preference.value, dinerId: preference.userId,
          dinerName: preference.userName, message: `${preference.userName || '用餐成员'}偏好不辣`,
        });
      }
      continue;
    }
    const preferenceKey = normalizeIngredientName(preference.value);
    const matched = normalizedIngredients.find(item => item.key.includes(preferenceKey) || preferenceKey.includes(item.key));
    if (matched) {
      warnings.push({
        type: preference.type,
        value: preference.value,
        dinerId: preference.userId,
        dinerName: preference.userName,
        ingredient: matched.name,
        message: `${preference.userName || '用餐成员'}${preference.type === 'allergy' ? '对' : '不吃'}${preference.value}`,
      });
    }
  }
  return warnings;
}
