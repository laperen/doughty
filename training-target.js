/** Persistent practice target; training totals are independent damage channels. */
export const TRAINING_TARGET = Object.freeze({ radius: 1.2, height: 2.1, idleTimeout: 5 });

export function createTrainingState() {
  return { core: 0, part: 0, stagger: 0, wound: 0, hits: 0, lastHit: 0, elapsed: 0, idle: 0, active: false, recoil: 0 };
}

export function hitTrainingTarget(state, { damage = 0, stagger = 0, wound = 0, periodic = false } = {}) {
  if (damage <= 0 && stagger <= 0 && wound <= 0) return;
  state.core += Math.max(0, damage);
  state.part += Math.max(0, damage);
  state.stagger += Math.max(0, stagger);
  state.wound += Math.max(0, wound);
  state.lastHit = Math.max(0, damage);
  state.hits += 1;
  state.idle = 0;
  state.active = true;
  if (!periodic) state.recoil = 1;
}

export function stepTrainingTarget(state, dt) {
  const step = Math.max(0, dt);
  state.recoil = Math.max(0, state.recoil - step * 5);
  if (!state.active) return;
  state.elapsed += Math.min(step, TRAINING_TARGET.idleTimeout - state.idle);
  state.idle = Math.min(TRAINING_TARGET.idleTimeout, state.idle + step);
  if (state.idle >= TRAINING_TARGET.idleTimeout) state.active = false;
}

export function trainingDps(state) {
  return state.core / Math.max(1, state.elapsed);
}
