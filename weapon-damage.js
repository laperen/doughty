/** Authored coefficients retain a starter preview for existing module consumers. */
export function damageProfile(base, multiplier, staggerMultiplier, woundMultiplier) {
  return { damageMultiplier: multiplier, damage: base * multiplier,
    ...(staggerMultiplier === undefined ? {} : { staggerMultiplier, stagger: base * staggerMultiplier }),
    ...(woundMultiplier === undefined ? {} : { woundMultiplier, wound: base * woundMultiplier }) };
}
export function resolveAttackDamage(attack, base) {
  const result = { ...attack };
  for (const channel of ['damage', 'stagger', 'wound']) {
    if (Number.isFinite(attack[`${channel}Multiplier`])) result[channel] = base * attack[`${channel}Multiplier`];
  }
  return result;
}
/** Resolve every emitted damage path once, including projectiles and periodic ticks. */
export function resolveWeaponEvents(events, base) {
  return events.map(event => ({ ...resolveAttackDamage(event, base),
    ...(event.move ? { move: resolveAttackDamage(event.move, base) } : {}),
    ...(event.projectile ? { projectile: resolveAttackDamage(event.projectile, base) } : {}) }));
}
