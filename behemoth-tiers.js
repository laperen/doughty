/** Per-instance ranks; multipliers apply to the authored species base. */
export const BEHEMOTH_TIERS = Object.freeze({
  lesser: Object.freeze({ label: 'Lesser', size: 0.9, stats: 1, damage: 0.75, enrage: false, summon: null }),
  normal: Object.freeze({ label: 'Normal', size: 1, stats: 1.2, damage: 1, enrage: true, summon: null }),
  greater: Object.freeze({ label: 'Greater', size: 1.1, stats: 1.6, damage: 1.3, enrage: true, summon: 'lesser' }),
  alpha: Object.freeze({ label: 'Alpha', size: 1.2, stats: 2.3, damage: 1.6, enrage: true, summon: 'normal' }),
});
export const SUMMON_HEALTH_FRACTION = 0.5;
export const SUMMON_REPLACEMENT_DELAY = 5;
export function tierDefinition(base, tier = 'normal') {
  const rank = Object.hasOwn(BEHEMOTH_TIERS, tier) ? BEHEMOTH_TIERS[tier] : null;
  if (!rank) throw new RangeError(`Unknown Behemoth tier: ${tier}`);
  const charge = base.states.aetherCharge ?? { enabled: false, interval: 90, durations: [20] };
  return { ...base, tier, name: `${rank.label} ${base.name ?? 'Embermane'}`,
    sizeMultiplier: rank.size, sizeScale: base.sizeScale * rank.size,
    bodyRadius: base.bodyRadius * rank.size, bodyHeight: base.bodyHeight * rank.size,
    maxHealth: base.maxHealth * rank.stats, maxStagger: base.maxStagger * rank.stats,
    states: { ...base.states, enrage: { ...base.states.enrage, enabled: rank.enrage },
      aetherCharge: { ...charge, enabled: charge.enabled || tier === 'lesser' || tier === 'alpha' } },
    parts: Object.fromEntries(Object.entries(base.parts).map(([id, part]) => [id, { ...part,
      health: part.health * rank.stats, woundHealth: part.woundHealth * rank.stats }])),
    moves: Object.fromEntries(Object.entries(base.moves).map(([id, move]) => [id, { ...move, damage: move.damage * rank.damage,
      ...(move.reach ? { reach: move.reach * (base.modelSpaceMoves ? 1 : rank.size) } : {}) }])),
    ...(base.quills ? { quills: { ...base.quills, damage: base.quills.damage * rank.damage } } : {}),
    projectileDamageMultiplier: rank.damage,
  };
}
