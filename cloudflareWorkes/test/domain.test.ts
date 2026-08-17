import { describe, expect, it } from 'vitest';
import {
  canManageRole,
  collectPreferenceWarnings,
  compareRecommendations,
  convertQuantity,
  hasCapability,
  normalizeQuantity,
} from '../core/domain';
import type { Capability, FamilyRole } from '../core/types';

const capabilities: Capability[] = [
  'family.read',
  'family.manage',
  'family.invite',
  'family.inviteAdmin',
  'dish.manage',
  'appointment.manage',
  'inventory.write',
  'inventory.delete',
  'shopping.write',
  'review.write',
  'file.write',
];

describe('role capability matrix', () => {
  const expected: Record<FamilyRole, Capability[]> = {
    owner: capabilities,
    admin: capabilities.filter(capability => capability !== 'family.inviteAdmin'),
    chef: [
      'family.read',
      'dish.manage',
      'appointment.manage',
      'inventory.write',
      'inventory.delete',
      'shopping.write',
      'review.write',
      'file.write',
    ],
    member: ['family.read', 'inventory.write', 'shopping.write', 'review.write', 'file.write'],
  };

  it.each(Object.entries(expected))('matches the %s capability set', (role, allowed) => {
    for (const capability of capabilities) {
      expect(hasCapability(role as FamilyRole, capability)).toBe(allowed.includes(capability));
    }
  });
});

describe('canManageRole', () => {
  it('lets owners manage every non-owner role without creating a second owner', () => {
    expect(canManageRole('owner', 'admin')).toBe(true);
    expect(canManageRole('owner', 'chef', 'member')).toBe(true);
    expect(canManageRole('owner', 'member', 'admin')).toBe(true);
    expect(canManageRole('owner', 'owner')).toBe(false);
    expect(canManageRole('owner', 'member', 'owner')).toBe(false);
  });

  it('limits admins to chef/member targets and roles', () => {
    expect(canManageRole('admin', 'chef')).toBe(true);
    expect(canManageRole('admin', 'member', 'chef')).toBe(true);
    expect(canManageRole('admin', 'chef', 'member')).toBe(true);
    expect(canManageRole('admin', 'owner')).toBe(false);
    expect(canManageRole('admin', 'admin')).toBe(false);
    expect(canManageRole('admin', 'member', 'admin')).toBe(false);
  });

  it.each([
    ['chef', 'member'],
    ['member', 'chef'],
    ['member', 'admin'],
  ] as Array<[FamilyRole, FamilyRole]>)(
    'does not let %s manage a %s',
    (actor, target) => {
      expect(canManageRole(actor, target)).toBe(false);
    },
  );
});

describe('quantity conversion', () => {
  it('converts mass units in both directions', () => {
    expect(convertQuantity(1000, 'g', 'kg')).toBeCloseTo(1);
    expect(convertQuantity(1.5, 'kg', 'g')).toBeCloseTo(1500);
    expect(normalizeQuantity(2, '克')).toEqual({ quantity: 2, unit: 'g', dimension: 'mass' });
  });

  it('converts volume units in both directions', () => {
    expect(convertQuantity(1500, 'ml', 'l')).toBeCloseTo(1.5);
    expect(convertQuantity(2, '升', 'ml')).toBeCloseTo(2000);
  });

  it('keeps count units compatible', () => {
    expect(convertQuantity(3, '个', '只')).toBeCloseTo(3);
    expect(convertQuantity(2, 'pieces', 'piece')).toBeCloseTo(2);
  });

  it('returns null for unknown, invalid, or different dimensions', () => {
    expect(convertQuantity(1, 'kg', 'l')).toBeNull();
    expect(convertQuantity(1, 'g', 'unknown')).toBeNull();
    expect(normalizeQuantity(-1, 'g')).toBeNull();
    expect(normalizeQuantity(Number.NaN, 'g')).toBeNull();
    expect(normalizeQuantity(1, '')).toBeNull();
  });
});

describe('recommendation ordering', () => {
  it('sorts by coverage, expiring ingredients, warnings, then name', () => {
    const recommendations = [
      { name: 'warnings tie-break', coverageRate: 0.8, expiringIngredientCount: 1, warningCount: 2 },
      { name: 'coverage winner', coverageRate: 1, expiringIngredientCount: 0, warningCount: 5 },
      { name: 'expiring winner', coverageRate: 0.8, expiringIngredientCount: 2, warningCount: 4 },
      { name: 'warning winner', coverageRate: 0.8, expiringIngredientCount: 1, warningCount: 0 },
      { name: 'name B', coverageRate: 0.8, expiringIngredientCount: 1, warningCount: 2 },
      { name: 'name A', coverageRate: 0.8, expiringIngredientCount: 1, warningCount: 2 },
    ];

    expect(recommendations.sort(compareRecommendations).map(item => item.name)).toEqual([
      'coverage winner',
      'expiring winner',
      'warning winner',
      'name A',
      'name B',
      'warnings tie-break',
    ]);
  });

  it('returns a negative value when the first recommendation wins', () => {
    expect(compareRecommendations(
      { coverageRate: 0.9, expiringIngredientCount: 0, warningCount: 0 },
      { coverageRate: 0.8, expiringIngredientCount: 9, warningCount: 0 },
    )).toBeLessThan(0);
  });
});

describe('preference warnings', () => {
  it('warns on matching allergy/avoid tags and skips likes', () => {
    const warnings = collectPreferenceWarnings(
      ['花生粉', '香菜', '鸡肉'],
      'medium',
      [
        { type: 'allergy', value: '花生', userId: 'u-allergy', userName: '小林' },
        { type: 'avoid', value: '香菜', userId: 'u-avoid', userName: '小周' },
        { type: 'like', value: '鸡肉', userId: 'u-like', userName: '小陈' },
      ],
    );

    expect(warnings).toHaveLength(2);
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'allergy', value: '花生', ingredient: '花生粉', dinerId: 'u-allergy',
        message: '小林对花生',
      }),
      expect.objectContaining({
        type: 'avoid', value: '香菜', ingredient: '香菜', dinerId: 'u-avoid',
        message: '小周不吃香菜',
      }),
    ]));
  });

  it('warns when a diner who prefers no spice is served a spicy dish', () => {
    const warnings = collectPreferenceWarnings(
      ['番茄'],
      'hot',
      [{ type: 'spice', value: 'none', userId: 'u-1', userName: '小林' }],
    );

    expect(warnings).toEqual([
      expect.objectContaining({ type: 'spice', value: 'none', dinerId: 'u-1', message: '小林偏好不辣' }),
    ]);
    expect(collectPreferenceWarnings([], 'none', [{ type: 'spice', value: '不辣' }])).toEqual([]);
  });

  it('uses a neutral diner label when the preference has no name', () => {
    const [warning] = collectPreferenceWarnings(
      ['牛奶'],
      null,
      [{ type: 'allergy', value: '牛奶', userName: null }],
    );
    expect(warning.message).toBe('用餐成员对牛奶');
  });
});
