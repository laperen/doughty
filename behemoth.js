import { createWoundMeter, resolveWound, stepWounds } from './wounds.js';
import { createTimedMode, activatePendingMode, advanceTimedMode } from './behemoth-states.js';

const SIZE_SCALE = 1.2;

/** Renderer-independent first encounter. Distances are world units and time is seconds. */
export const BEHEMOTH = Object.freeze({
  maxHealth: 1200,
  maxStagger: 260,
  staggerThresholdMultiplier: 1.5,
  staggerDuration: 10,
  staggerMultipliers: Object.freeze({ head: 1, leftFore: 0.5, rightFore: 0.5, leftHind: 0.5, rightHind: 0.5 }),
  partBreakDuration: 5,
  states: Object.freeze({
    enrage: Object.freeze({ enabled: true, damageFraction: 0.25, waitMultiplier: 0.85, durations: Object.freeze([20, 30, 40]) }),
    // Reserved independently; no elemental trigger or behavior is wired yet.
    aetherCharge: Object.freeze({ enabled: false, durations: Object.freeze([20, 30, 40]) }),
  }),
  parts: Object.freeze(Object.fromEntries([
    ['tail', 'Tail', 100], ['head', 'Head', 185],
    ['leftFore', 'Left front leg', 200], ['rightFore', 'Right front leg', 200],
    ['leftHind', 'Left hind leg', 200], ['rightHind', 'Right hind leg', 200],
    ['horn', 'Horn', 220],
  ].map(([id, label, health]) => [id, Object.freeze({ label, health, woundable: id !== 'horn', woundHealth: 120 })]))),
  sizeScale: SIZE_SCALE,
  bodyRadius: 1.15 * SIZE_SCALE,
  bodyHeight: 2.2 * SIZE_SCALE,
  pacing: Object.freeze({
    afterCharge: 0.9,
    afterClaw: 0.9,
    afterSweep: 1.1,
    afterRetreat: 0.4,
    afterChase: 0.7,
    circleDuration: 0.8,
    retreatDuration: 1.5,
    runOutEvery: 2,
    runOutDistance: 32,
    runOutTurnSpeed: 6,
  }),
  moves: Object.freeze({
    enrageBurst: Object.freeze({ tell: 0.8, active: 0.25, recovery: 0.55, damage: 20, reach: 4 * SIZE_SCALE, arc: 360 }),
    charge: Object.freeze({ tell: 0.72, active: 1.08, recovery: 1.12, speed: 16, damage: 28, reach: 1.6 * SIZE_SCALE, arc: 80, interruptStart: 0.25, interruptEnd: 0.92, steeringSpeed: 80 * Math.PI / 180, steeringGain: 6, steeringCone: Math.PI / 3 }),
    claw: Object.freeze({ tell: 0.42, active: 0.22, recovery: 0.62, damage: 16, reach: 2.2 * SIZE_SCALE, arc: 95 }),
    sweep: Object.freeze({ tell: 0.68, active: 0.32, recovery: 0.86, damage: 21, reach: 2.55 * SIZE_SCALE, arc: 210 }),
  }),
});

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const facingVector = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const advanceTurn = (state, targetYaw, maximum) => { state.yaw += clamp(angleDelta(state.yaw, targetYaw), -maximum, maximum); };
const horizontalDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function createBehemothState() {
  return {
    position: [0, -0.025, -12], yaw: Math.PI, mode: 'idle', move: null,
    elapsed: 0, pause: 0.65, health: BEHEMOTH.maxHealth,
    stagger: 0, staggerThreshold: BEHEMOTH.maxStagger, trueStaggerCount: 0,
    states: { enrage: createTimedMode(), aetherCharge: createTimedMode() },
    parts: Object.fromEntries(Object.keys(BEHEMOTH.parts).map(id => [id, { damage: 0, broken: false, ...createWoundMeter(BEHEMOTH.parts[id]) }])),
    chargeCount: 0, closeCount: 0, attackCount: 0, lastMove: null,
    lastRunOutAttackCount: 0, runOutGoal: null, returnCharge: false, chargeDuration: null,
    repositionedAfterAttack: false, lastRetreatAfterCloseCount: -1,
    canTargetKnockedDownPlayers: false,
    attackHit: false, flash: 0, lastOutcome: '',
  };
}

export function isInterruptible(state) {
  return state.mode === 'active' && state.move === 'charge'
    && state.elapsed >= BEHEMOTH.moves.charge.interruptStart
    && state.elapsed <= (state.returnCharge ? state.chargeDuration - 0.16 : BEHEMOTH.moves.charge.interruptEnd);
}

function startMove(state, move) {
  state.runOutGoal = null; state.returnCharge = false; state.chargeDuration = null;
  state.mode = 'windup';
  state.move = move;
  state.elapsed = 0;
  state.attackHit = false;
  state.lastMove = move;
  state.attackCount += 1;
  state.repositionedAfterAttack = false;
  if (move === 'charge') state.chargeCount += 1;
  else state.closeCount += 1;
}

function react(state, kind, duration) {
  state.runOutGoal = null; state.returnCharge = false; state.chargeDuration = null;
  state.mode = 'reaction';
  state.move = kind;
  state.elapsed = 0;
  state.pause = duration;
  state.attackHit = false;
  state.lastOutcome = kind;
}

function activateEnrage(state) {
  if (!activatePendingMode(state.states.enrage, BEHEMOTH.states.enrage, ['windup', 'active', 'recovery', 'reaction', 'defeated'].includes(state.mode))) return false;
  // Committed attacks and reactions finish before entry. Reactions can cancel the burst normally.
  state.runOutGoal = null; state.returnCharge = false; state.chargeDuration = null;
  state.mode = 'windup'; state.move = 'enrageBurst'; state.elapsed = 0; state.attackHit = false;
  return true;
}

function observe(state, duration) {
  state.runOutGoal = null; state.returnCharge = false; state.chargeDuration = null;
  state.mode = 'observe';
  state.move = null;
  state.elapsed = 0;
  state.pause = duration * (state.states.enrage.active ? BEHEMOTH.states.enrage.waitMultiplier : 1);
}

function startRunOut(state, playerPosition, bounds) {
  // Snapshot a target-relative destination, favoring a sprint away from the hunter.
  // Choose an alternate direction near boundaries without chasing a moving target.
  const radius = Math.max(1, bounds - 2);
  const awayYaw = horizontalDistance(state.position, playerPosition) > 0.01
    ? yawTo(playerPosition, state.position) : state.yaw;
  let bestScore = -Infinity;
  for (let i = 0; i < 32; i++) {
    const angle = awayYaw + i * Math.PI / 16;
    const [x, z] = facingVector(angle);
    const goal = [playerPosition[0] + x * BEHEMOTH.pacing.runOutDistance, state.position[1], playerPosition[2] + z * BEHEMOTH.pacing.runOutDistance];
    if (Math.hypot(goal[0], goal[2]) > radius) continue;
    const score = Math.cos(angle - awayYaw);
    if (score > bestScore) { bestScore = score; state.runOutGoal = goal; }
  }
  // Smaller arenas may not fit the authored separation at all.
  if (bestScore === -Infinity) {
    const [x, z] = facingVector(awayYaw);
    const goal = [playerPosition[0] + x * BEHEMOTH.pacing.runOutDistance, state.position[1], playerPosition[2] + z * BEHEMOTH.pacing.runOutDistance];
    const scale = Math.min(1, radius / Math.hypot(goal[0], goal[2]));
    state.runOutGoal = [goal[0] * scale, goal[1], goal[2] * scale];
  }
  state.lastRunOutAttackCount = state.attackCount;
  state.mode = 'run-out-turn'; state.move = null; state.elapsed = 0; state.attackHit = false;
}

/** Breaks are recorded independently of the winning reaction, including on lethal hits. */
export function hitBehemoth(state, { damage = 0, partDamage = damage, stagger = 0, wound = 0, attackerModifiers, part = 'body', interrupt = false } = {}) {
  if (state.mode === 'defeated') return { outcome: 'ignored' };
  const woundResult = resolveWound(state.parts[part], BEHEMOTH.parts[part], wound, attackerModifiers);
  const trueStagger = state.mode === 'reaction' && state.move === 'true-stagger';
  const meter = state.parts[part];
  const previousDamage = meter?.damage ?? 0;
  let brokenPart = null;
  if (meter && !meter.broken) {
    meter.damage = Math.min(BEHEMOTH.parts[part].health, meter.damage + Math.max(0, partDamage));
    if (meter.damage >= BEHEMOTH.parts[part].health) {
      meter.broken = true;
      brokenPart = part;
    }
  }
  const result = outcome => {
    if (state.mode !== 'defeated') activateEnrage(state);
    return { ...woundResult, outcome, brokenPart, part, partDamage: meter ? meter.damage - previousDamage : 0 };
  };
  const coreDamage = Math.min(state.health, Math.max(0, damage));
  const enrage = state.states.enrage;
  // Fresh damage builds each inactive cycle; active-phase damage is not banked.
  if (!enrage.active && !enrage.pending) {
    enrage.buildup += coreDamage;
    enrage.pending = enrage.buildup >= BEHEMOTH.maxHealth * BEHEMOTH.states.enrage.damageFraction;
  }
  state.health = Math.max(0, state.health - Math.max(0, damage));
  state.flash = 0.16;
  if (state.health === 0) {
    state.mode = 'defeated'; state.move = null; state.elapsed = 0; state.lastOutcome = 'defeated';
    for (const mode of Object.values(state.states)) { mode.active = false; mode.pending = false; mode.remaining = 0; }
    return result('defeated');
  }
  if (!trueStagger) {
    state.stagger = Math.min(state.staggerThreshold, state.stagger + Math.max(0, stagger) * (BEHEMOTH.staggerMultipliers[part] ?? 0));
  }
  // True stagger, interrupt, and part break each own a separate reaction.
  if (state.stagger >= state.staggerThreshold) {
    state.stagger = 0;
    state.trueStaggerCount += 1;
    state.staggerThreshold = BEHEMOTH.maxStagger * BEHEMOTH.staggerThresholdMultiplier ** state.trueStaggerCount;
    react(state, 'true-stagger', BEHEMOTH.staggerDuration);
    return result('true-stagger');
  }
  if (brokenPart && !trueStagger) {
    react(state, 'part-break', BEHEMOTH.partBreakDuration);
    return result('part-break');
  }
  if (['head', 'horn'].includes(part) && interrupt && isInterruptible(state)) {
    react(state, 'interrupt', BEHEMOTH.staggerDuration);
    return result('interrupt');
  }
  return result('hit');
}

/** Fixed-step AI. Attack events are resolved by the caller against the player. */
export function stepBehemoth(state, playerPosition, dt, bounds = 68, { targetKnockedDown = false, canTargetKnockedDownPlayers = state.canTargetKnockedDownPlayers } = {}) {
  stepWounds(state.parts, dt);
  const events = [];
  if (state.mode === 'defeated') return events;
  for (const mode of Object.values(state.states)) advanceTimedMode(mode, dt);
  state.flash = Math.max(0, state.flash - dt);
  const distance = horizontalDistance(state.position, playerPosition);
  const targetYaw = yawTo(state.position, playerPosition);
  if (state.mode === 'reaction') {
    state.elapsed += dt;
    if (state.elapsed >= state.pause) {
      state.mode = 'idle'; state.move = null; state.elapsed = 0; state.pause = 0.4;
      if (activateEnrage(state)) events.push({ type: 'enrage-start' });
    }
    return events;
  }
  if (activateEnrage(state)) events.push({ type: 'enrage-start' });
  if (state.mode === 'windup' || state.mode === 'active' || state.mode === 'recovery') {
    const move = BEHEMOTH.moves[state.move];
    state.elapsed += dt;
    if (state.mode === 'windup') {
      if (!targetKnockedDown || canTargetKnockedDownPlayers) advanceTurn(state, targetYaw, dt * (state.move === 'charge' ? 1.9 : 3.2));
      if (state.elapsed >= move.tell) {
        if (state.returnCharge) {
          // Lock travel time at launch; steering cannot prolong the charge.
          state.chargeDuration = clamp((distance + 4) / move.speed, move.active, (bounds * 2 + 4) / move.speed);
        }
        state.mode = 'active'; state.elapsed = 0; events.push({ type: 'attack-start', move: state.move });
      }
    } else if (state.mode === 'active') {
      if (state.move === 'charge') {
        const error = angleDelta(state.yaw, targetYaw);
        // Gentle forward tracking stops near contact, allowing late dodges and overshoots.
        if ((!targetKnockedDown || canTargetKnockedDownPlayers) && distance > move.reach + 2
          && Math.abs(error) < move.steeringCone) {
          advanceTurn(state, targetYaw, Math.min(move.steeringSpeed, Math.abs(error) * move.steeringGain) * dt);
        }
        const [x, z] = facingVector(state.yaw);
        const travel = move.speed * dt;
        const nextX = clamp(state.position[0] + x * travel, -bounds, bounds);
        const nextZ = clamp(state.position[2] + z * travel, -bounds, bounds);
        state.position[0] = nextX; state.position[2] = nextZ;
      } else if (!targetKnockedDown || canTargetKnockedDownPlayers) advanceTurn(state, targetYaw, dt * 1.0);
      events.push({ type: 'attack-active', move: state.move });
      if (state.elapsed >= (state.move === 'charge' ? state.chargeDuration ?? move.active : move.active)) { state.mode = 'recovery'; state.elapsed = 0; }
    } else if (state.elapsed >= move.recovery) {
      const basePause = state.move === 'enrageBurst' ? 0.5 : state.move === 'charge' ? BEHEMOTH.pacing.afterCharge
        : state.move === 'claw' ? BEHEMOTH.pacing.afterClaw : BEHEMOTH.pacing.afterSweep;
      // Alternating a little prevents the same attack-to-attack rhythm every time.
      observe(state, basePause + (state.attackCount % 2 === 0 ? 0.2 : 0));
      if (activateEnrage(state)) events.push({ type: 'enrage-start' });
    }
    return events;
  }
  // Awareness remains positional; eligibility only controls choosing new attacks.
  // Authored state/circumstance overrides can enable attacks on downed hunters.
  if (targetKnockedDown && !canTargetKnockedDownPlayers) {
    state.runOutGoal = null; state.returnCharge = false; state.chargeDuration = null;
    state.mode = 'circle'; state.move = null; state.elapsed += dt; state.pause = 0.25;
    advanceTurn(state, targetYaw, dt * 2.8);
    const [x, z] = facingVector(state.yaw);
    const retreat = distance < 4 ? 2 : 0;
    state.position[0] = clamp(state.position[0] + (-z * 2.7 - x * retreat) * dt, -bounds, bounds);
    state.position[2] = clamp(state.position[2] + (x * 2.7 - z * retreat) * dt, -bounds, bounds);
    return events;
  }
  if (['run-out-turn', 'run-out', 'turn-back'].includes(state.mode)) {
    state.elapsed += dt;
    const goal = state.runOutGoal;
    const desiredYaw = state.mode === 'turn-back' ? targetYaw : yawTo(state.position, goal);
    if (state.mode !== 'run-out') {
      advanceTurn(state, desiredYaw, BEHEMOTH.pacing.runOutTurnSpeed * dt);
      if (Math.abs(angleDelta(state.yaw, desiredYaw)) < 0.03) {
        if (state.mode === 'turn-back') {
          startMove(state, 'charge'); state.returnCharge = true;
        } else { state.mode = 'run-out'; state.elapsed = 0; }
      }
    } else {
      const remaining = horizontalDistance(state.position, goal);
      const travel = Math.min(remaining, BEHEMOTH.moves.charge.speed * dt);
      state.yaw = desiredYaw;
      if (remaining > 0) for (const i of [0, 2]) state.position[i] += (goal[i] - state.position[i]) / remaining * travel;
      if (remaining <= travel + 0.01) { state.mode = 'turn-back'; state.elapsed = 0; }
    }
    return events;
  }
  advanceTurn(state, targetYaw, dt * (state.mode === 'observe' ? 1.6 : 2.8));
  state.pause = Math.max(0, state.pause - dt);
  if (state.mode === 'observe') {
    state.elapsed += dt;
    if (state.pause > 0) return events;
    state.mode = 'idle';
    state.elapsed = 0;
  }
  if (state.mode === 'circle') {
    state.elapsed += dt;
    const [forwardX, forwardZ] = facingVector(state.yaw);
    const side = state.attackCount % 2 === 0 ? 1 : -1;
    state.position[0] = clamp(state.position[0] + side * -forwardZ * 2.7 * dt, -bounds, bounds);
    state.position[2] = clamp(state.position[2] + side * forwardX * 2.7 * dt, -bounds, bounds);
    if (state.pause === 0) observe(state, 0.25);
    return events;
  }
  if (state.mode === 'retreat') {
    state.elapsed += dt;
    const [x, z] = facingVector(state.yaw);
    state.position[0] = clamp(state.position[0] - x * 4.8 * dt, -bounds, bounds);
    state.position[2] = clamp(state.position[2] - z * 4.8 * dt, -bounds, bounds);
    if (distance >= 9 || state.pause === 0) observe(state, BEHEMOTH.pacing.afterRetreat);
    return events;
  }
  if (state.mode === 'chase') {
    state.elapsed += dt;
    const [x, z] = facingVector(state.yaw);
    state.position[0] = clamp(state.position[0] + x * 4.4 * dt, -bounds, bounds);
    state.position[2] = clamp(state.position[2] + z * 4.4 * dt, -bounds, bounds);
    if (distance <= 11) observe(state, BEHEMOTH.pacing.afterChase);
    return events;
  }
  if (state.pause > 0) return events;
  if (state.attackCount - state.lastRunOutAttackCount >= BEHEMOTH.pacing.runOutEvery) {
    startRunOut(state, playerPosition, bounds);
    return events;
  }
  if (distance > 19) { state.mode = 'chase'; state.elapsed = 0; return events; }
  if (distance < 3.1 * BEHEMOTH.sizeScale) {
    if (!state.states.enrage.active && state.closeCount > 0 && state.closeCount % 2 === 0
      && state.closeCount !== state.lastRetreatAfterCloseCount && state.lastMove !== 'charge') {
      state.lastRetreatAfterCloseCount = state.closeCount;
      state.mode = 'retreat'; state.pause = BEHEMOTH.pacing.retreatDuration; state.elapsed = 0;
      state.repositionedAfterAttack = true;
      return events;
    }
    // Enraged close rotation chooses the heavier sweep twice per three attacks.
    startMove(state, state.states.enrage.active ? (state.closeCount % 3 === 2 ? 'claw' : 'sweep') : (state.closeCount % 2 === 0 ? 'claw' : 'sweep'));
  } else if (distance < 5.5 * BEHEMOTH.sizeScale) {
    state.mode = 'retreat'; state.pause = BEHEMOTH.pacing.retreatDuration; state.elapsed = 0;
    state.repositionedAfterAttack = true;
  }
  else if (!state.states.enrage.active && state.lastMove === 'charge' && !state.repositionedAfterAttack) {
    state.repositionedAfterAttack = true;
    state.mode = 'circle'; state.pause = BEHEMOTH.pacing.circleDuration; state.elapsed = 0;
  } else startMove(state, 'charge');
  return events;
}

export function behemothAttackTouchesPlayer(state, playerPosition) {
  const move = BEHEMOTH.moves[state.move];
  if (!move || state.mode !== 'active' || state.attackHit) return false;
  const dx = playerPosition[0] - state.position[0];
  const dz = playerPosition[2] - state.position[2];
  const distance = Math.hypot(dx, dz);
  if (state.move === 'enrageBurst') return Math.hypot(dx, dz, playerPosition[1] - state.position[1]) <= move.reach + 0.36;
  if (distance > move.reach + 0.36) return false;
  const [x, z] = facingVector(state.yaw);
  return distance < 0.01 || (dx * x + dz * z) / distance >= Math.cos(move.arc * Math.PI / 360);
}
