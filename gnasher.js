import { BEHEMOTH, hitBehemoth as sharedHit, isInterruptible as chargeInterruptible } from './behemoth.js';
import { tierDefinition } from './behemoth-tiers.js';
import { createTimedMode, activatePendingMode, advanceTimedMode } from './behemoth-states.js';
import { createWoundMeter, stepWounds } from './wounds.js';
import { startRunOut, stepRunOut, hasRunOutContact, runOutTouchesPlayer } from './behemoth-run-out.js';

/** Original neutral creature. Unmeasured values are initial tuning, in seconds/model units. */
export const GNASHER = Object.freeze({
  name: 'Gnasher', sizeScale: 1.2, bodyRadius: 1.55 * 1.2, bodyHeight: 2.8 * 1.2, modelSpaceMoves: true,
  maxHealth: 1350, maxStagger: 280, staggerThresholdMultiplier: 1.5,
  staggerDuration: BEHEMOTH.staggerDuration, partBreakDuration: BEHEMOTH.partBreakDuration, interruptDuration: 5,
  staggerMultipliers: BEHEMOTH.staggerMultipliers,
  pacing: { ...BEHEMOTH.pacing, maxChaseDuration: 3, afterEnrageRetreat: 1.2 },
  states: { enrage: { ...BEHEMOTH.states.enrage }, aetherCharge: { enabled: false, interval: 90, durations: [20] } },
  parts: Object.fromEntries([
    ['head', 'Head', 210], ['tail', 'Tail', 240],
    ['leftFore', 'Left front leg', 220], ['rightFore', 'Right front leg', 220],
    ['leftHind', 'Left hind leg', 220], ['rightHind', 'Right hind leg', 220],
  ].map(([id, label, health]) => [id, { label, health, woundable: true, woundHealth: 145 }])),
  moves: {
    runOut: { damage: 10, contactOnly: true, burning: false },
    charge: { tell: 0.8, active: 1.05, recovery: 1.15, speed: 13, damage: 28, reach: 3.4, interruptStart: 0.2, interruptEnd: 0.85 },
    tailSweep: { tell: 0.75, active: 0.4, recovery: 1, damage: 22, reach: 5, arc: 220 },
    footSlam: { tell: 0.8, active: 0.2, recovery: 1, damage: 24, reach: 3.6 },
    tailSlam: { tell: 0.9, active: 0.2, recovery: 0.65, damage: 28, reach: 5.5 },
    // The shared Embermane enrage entry supplies the common warning/burst convention.
    enrageBurst: { ...BEHEMOTH.moves.enrageBurst, reach: 4 },
  },
});
export const GNASHER_TUNING = Object.freeze({
  enrageStomp: Object.freeze({ tell: .25, active: .1, recovery: .15 }),
  tailSlams: 4, tailChaseStep: .45, tailChaseWindow: .45, tailBlastStart: 1.5,
  blastCount: 6, blastRadius: 1.2, blastDelay: 0.12, blastLife: 0.4, blastDamage: 18,
  // These waits follow move recovery; they do not apply between combo strikes.
  afterAttack: Object.freeze({ charge: 1, footSlam: 1.2, tailSweep: 1.2, tailSlam: 1.5, enrageBurst: .6 }) });
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const yawTo = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
const delta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const isTailMove = move => move === 'tailSlam' || move === 'tailSweep';
export const hasGnasherBlastChain = s => ['greater', 'alpha'].includes(s.tier);

export function createGnasherState(tier = 'normal') {
  const definition = tierDefinition(GNASHER, tier);
  // Neutral content has no authored aether ability. Do not inherit the helper's
  // Lesser/Alpha elemental enable rule or accidentally acquire Embermane burning.
  definition.states.aetherCharge = { ...GNASHER.states.aetherCharge };
  return { definition, tier, speciesId: 'gnasher', position: [0, -0.025, -12], yaw: Math.PI,
    mode: 'idle', move: null, elapsed: 0, pause: 0.65, health: definition.maxHealth,
    stagger: 0, staggerThreshold: definition.maxStagger, trueStaggerCount: 0,
    states: { enrage: createTimedMode(), aetherCharge: createTimedMode() },
    parts: Object.fromEntries(Object.entries(definition.parts).map(([id, part]) => [id, { damage: 0, broken: false, ...createWoundMeter(part) }])),
    attackCount: 0, closeCount: 0, attackHit: false, flash: 0, lastOutcome: '',
    enrageEntry: null, canTargetKnockedDownPlayers: false, side: 1, slamCombo: null, blastDirection: [0, 0, 1],
    enrageExitPending: false, runOutCount: 0, runOutGoal: null, runOutContact: null,
    projectiles: [], impactEvents: [], projectileSerial: 0,
  };
}
/** Entry stomps reuse foot-slam damage but have their own rapid cadence. */
export function gnasherMoveDefinition(s) {
  const move = s.definition.moves[s.move];
  return s.enrageEntry && s.move === 'footSlam' ? { ...move, ...GNASHER_TUNING.enrageStomp } : move;
}
export const isGnasherInterruptible = chargeInterruptible;
export function hitGnasher(s, hit) {
  const result = sharedHit(s, hit);
  if (result.outcome === 'interrupt') s.pause = s.definition.interruptDuration;
  if (['reaction', 'defeated'].includes(s.mode)) { s.enrageEntry = null; s.slamCombo = null; s.slamStep = null; s.runOutContact = null; }
  if (s.mode === 'defeated') { s.enrageExitPending = false; s.runOutGoal = null; }
  return result;
}
function turn(s, target, dt) {
  s.yaw += Math.max(-dt * 2.5, Math.min(dt * 2.5, delta(s.yaw, yawTo(s.position, target))));
}
/** Commit aiming once per attack, including each strike of the enraged combo. */
export function startGnasherMove(s, move, target) {
  if (!s.definition.moves[move]) throw new RangeError(`Unknown Gnasher move: ${move}`);
  if (s.definition.moves[move].contactOnly) return false;
  if (isTailMove(move) && s.parts.tail.broken) return false;
  if (move === 'tailSlam' && (!s.definition.states.enrage.enabled || !s.states.enrage.active)) return false;
  if (move !== 'tailSlam') s.slamCombo = null;
  else s.slamCombo ??= { cycle: 0, count: GNASHER_TUNING.tailSlams };
  const targetYaw = yawTo(s.position, target);
  s.side = delta(s.yaw, targetYaw) >= 0 ? -1 : 1;
  s.windupYaw = s.yaw;
  s.committedYaw = move === 'footSlam' ? targetYaw + s.side * Math.atan2(1.65, .7)
    : ['tailSlam', 'tailSweep'].includes(move) ? targetYaw + Math.PI : targetYaw;
  // Relative coordinates survive the encounter wrapper's temporary local-space transform.
  s.aimOffset = target.map((v, axis) => v - s.position[axis]);
  const length = distance(s.position, target);
  s.slamStep = move === 'tailSlam' && s.slamCombo.cycle > 0 ? {
    direction: [-Math.sin(targetYaw), 0, -Math.cos(targetYaw)], moved: 0,
    distance: Math.min(GNASHER_TUNING.tailChaseStep, Math.max(0, length - 3 * s.definition.sizeScale)),
  } : null;
  Object.assign(s, { mode: 'windup', move, elapsed: 0, attackHit: false, attackCount: s.attackCount + 1 });
  s.blastDirection = [-Math.sin(targetYaw), 0, -Math.cos(targetYaw)];
  return true;
}
export function gnasherLocalPoint(s, x, z) {
  const scale = s.definition.sizeScale, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  return [s.position[0] + (c * x + sn * z) * scale, s.position[1], s.position[2] + (-sn * x + c * z) * scale];
}
function releaseBlasts(s) {
  if (!hasGnasherBlastChain(s) || !['tailSlam', 'footSlam'].includes(s.move)) return;
  const target = s.position.map((v, axis) => v + s.aimOffset[axis]);
  // Start near the tail base, always inside the captured target's distance.
  // A tail-tip origin could overshoot a nearby hunter and reverse the entire row.
  const tailStart = Math.min(GNASHER_TUNING.tailBlastStart, distance(s.position, target) / (2 * s.definition.sizeScale));
  const origin = s.move === 'tailSlam' ? gnasherLocalPoint(s, 0, tailStart) : gnasherLocalPoint(s, s.side * 1.65, -0.7);
  const radius = GNASHER_TUNING.blastRadius * s.definition.sizeScale;
  const length = distance(origin, target);
  const direction = length > 1e-6 ? [(target[0] - origin[0]) / length, 0, (target[2] - origin[2]) / length] : s.blastDirection;
  s.blastDirection = [...direction];
  for (let i = 0; i < GNASHER_TUNING.blastCount; i++) {
    s.projectiles.push({ id: ++s.projectileSerial, kind: 'ground-blast', age: 0, emitted: false,
      delay: i * GNASHER_TUNING.blastDelay, life: GNASHER_TUNING.blastLife, radius,
      position: origin.map((v, axis) => v + direction[axis] * i * radius * 2),
      damage: GNASHER_TUNING.blastDamage * s.definition.projectileDamageMultiplier });
  }
}
function stepBlasts(s, dt) {
  s.impactEvents = [];
  for (const q of s.projectiles) {
    q.age += dt;
    if (!q.emitted && q.age >= q.delay) { q.emitted = true; s.impactEvents.push({ ...q, position: [...q.position] }); }
  }
  s.projectiles = s.projectiles.filter(q => q.age < q.delay + q.life);
}
export function advanceGnasherTimers(s, dt) {
  const enrage = s.states.enrage;
  if (enrage.active && s.definition.states.enrage.enabled) {
    enrage.remaining = Math.max(0, enrage.remaining - dt);
    if (enrage.remaining === 0) s.enrageExitPending = true;
  } else advanceTimedMode(enrage, dt);
  advanceTimedMode(s.states.aetherCharge, dt);
  s.flash = Math.max(0, s.flash - dt);
}
function startEntryStomp(s, target, options) {
  const entry = s.enrageEntry, side = entry.cycle % 2 === 0 ? -1 : 1;
  const candidates = options.players ?? [{ position: target, knockedDown: options.targetKnockedDown }];
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  const valid = candidates.filter(p => !p.knockedDown &&
    (c * (p.position[0] - s.position[0]) - sn * (p.position[2] - s.position[2])) * side > 1e-8);
  valid.sort((a, b) => distance(s.position, a.position) - distance(s.position, b.position));
  const aim = valid[0]?.position ?? gnasherLocalPoint(s, side * 4, -.7);
  const yaw = s.yaw;
  startGnasherMove(s, 'footSlam', aim);
  // Entry stomps alternate relative to a stationary body; only the blast row aims.
  s.side = side; s.windupYaw = yaw; s.committedYaw = yaw;
}
function enterEnrage(s, target, options) {
  if (!activatePendingMode(s.states.enrage, s.definition.states.enrage,
    ['windup', 'active', 'recovery', 'reaction', 'defeated'].includes(s.mode))) return false;
  s.enrageEntry = { cycle: 0, count: 4 };
  s.slamCombo = null; s.slamStep = null;
  startEntryStomp(s, target, options);
  return true;
}
export function stepGnasher(s, target, dt, bounds = 68, options = {}) {
  s.runOutContact = null;
  if (!['windup', 'active', 'recovery'].includes(s.mode)) s.enrageEntry = null;
  if (s.mode === 'defeated') return [];
  // Also guard restored/externally authored actions; released blasts keep finishing.
  if (s.parts.tail.broken && isTailMove(s.move)) {
    s.slamCombo = null; s.slamStep = null; s.mode = 'idle'; s.move = null; s.elapsed = 0; s.pause = .4;
  }
  stepWounds(s.parts, dt);
  advanceGnasherTimers(s, dt); stepBlasts(s, dt);
  if (s.enrageExitPending && !['windup', 'active', 'recovery', 'reaction', 'run-out-turn', 'run-out'].includes(s.mode)) {
    s.slamCombo = null; s.slamStep = null; startRunOut(s, target, bounds);
  }
  if (enterEnrage(s, target, options)) return [{ type: 'enrage-start' }];
  if (['run-out-turn', 'run-out'].includes(s.mode)) {
    if (stepRunOut(s, dt)) {
      Object.assign(s.states.enrage, { active: false, remaining: 0, buildup: 0 });
      s.enrageExitPending = false; s.runOutGoal = null;
      s.mode = 'idle'; s.move = null; s.elapsed = 0; s.pause = s.definition.pacing.afterEnrageRetreat;
    }
    return [];
  }
  s.elapsed += dt;
  const move = gnasherMoveDefinition(s);
  if (s.mode === 'reaction') {
    s.enrageEntry = null;
    if (s.elapsed >= s.pause) { s.mode = 'idle'; s.move = null; s.elapsed = 0; s.pause = 0.4; enterEnrage(s, target, options); }
  } else if (s.mode === 'windup') {
    if (s.move === 'tailSlam' && s.slamStep) {
      // Reacquire at the next strike, then take one small step toward that point.
      // Keep the captured target fixed while translating the body beneath it.
      const step = s.slamStep;
      const desired = step.distance * Math.min(1, s.elapsed / GNASHER_TUNING.tailChaseWindow);
      const amount = Math.max(0, desired - step.moved), before = [...s.position];
      for (const axis of [0, 2]) s.position[axis] += step.direction[axis] * amount;
      const r = Math.hypot(s.position[0], s.position[2]);
      if (r > bounds) { s.position[0] *= bounds / r; s.position[2] *= bounds / r; }
      for (const axis of [0, 2]) s.aimOffset[axis] -= s.position[axis] - before[axis];
      step.moved = desired;
    }
    if (Number.isFinite(s.committedYaw) && Number.isFinite(s.windupYaw) && s.move !== 'enrageBurst') {
      s.yaw = s.windupYaw + delta(s.windupYaw, s.committedYaw) * Math.min(1, s.elapsed / move.tell);
    }
    if (s.elapsed >= move.tell) { s.mode = 'active'; s.elapsed = 0; releaseBlasts(s); }
  } else if (s.mode === 'active') {
    if (s.move === 'charge') {
      s.position[0] -= Math.sin(s.yaw) * move.speed * dt;
      s.position[2] -= Math.cos(s.yaw) * move.speed * dt;
    }
    if (s.elapsed >= move.active) { s.mode = 'recovery'; s.elapsed = 0; }
  } else if (s.mode === 'recovery') {
    if (s.elapsed >= move.recovery) {
      if (s.enrageEntry && s.move === 'footSlam') {
        if (s.enrageEntry.cycle + 1 < s.enrageEntry.count) {
          s.enrageEntry.cycle++; startEntryStomp(s, target, options);
        } else {
          startGnasherMove(s, 'enrageBurst', target);
        }
      } else if (s.enrageEntry && s.move === 'enrageBurst' && !s.parts.tail.broken) {
        s.enrageEntry = null;
        startGnasherMove(s, 'tailSlam', target);
      } else if (!s.enrageExitPending && !s.parts.tail.broken && s.slamCombo && s.slamCombo.cycle + 1 < s.slamCombo.count && s.states.enrage.active) {
        s.slamCombo.cycle++; startGnasherMove(s, 'tailSlam', target);
      } else {
        const completed = s.move;
        s.enrageEntry = null;
        s.slamCombo = null; s.slamStep = null; s.mode = 'idle'; s.move = null; s.elapsed = 0;
        s.pause = (GNASHER_TUNING.afterAttack[completed] ?? 1.2)
          * (s.states.enrage.active ? s.definition.states.enrage.waitMultiplier : 1);
        s.closeCount++; enterEnrage(s, target, options);
      }
    }
  } else {
    s.pause = Math.max(0, s.pause - dt);
    if (options.targetKnockedDown && !s.canTargetKnockedDownPlayers) {
      if (s.mode === 'chase') s.elapsed = 0;
      return [];
    }
    turn(s, target, dt);
    if (s.pause > 0) {
      if (s.mode === 'chase') s.elapsed = 0;
      return [];
    }
    const d = distance(s.position, target), scale = s.definition.sizeScale;
    if (d > 12 && d < 24) startGnasherMove(s, 'charge', target);
    else {
      const behind = Math.abs(delta(s.yaw, yawTo(s.position, target))) > Math.PI / 2;
      const selected = s.parts.tail.broken ? 'footSlam' : s.states.enrage.active && s.closeCount % 3 === 0 ? 'tailSlam'
        : behind || s.closeCount % 2 ? 'tailSweep' : 'footSlam';
      // The frontal head footprint stops approach at roughly 3.6 model units.
      // A flank-aimed stomp reaches this distance without chasing into solid geometry.
      const range = selected === 'footSlam' ? 3.85 : 4.8;
      if (d > range * scale) {
        // Count only this pursuit, rather than the preceding idle/recovery time.
        // A fleeing hunter or blocked approach must not keep us walking forever.
        if (s.mode === 'chase' && s.elapsed >= s.definition.pacing.maxChaseDuration) startGnasherMove(s, 'charge', target);
        else {
          if (s.mode !== 'chase') s.elapsed = 0;
          s.mode = 'chase'; s.position[0] -= Math.sin(s.yaw) * 3.5 * dt; s.position[2] -= Math.cos(s.yaw) * 3.5 * dt;
        }
      } else startGnasherMove(s, selected, target);
    }
  }
  const r = Math.hypot(s.position[0], s.position[2]);
  if (r > bounds) { s.position[0] *= bounds / r; s.position[2] *= bounds / r; }
  return [];
}
export function gnasherAttackTouchesPlayer(s, p) {
  if (hasRunOutContact(s)) return runOutTouchesPlayer(s, p);
  const m = s.definition.moves[s.move];
  if (s.mode !== 'active' || s.attackHit || !m?.damage) return false;
  if (s.parts.tail.broken && isTailMove(s.move)) return false;
  const dx = p[0] - s.position[0], dz = p[2] - s.position[2], scale = s.definition.sizeScale;
  if (s.move === 'enrageBurst') return Math.hypot(dx, dz, p[1] - s.position[1]) <= m.reach * scale + 0.36;
  if (Math.abs(p[1] - s.position[1]) > s.definition.bodyHeight) return false;
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), x = (c * dx - sn * dz) / scale, z = (sn * dx + c * dz) / scale;
  const pad = 0.36 / scale;
  if (s.move === 'footSlam') return x * s.side > 1e-8 && Math.hypot(x - s.side * 1.65, z + 0.7) <= 1.9 + pad;
  if (s.move === 'tailSlam') {
    // The torso lands with the tail. Both volumes share this strike's hit identity.
    const body = Math.hypot(x / (1.55 + pad), (z + .3) / (2.2 + pad)) <= 1;
    const tail = z > 1 && Math.abs(x) <= 1.2 + pad && z <= m.reach + pad;
    return body || tail;
  }
  if (s.move === 'tailSweep') return Math.hypot(x, z) <= m.reach + pad
    && Math.abs(delta(Math.PI, Math.atan2(-x, -z))) <= m.arc * Math.PI / 360;
  return s.move === 'charge' && Math.abs(x) < 1.4 + pad && Math.abs(z) < m.reach + pad;
}
