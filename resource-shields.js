/** Resource-specific shield pools. Each source owns its expiration and gain timer. */
export function grantShield(state, resource, source, amount, expiresAfter) {
  if (!(amount > 0)) return;
  state.shields ??= {};
  const pools = state.shields[resource] ??= {};
  const pool = pools[source] ??= { amount: 0, peak: 0, remaining: 0 };
  pool.amount += amount;
  pool.peak = Math.max(pool.peak, pool.amount);
  pool.remaining = expiresAfter;
}
export function shieldAmount(state, resource) {
  return Object.values(state.shields?.[resource] ?? {}).reduce((sum, pool) => sum + pool.amount, 0);
}
export function shieldCapacity(state, resource) {
  return Object.values(state.shields?.[resource] ?? {}).reduce((sum, pool) => sum + pool.peak, 0);
}
export function stepShields(state, dt) {
  for (const pools of Object.values(state.shields ?? {})) for (const [source, pool] of Object.entries(pools)) {
    pool.remaining = Math.max(0, pool.remaining - dt);
    if (pool.remaining === 0) delete pools[source];
  }
}
/** Spend shields first, then pass only the overflow to the protected resource. */
export function consumeResource(state, resource, amount) {
  let overflow = Math.max(0, amount);
  const pools = Object.entries(state.shields?.[resource] ?? {}).sort(([, a], [, b]) => a.remaining - b.remaining);
  for (const [, pool] of pools) {
    const consumed = Math.min(pool.amount, overflow);
    pool.amount -= consumed; overflow -= consumed;
  }
  state[resource] = Math.max(0, state[resource] - overflow);
  return overflow;
}
