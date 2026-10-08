import { addTimedStatModifier, getStatModifierRemaining } from './stat-modifiers.js';

export const WOUND = Object.freeze({ duration: 15, buffDuration: 20, attackSpeed: 15, source: 'wound-haste' });
export const createWoundMeter = definition => ({
  woundHp: definition.woundable ? definition.woundHealth : 0,
  woundSpent: false, woundRemaining: 0,
});

/** Independent of part breaks. Pass the actual attacking player's modifiers. */
export function resolveWound(meter, definition, damage, attackerModifiers) {
  if (!meter || !definition?.woundable) return { wounded: false, woundDamage: 0 };
  const before = meter.woundHp;
  let wounded = false;
  if (!meter.woundSpent && damage > 0) {
    meter.woundHp = Math.max(0, meter.woundHp - damage);
    if (meter.woundHp === 0) {
      meter.woundSpent = true;
      meter.woundRemaining = WOUND.duration;
      wounded = true;
    }
  }
  if (meter.woundRemaining > 0 && attackerModifiers && !getStatModifierRemaining(attackerModifiers, WOUND.source)) {
    addTimedStatModifier(attackerModifiers, { source: WOUND.source, stat: 'attackSpeed', percent: WOUND.attackSpeed, duration: WOUND.buffDuration });
  }
  return { wounded, woundDamage: before - meter.woundHp };
}

export function stepWounds(parts, dt) {
  for (const meter of Object.values(parts)) meter.woundRemaining = Math.max(0, (meter.woundRemaining ?? 0) - dt);
}
