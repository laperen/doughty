export const BURNING = Object.freeze({ duration: 6, tickInterval: 1, damage: 10, dodgeReduction: 2 });
export function applyBurning(player) {
  // Refresh duration without postponing an already scheduled damage tick.
  player.burning = { remaining: BURNING.duration, nextTick: player.burning?.nextTick ?? BURNING.tickInterval };
}
export function dodgeBurning(player) {
  if (!player.burning) return;
  player.burning.remaining = Math.max(0, player.burning.remaining - BURNING.dodgeReduction);
  if (!player.burning.remaining) player.burning = null;
}
export function stepBurning(player, dt) {
  const status = player.burning;
  if (!status || player.health <= 0) { player.burning = null; return 0; }
  const elapsed = Math.min(dt, status.remaining);
  status.remaining = Math.max(0, status.remaining - dt);
  status.nextTick -= elapsed;
  let damage = 0;
  while (status.nextTick <= 1e-8) { damage += BURNING.damage; status.nextTick += BURNING.tickInterval; }
  if (status.remaining <= 1e-8) player.burning = null;
  return damage;
}
