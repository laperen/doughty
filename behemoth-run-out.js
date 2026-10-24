import { behemothPushOut } from './behemoth-collision.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const yawTo = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Capture a bounded runway away from the target. The species owns what follows. */
export function startRunOut(state, target, bounds) {
  const pacing = state.definition.pacing, radius = Math.max(1, bounds - 2);
  const awayYaw = distance(state.position, target) > .01 ? yawTo(target, state.position) : state.yaw;
  let bestScore = -Infinity;
  for (let i = 0; i < 32; i++) {
    const angle = awayYaw + i * Math.PI / 16;
    const goal = [target[0] - Math.sin(angle) * pacing.runOutDistance, state.position[1], target[2] - Math.cos(angle) * pacing.runOutDistance];
    if (Math.hypot(goal[0], goal[2]) > radius) continue;
    const score = Math.cos(angle - awayYaw);
    if (score > bestScore) { bestScore = score; state.runOutGoal = goal; }
  }
  if (bestScore === -Infinity) {
    const goal = [target[0] - Math.sin(awayYaw) * pacing.runOutDistance, state.position[1], target[2] - Math.cos(awayYaw) * pacing.runOutDistance];
    const scale = Math.min(1, radius / Math.hypot(goal[0], goal[2]));
    state.runOutGoal = [goal[0] * scale, goal[1], goal[2] * scale];
  }
  state.lastRunOutAttackCount = state.attackCount;
  state.runOutCount = (state.runOutCount ?? 0) + 1;
  state.runOutContact = null;
  state.mode = 'run-out-turn'; state.move = null; state.elapsed = 0; state.attackHit = false;
}

/** Turn first, then sprint forward at the species' charge travel speed. */
export function stepRunOut(state, dt) {
  state.elapsed += dt;
  const desiredYaw = yawTo(state.position, state.runOutGoal);
  if (state.mode === 'run-out-turn') {
    const maximum = state.definition.pacing.runOutTurnSpeed * dt;
    state.yaw += Math.max(-maximum, Math.min(maximum, angleDelta(state.yaw, desiredYaw)));
    if (Math.abs(angleDelta(state.yaw, desiredYaw)) < .03) { state.mode = 'run-out'; state.elapsed = 0; }
    return false;
  }
  const before = [...state.position], remaining = distance(before, state.runOutGoal);
  const travel = Math.min(remaining, state.definition.moves.charge.speed * dt);
  state.yaw = desiredYaw;
  if (remaining > 0) for (const axis of [0, 2]) state.position[axis] += (state.runOutGoal[axis] - before[axis]) / remaining * travel;
  // Relative displacement survives the island wrapper's local/world translation.
  state.runOutContact = { offset: before.map((v, axis) => v - state.position[axis]), yaw: state.yaw };
  return remaining <= travel + .01;
}

/** Includes the final travel frame, but never the stationary turn or later idle. */
export const hasRunOutContact = state => state.mode === 'run-out'
  || Boolean(state.runOutContact) && ['turn-back', 'idle'].includes(state.mode);

export function runOutTouchesPlayer(state, player) {
  if (!hasRunOutContact(state) || state.attackHit) return false;
  const offset = state.runOutContact?.offset ?? [0, 0, 0];
  const samples = Math.max(1, Math.ceil(Math.hypot(...offset) / .25));
  for (let i = 0; i <= samples; i++) {
    const position = state.position.map((v, axis) => v + offset[axis] * i / samples);
    if (behemothPushOut({ ...state, position, yaw: state.runOutContact?.yaw ?? state.yaw }, player, .41, 1.72)) return true;
  }
  return false;
}
