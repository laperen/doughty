// Shared Quillshot flight rules: track briefly, then commit to the landing point.
export const QUILL_FLIGHT = Object.freeze({ fall: 1, tracking: 0.25, height: 9, radius: 0.65 });
export function stepFallingProjectile(q, players, dt) {
  const player = players.find(p => p.id === q.targetId);
  if (q.age < QUILL_FLIGHT.tracking && player) q.destination = [...player.position];
  q.age += dt;
  q.position = [q.destination[0], q.destination[1] + QUILL_FLIGHT.height * Math.max(0, 1 - q.age / QUILL_FLIGHT.fall), q.destination[2]];
  return q.age >= QUILL_FLIGHT.fall;
}
export function hostileProjectileTouches(q, position) {
  if (q.kind === 'ground-blast') return Math.hypot(q.position[0] - position[0], q.position[2] - position[2]) <= q.radius + 0.36
    && Math.abs(position[1] - q.position[1]) < 1.8;
  const scale = q.sizeMultiplier ?? 1;
  if (q.kind === 'fall') return Math.hypot(q.destination[0] - position[0], q.destination[2] - position[2]) <= QUILL_FLIGHT.radius * scale + 0.36 && Math.abs(position[1] - q.destination[1]) < 1.8 * scale;
  const a = q.previous, b = q.position, dx = b[0] - a[0], dz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((position[0] - a[0]) * dx + (position[2] - a[2]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(position[0] - a[0] - t * dx, position[2] - a[2] - t * dz) < 0.6 * scale && position[1] < q.position[1] + 0.5 * scale && position[1] + 1.7 > q.position[1];
}
