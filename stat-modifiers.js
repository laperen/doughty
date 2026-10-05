/** Shared timed stat modifiers. Percentages are additive within each stat. */
export function addTimedStatModifier(modifiers, { source, stat, percent = 0, flat = 0, duration }) {
  if (!source || !stat || !Number.isFinite(duration) || duration <= 0) {
    throw new TypeError('A timed stat modifier needs a source, stat, and positive duration.');
  }
  if (!Number.isFinite(percent) || !Number.isFinite(flat)) {
    throw new TypeError('Stat modifier values must be finite numbers.');
  }
  const existing = modifiers.find((modifier) => modifier.source === source && modifier.stat === stat);
  const next = { source, stat, percent, flat, remaining: duration };
  if (existing) Object.assign(existing, next);
  else modifiers.push(next);
  return next;
}

/** Tick effects independently; expiration removes only that effect. */
export function stepStatModifiers(modifiers, dt) {
  for (let index = modifiers.length - 1; index >= 0; index -= 1) {
    modifiers[index].remaining = Math.max(0, modifiers[index].remaining - dt);
    if (modifiers[index].remaining === 0) modifiers.splice(index, 1);
  }
}

/** Apply summed percentages to base first, then apply flat additions. */
export function getEffectiveStat(baseValue, stat, modifiers) {
  const active = modifiers.filter((modifier) => modifier.stat === stat && modifier.remaining > 0);
  const percent = active.reduce((sum, modifier) => sum + modifier.percent, 0);
  const flat = active.reduce((sum, modifier) => sum + modifier.flat, 0);
  return baseValue * (1 + percent / 100) + flat;
}

export function getStatModifierRemaining(modifiers, source) {
  return modifiers.reduce((remaining, modifier) => modifier.source === source
    ? Math.max(remaining, modifier.remaining) : remaining, 0);
}
