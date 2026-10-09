/** Shared meter rules; species retain reaction priority and side effects. */
export function applyPartDamage(state, definition, part, damage) {
  const meter = state.parts[part];
  const before = meter?.damage ?? 0;
  let brokenPart = null;
  if (meter && !meter.broken) {
    meter.damage = Math.min(definition.parts[part].health, meter.damage + Math.max(0, damage));
    if (meter.damage >= definition.parts[part].health) {
      meter.broken = true;
      brokenPart = part;
    }
  }
  return { brokenPart, partDamage: meter ? meter.damage - before : 0 };
}

export function applyCoreDamage(state, definition, damage) {
  const core = Math.min(state.health, Math.max(0, damage));
  const enrage = state.states.enrage;
  // Fresh damage builds each inactive cycle; active-phase damage is not banked.
  if (!enrage.active && !enrage.pending) {
    enrage.buildup += core;
    enrage.pending = enrage.buildup >= definition.maxHealth * definition.states.enrage.damageFraction;
  }
  state.health -= core;
}

export function clearBehemothModes(state) {
  for (const mode of Object.values(state.states)) {
    mode.active = false; mode.pending = false; mode.remaining = 0;
  }
}

export function advanceStaggerThreshold(state, maxStagger, multiplier) {
  state.stagger = 0;
  state.trueStaggerCount += 1;
  state.staggerThreshold = maxStagger * multiplier ** state.trueStaggerCount;
}
