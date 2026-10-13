import { QUILL_FLIGHT, stepFallingProjectile } from './hostile-projectiles.js';

export const AETHER_TUNING = Object.freeze({ interval: 90, duration: 20, streamSpeed: 5,
  projectileDamage: 16, defensiveCount: 7, defensiveDistance: 5, streamCadence: 0.12, streamArc: Math.PI * 2 / 3 });
export const isElementalMove = move => ['targetedVolley', 'defensiveVolley', 'fireballStream'].includes(move);
const committed = s => ['windup', 'active', 'recovery'].includes(s.mode);
export function advanceEmbermaneModes(s, dt, engaged = true) {
  const mode = s.states.aetherCharge;
  if (s.definition?.states.aetherCharge.enabled === false) return;
  if (mode.active) {
    mode.remaining = Math.max(0, mode.remaining - dt);
    if (mode.remaining <= 1e-8 && !committed(s)) { mode.active = false; mode.remaining = 0; mode.buildup = 0; }
  } else if (engaged) {
    mode.buildup = Math.min(AETHER_TUNING.interval, mode.buildup + dt);
    mode.pending = mode.buildup >= AETHER_TUNING.interval - 1e-8;
  }
  if (engaged && mode.pending && !committed(s) && !['reaction', 'defeated'].includes(s.mode)) {
    Object.assign(mode, { active: true, pending: false, remaining: AETHER_TUNING.duration, buildup: 0, activations: mode.activations + 1 });
  }
}
function falling(s, destination, targetId) {
  s.projectiles.push({ id: ++s.projectileSerial, kind: 'fall', age: 0, targetId, burning: true, sizeMultiplier: s.definition?.sizeMultiplier ?? 1,
    damage: AETHER_TUNING.projectileDamage * (s.definition?.projectileDamageMultiplier ?? 1), destination: [...destination],
    position: [destination[0], destination[1] + QUILL_FLIGHT.height, destination[2]] });
}
export function releaseEmbermaneVolley(s, players) {
  if (s.move === 'targetedVolley') {
    for (const p of players) if (!p.knockedDown || s.canTargetKnockedDownPlayers) falling(s, p.position, p.id);
  } else {
    for (let i = 0; i < AETHER_TUNING.defensiveCount; i++) {
      const yaw = s.yaw - Math.PI / 2 + Math.PI * i / (AETHER_TUNING.defensiveCount - 1);
      const distance = AETHER_TUNING.defensiveDistance * (s.definition?.sizeMultiplier ?? 1);
      falling(s, [s.position[0] - Math.sin(yaw) * distance, s.position[1], s.position[2] - Math.cos(yaw) * distance]);
    }
  }
}
export function releaseEmbermaneStream(s, elapsed, bounds) {
  while (s.nextFireball <= elapsed + 1e-8 && s.nextFireball < s.streamDuration) {
    const progress = s.nextFireball / s.streamDuration;
    const sweep = s.streamReturn ? (progress < 0.5 ? progress * 2 : 2 - progress * 2) : progress;
    const yaw = s.streamYaw + (sweep - 0.5) * AETHER_TUNING.streamArc;
    const sizeMultiplier = s.definition?.sizeMultiplier ?? 1;
    s.projectiles.push({ id: ++s.projectileSerial, kind: 'stream', age: 0, burning: true, sizeMultiplier,
      damage: AETHER_TUNING.projectileDamage * (s.definition?.projectileDamageMultiplier ?? 1), position: [s.position[0] - Math.sin(s.streamYaw) * 3.4 * sizeMultiplier, s.position[1] + 1.2 * sizeMultiplier, s.position[2] - Math.cos(s.streamYaw) * 3.4 * sizeMultiplier],
      direction: [-Math.sin(yaw), 0, -Math.cos(yaw)], life: (bounds * 2 + 8) / AETHER_TUNING.streamSpeed });
    s.nextFireball += AETHER_TUNING.streamCadence;
  }
}
export function stepEmbermaneProjectiles(s, players, dt) {
  s.impactEvents = [];
  for (const q of s.projectiles) {
    q.previous = [...q.position];
    if (q.kind === 'fall') {
      if (stepFallingProjectile(q, players, dt)) s.impactEvents.push({ ...q });
    } else {
      q.age += dt;
      for (const i of [0, 2]) q.position[i] += q.direction[i] * AETHER_TUNING.streamSpeed * dt;
      s.impactEvents.push({ ...q });
    }
  }
  s.projectiles = s.projectiles.filter(q => q.age < (q.kind === 'fall' ? QUILL_FLIGHT.fall : q.life));
}
