import { tierDefinition } from './behemoth-tiers.js';
import { applyPartDamage, applyCoreDamage, clearBehemothModes, advanceStaggerThreshold } from './behemoth-damage.js';
import { createWoundMeter, resolveWound, stepWounds } from './wounds.js';
import { BEHEMOTH } from './behemoth.js';
import { createTimedMode, activatePendingMode, advanceTimedMode } from './behemoth-states.js';
import { QUILL_FLIGHT, stepFallingProjectile, hostileProjectileTouches } from './hostile-projectiles.js';

export const QUARTERS = ['quillFrontLeft', 'quillFrontRight', 'quillRearLeft', 'quillRearRight'];
// Unmeasured damage, quill durability and cadence are deliberately centralized here.
export const QUILLSHOT = Object.freeze({
  name: 'Quillshot', maxHealth: 1440, maxStagger: BEHEMOTH.maxStagger,
  bodyRadius: 2.7, bodyHeight: 5.1, sizeScale: 1.5, modelSpaceMoves: true,
  pacing: { maxChaseDuration: 3 },
  states: { enrage: { ...BEHEMOTH.states.enrage, waitMultiplier: 1 } },
  parts: Object.fromEntries([
    ['head', 'Head', 222], ['tail', 'Tail', 200],
    ['leftFore', 'Left front leg', 240], ['rightFore', 'Right front leg', 240],
    ['leftHind', 'Left hind leg', 240], ['rightHind', 'Right hind leg', 240],
    ['leftTusk', 'Left tusk', 176], ['rightTusk', 'Right tusk', 176],
    ...QUARTERS.map((id, i) => [id, ['Front left quills', 'Front right quills', 'Rear left quills', 'Rear right quills'][i], 90]),
  ].map(([id, label, health]) => [id, { label, health, woundable: !QUARTERS.includes(id) && !id.endsWith('Tusk'), woundHealth: 160, quills: QUARTERS.includes(id) }])),
  quills: { ...QUILL_FLIGHT, damage: 16, cadence: 1.25, intermittentCadence: 2, intermittentCount: 3, regrowth: 60, sideSpeed: 15, sideLife: 1.5 },
  moves: {
    charge: { tell: 1, active: 0.7, recovery: 1.7, speed: 15, damage: 28, reach: 3, arc: 85 },
    swipe: { tell: 0.8, active: 0.3, recovery: 1, damage: 18, reach: 3.4, arc: 150 },
    slam: { tell: 1, active: 0.3, recovery: 1.2, damage: 24, reach: 3.5, arc: 110 },
    sideDrop: { tell: 1, active: 1.2, recovery: 1.2, damage: 25, reach: 3.5, arc: 180 },
    intermittent: { tell: 1, active: 4.01, recovery: 1, damage: 0 },
    bombardment: { tell: 1.2, active: 3, enragedActive: 6, recovery: 1.2, damage: 0 },
    enrage: { tell: 1, active: 0.1, recovery: 0.3, damage: 0 },
  },
});
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const yawTo = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
const delta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const barrage = move => move === 'bombardment' || move === 'intermittent';
export const SIDE_COMBO = Object.freeze({ repeats: 3, sweep: Math.PI * 2 / 3, spinDuration: 1, quills: 13 });
const rankedSideDrop = s => s.move === 'sideDrop' && ['greater', 'alpha'].includes(s.tier);
const turn = (s, p, dt) => { s.yaw += Math.max(-dt * 2.5, Math.min(dt * 2.5, delta(s.yaw, yawTo(s.position, p)))); };
export function createQuillshotState(seed = Math.floor(Math.random() * 4294967296), tier = 'normal') {
  const definition = tierDefinition(QUILLSHOT, tier);
  return { definition, tier, speciesId: 'quillshot', position: [0, -0.025, -12], yaw: Math.PI, mode: 'idle', move: null,
    elapsed: 0, pause: 0.5, health: definition.maxHealth, stagger: 0, staggerThreshold: definition.maxStagger,
    trueStaggerCount: 0, states: { enrage: createTimedMode(), aetherCharge: createTimedMode() },
    parts: Object.fromEntries(Object.keys(definition.parts).map(id => [id, { damage: 0, broken: false, ...createWoundMeter(definition.parts[id]) }])),
    flash: 0, attackHit: false, attackCount: 0, opened: false, meleeCount: 0, afterRetreat: false,
    forceBarrage: false, regrowthClock: 0, regrowthFlash: 0, projectiles: [], projectileSerial: 0,
    impactEvents: [], rng: seed >>> 0, side: 1, canTargetKnockedDownPlayers: false };
}
function random(s) { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; }
export function restoreQuills(s) {
  for (const id of QUARTERS) Object.assign(s.parts[id], { damage: 0, broken: false });
  s.regrowthFlash = 1;
}
export function quillQuarterFor(s, target) {
  const a = delta(s.yaw, yawTo(s.position, target));
  const front = Math.cos(a) >= 0;
  const left = Math.sin(a) >= 0;
  return front ? (left ? QUARTERS[0] : QUARTERS[1]) : (left ? QUARTERS[2] : QUARTERS[3]);
}
export function sideHalfEnabled(s, front) {
  return (front ? QUARTERS.slice(0, 2) : QUARTERS.slice(2)).some(id => !s.parts[id].broken);
}
export function isQuillshotInterruptible(s) { return s.mode === 'active' && barrage(s.move); }
function start(s, move, target) {
  s.move = move; s.mode = 'windup'; s.elapsed = 0; s.attackHit = false; s.attackCount++;
  s.activeDuration = move === 'bombardment' && s.states.enrage.active ? 6 : (s.definition ?? QUILLSHOT).moves[move].active;
  s.nextVolley = 0; s.volleyCount = 0; s.sideReleased = false;
  s.sideCombo = null;
  if (move === 'sideDrop') {
    random(s); // Preserve the move-selection RNG sequence used before flank aiming.
    s.sideTarget = [...(target ?? s.position)];
    // Choose the nearer flank so the committed turn completes during the tell.
    s.side = delta(s.yaw, yawTo(s.position, s.sideTarget)) >= 0 ? 1 : -1;
    if (rankedSideDrop(s)) s.sideCombo = { cycle: 0, emitted: 0, startYaw: null, spinYaw: null, phase: 'fall' };
  }
  s.queuedMeleeTarget = null;
}
function enrage(s) {
  if (!activatePendingMode(s.states.enrage, (s.definition ?? QUILLSHOT).states.enrage, ['windup', 'active', 'recovery', 'reaction', 'defeated'].includes(s.mode))) return;
  restoreQuills(s); s.forceBarrage = true; start(s, 'enrage');
}
function react(s, move, seconds) { s.sideCombo = null; s.mode = 'reaction'; s.move = move; s.elapsed = 0; s.pause = seconds; }
export function hitQuillshot(s, { damage = 0, partDamage = damage, stagger = 0, wound = 0, attackerModifiers, part = 'body', interrupt = false } = {}) {
  if (s.mode === 'defeated') return { outcome: 'ignored' };
  const woundResult = resolveWound(s.parts[part], (s.definition ?? QUILLSHOT).parts[part], wound, attackerModifiers);
  const { brokenPart, partDamage: appliedPartDamage } = applyPartDamage(s, (s.definition ?? QUILLSHOT), part, partDamage);
  // Back quills have independent durability; striking them does not damage core health.
  if (!(s.definition ?? QUILLSHOT).parts[part]?.quills) applyCoreDamage(s, (s.definition ?? QUILLSHOT), damage);
  s.flash = 0.15;
  let outcome = 'hit';
  const down = s.mode === 'reaction' && s.move === 'true-stagger';
  const staggerDamage = down ? 0 : Math.max(0, stagger) * (BEHEMOTH.staggerMultipliers[part] ?? 0);
  s.stagger += staggerDamage;
  if (s.health <= 0) {
    s.mode = 'defeated'; s.move = null; s.projectiles.length = 0; s.impactEvents.length = 0;
    s.sideCombo = null;
    clearBehemothModes(s);
    outcome = 'defeated';
  } else if (s.stagger >= s.staggerThreshold) {
    advanceStaggerThreshold(s, (s.definition ?? QUILLSHOT).maxStagger, 1.5);
    react(s, 'true-stagger', 10); outcome = 'true-stagger';
  } else if (brokenPart && !QUARTERS.includes(part) && !down) { react(s, 'part-break', 5); outcome = 'part-break'; }
  else if (part === 'head' && interrupt && isQuillshotInterruptible(s)) { react(s, 'interrupt', 5); outcome = 'interrupt'; }
  else if (brokenPart) outcome = QUARTERS.includes(part) ? 'quill-break' : 'hit';
  if (s.mode !== 'defeated') enrage(s);
  return { ...woundResult, staggerDamage, outcome, brokenPart, part, partDamage: appliedPartDamage };
}
function volley(s, players) {
  for (const p of players) {
    const quarter = quillQuarterFor(s, p.position);
    if (s.parts[quarter].broken) continue;
    s.projectiles.push({ id: ++s.projectileSerial, kind: 'fall', targetId: p.id, age: 0, sizeMultiplier: s.definition?.sizeMultiplier ?? 1,
      destination: [...p.position], position: [p.position[0], p.position[1] + 9, p.position[2]], quarter });
  }
}
function sideVolley(s) {
  // Fire toward the falling flank. Each 60-degree half uses its front/rear pair.
  for (let i = 0; i <= 12; i++) {
    const offset = (-60 + i * 10) * Math.PI / 180;
    const angle = s.yaw + s.side * Math.PI / 2 + offset;
    const front = Math.cos(angle - s.yaw) >= 0;
    if (!sideHalfEnabled(s, front)) continue;
    s.projectiles.push({ id: ++s.projectileSerial, kind: 'side', age: 0, sizeMultiplier: s.definition?.sizeMultiplier ?? 1,
      position: [s.position[0], s.position[1] + 0.8 * (s.definition ?? QUILLSHOT).sizeScale, s.position[2]], direction: [-Math.sin(angle), 0, -Math.cos(angle)] });
  }
}
function spinVolley(s, progress) {
  const combo = s.sideCombo;
  const turn = s.side * SIDE_COMBO.sweep;
  while (combo.emitted < SIDE_COMBO.quills && combo.emitted / (SIDE_COMBO.quills - 1) <= progress + 1e-8) {
    const index = combo.emitted++;
    const angle = combo.spinYaw + turn * index / (SIDE_COMBO.quills - 1) + s.side * Math.PI / 2;
    // Keep front/rear quill destruction suppressing its corresponding half.
    if (!sideHalfEnabled(s, index <= (SIDE_COMBO.quills - 1) / 2)) continue;
    s.projectiles.push({ id: ++s.projectileSerial, kind: 'side', age: 0, sizeMultiplier: s.definition.sizeMultiplier,
      position: [s.position[0], s.position[1] + 0.8 * s.definition.sizeScale, s.position[2]],
      direction: [-Math.sin(angle), 0, -Math.cos(angle)], sideCycle: combo.cycle });
  }
  s.yaw = combo.spinYaw + turn * progress;
}
export function advanceQuillshotTimers(s, dt, engaged = true) {
  for (const mode of Object.values(s.states)) advanceTimedMode(mode, dt);
  const charge = s.definition?.states.aetherCharge;
  const mode = s.states.aetherCharge;
  if (charge?.enabled && engaged && !mode.active && s.mode !== 'defeated') {
    mode.buildup += dt;
    mode.pending = mode.buildup >= charge.interval;
    if (activatePendingMode(mode, charge, ['windup', 'active', 'recovery', 'reaction'].includes(s.mode))) restoreQuills(s);
  }
  s.flash = Math.max(0, s.flash - dt); s.regrowthFlash = Math.max(0, s.regrowthFlash - dt);
  // The normal-state periodic clock pauses during enrage and resumes afterward.
  if (!s.states.enrage.active) {
    s.regrowthClock += dt;
    if (s.regrowthClock >= (s.definition ?? QUILLSHOT).quills.regrowth) {
      s.regrowthClock %= (s.definition ?? QUILLSHOT).quills.regrowth;
      if (QUARTERS.some(id => s.parts[id].broken)) restoreQuills(s);
    }
  }
}
export function stepQuillProjectiles(s, players, dt) {
  s.impactEvents = [];
  for (const q of s.projectiles) {
    q.previous = [...q.position];
    if (q.kind === 'fall') {
      if (stepFallingProjectile(q, players, dt)) s.impactEvents.push({ ...q, damage: (s.definition ?? QUILLSHOT).quills.damage * (s.states.aetherCharge.active ? 1.25 : 1) });
    } else {
      q.age += dt;
      for (const i of [0, 2]) q.position[i] += q.direction[i] * (s.definition ?? QUILLSHOT).quills.sideSpeed * dt;
      s.impactEvents.push({ ...q, damage: (s.definition ?? QUILLSHOT).quills.damage * (s.states.aetherCharge.active ? 1.25 : 1) });
    }
  }
  s.projectiles = s.projectiles.filter(q => q.age < (q.kind === 'fall' ? 1 : (s.definition ?? QUILLSHOT).quills.sideLife));
}
export function quillImpactTouches(q, position) {
  return hostileProjectileTouches(q, position);
}
export function stepQuillshot(s, playerPosition, dt, bounds = 68, options = {}) {
  stepWounds(s.parts, dt);
  if (s.mode === 'defeated') return [];
  const players = options.players ?? [{ id: 'local', position: playerPosition, knockedDown: options.targetKnockedDown }];
  stepQuillProjectiles(s, players, dt);
  advanceQuillshotTimers(s, dt);
  enrage(s);
  s.elapsed += dt;
  const move = (s.definition ?? QUILLSHOT).moves[s.move];
  if (s.mode === 'reaction') { if (s.elapsed >= s.pause) { s.mode = 'idle'; s.pause = 0.4; } return []; }
  if (s.mode === 'windup') {
    if (s.move === 'sideDrop' && s.sideTarget && (!s.sideCombo || s.sideCombo.cycle === 0)) {
      const desired = yawTo(s.position, s.sideTarget) - s.side * Math.PI / 2;
      s.yaw += Math.max(-dt * 2.5, Math.min(dt * 2.5, delta(s.yaw, desired)));
    } else if (s.move !== 'sideDrop' || !s.sideCombo) turn(s, playerPosition, dt);
    if (s.elapsed >= move.tell) {
      s.mode = 'active'; s.elapsed = 0;
      if (rankedSideDrop(s)) {
        s.sideCombo ??= { cycle: 0, emitted: 0, startYaw: null, spinYaw: null, phase: 'fall' };
        s.sideCombo.startYaw ??= s.yaw;
        s.sideCombo.spinYaw = s.yaw; s.sideCombo.phase = 'fall';
        s.activeDuration = 1 + SIDE_COMBO.spinDuration;
      }
      if (barrage(s.move)) { volley(s, players); s.volleyCount++; s.nextVolley = s.move === 'intermittent' ? (s.definition ?? QUILLSHOT).quills.intermittentCadence : (s.definition ?? QUILLSHOT).quills.cadence; }
    }
  } else if (s.mode === 'active') {
    if (rankedSideDrop(s) && s.sideCombo?.phase === 'pause') {
      // Hold the last 120-degree orientation without another fall or contact hit.
      if (s.elapsed >= move.recovery) {
        s.sideCombo.phase = 'spin'; s.elapsed = 1; s.attackHit = false;
      }
      return [];
    }
    if (s.move === 'charge') { s.position[0] -= Math.sin(s.yaw) * move.speed * dt; s.position[2] -= Math.cos(s.yaw) * move.speed * dt; }
    if (barrage(s.move)) while (s.nextVolley <= s.elapsed && s.nextVolley < s.activeDuration && (s.move !== 'intermittent' || s.volleyCount < (s.definition ?? QUILLSHOT).quills.intermittentCount)) {
      volley(s, players); s.volleyCount++; s.nextVolley += s.move === 'intermittent' ? (s.definition ?? QUILLSHOT).quills.intermittentCadence : (s.definition ?? QUILLSHOT).quills.cadence;
    }
    if (rankedSideDrop(s) && s.sideCombo && s.elapsed >= 1) {
      if (s.sideCombo.phase !== 'spin') { s.sideCombo.phase = 'spin'; s.attackHit = false; }
      s.previousSpinYaw = s.yaw;
      spinVolley(s, Math.min(1, (s.elapsed - 1) / SIDE_COMBO.spinDuration));
    } else if (s.move === 'sideDrop' && s.elapsed >= 1 && !s.sideReleased) { sideVolley(s); s.sideReleased = true; }
    if (s.elapsed >= s.activeDuration) {
      if (rankedSideDrop(s) && s.sideCombo && s.sideCombo.cycle + 1 < SIDE_COMBO.repeats) {
        // Separate the three spins with prone holds at their distinct angles.
        s.sideCombo.cycle++; s.sideCombo.emitted = 0;
        s.sideCombo.spinYaw = s.yaw;
        s.previousSpinYaw = s.yaw;
        s.sideCombo.phase = 'pause';
        s.elapsed = 0; s.attackHit = false;
      } else { s.mode = 'recovery'; s.elapsed = 0; }
    }
  } else if (s.mode === 'recovery') {
    if (s.elapsed >= move.recovery) {
      if (s.sideCombo) { s.yaw = s.sideCombo.startYaw + s.side * Math.PI * 2; s.sideCombo = null; }
      if (barrage(s.move)) { s.meleeCount = 0; s.afterRetreat = false; }
      else if (s.move !== 'enrage') s.meleeCount++;
      s.mode = 'idle'; s.move = null; s.pause = 0.3; s.elapsed = 0;
    }
  } else if (s.mode === 'retreat') {
    turn(s, playerPosition, dt); s.position[0] += Math.sin(s.yaw) * 4 * dt; s.position[2] += Math.cos(s.yaw) * 4 * dt;
    if (s.elapsed >= 1.5) { s.mode = 'idle'; s.pause = 0.4; s.afterRetreat = true; }
  } else {
    s.pause = Math.max(0, s.pause - dt); turn(s, playerPosition, dt);
    if (s.pause > 0 || (options.targetKnockedDown && !s.canTargetKnockedDownPlayers)) {
      if (s.mode === 'chase') s.elapsed = 0;
      return [];
    }
    if (s.forceBarrage) { s.forceBarrage = false; s.opened = true; start(s, 'bombardment'); }
    else if (!s.opened) { s.opened = true; start(s, 'intermittent'); }
    else if (s.meleeCount >= 2 || s.afterRetreat) {
      if (s.afterRetreat && random(s) < 0.25) { s.afterRetreat = false; start(s, 'charge'); }
      else start(s, random(s) < 0.5 ? 'bombardment' : 'intermittent');
    } else if (s.mode !== 'chase' && s.meleeCount === 1 && random(s) < 0.4) { s.mode = 'retreat'; s.elapsed = 0; }
    else {
      // Pick once, then approach for that move; chasing must not reroll retreat every frame.
      if (s.mode !== 'chase') {
        s.queuedMelee = ['swipe', 'slam', 'sideDrop', 'charge'][Math.floor(random(s) * 4)];
        s.queuedMeleeTarget = [...playerPosition];
      }
      if (dist(s.position, playerPosition) > (s.queuedMelee === 'charge' ? 13 : 5 * (s.definition ?? QUILLSHOT).sizeScale)) {
        // Only continuous pursuit counts; idle, recovery and waiting do not.
        if (s.mode === 'chase' && s.elapsed >= (s.definition ?? QUILLSHOT).pacing.maxChaseDuration) {
          start(s, ['charge', 'intermittent', 'sideDrop'][Math.floor(random(s) * 3)], playerPosition);
        } else {
          if (s.mode !== 'chase') s.elapsed = 0;
          s.mode = 'chase'; s.position[0] -= Math.sin(s.yaw) * 3.4 * dt; s.position[2] -= Math.cos(s.yaw) * 3.4 * dt;
        }
      } else start(s, s.queuedMelee, playerPosition);
    }
  }
  const r = Math.hypot(s.position[0], s.position[2]);
  if (r > bounds) { s.position[0] *= bounds / r; s.position[2] *= bounds / r; }
  return [];
}
export function quillshotAttackTouchesPlayer(s, p) {
  const m = (s.definition ?? QUILLSHOT).moves[s.move];
  if (s.mode !== 'active' || s.attackHit || !m?.damage || Math.abs(p[1] - s.position[1]) > 2.5 * (s.definition ?? QUILLSHOT).sizeScale) return false;
  if (s.sideCombo?.phase === 'pause') return false;
  const spinning = rankedSideDrop(s) && s.sideCombo?.phase === 'spin';
  if (s.move === 'sideDrop' && s.elapsed > 0.2 && !spinning) return false;
  const yaw = s.move === 'sideDrop' ? s.yaw + (spinning ? Math.PI : s.side * Math.PI / 2) : s.yaw;
  if (dist(s.position, p) >= m.reach * (s.definition ?? QUILLSHOT).sizeScale + 0.36) return false;
  const targetYaw = yawTo(s.position, p);
  if (Math.cos(delta(yaw, targetYaw)) >= Math.cos(m.arc * Math.PI / 360)) return true;
  // Sweep the rotating sector between simulation frames so edge contacts cannot tunnel.
  if (spinning && Number.isFinite(s.previousSpinYaw)) {
    const previous = s.previousSpinYaw + Math.PI;
    const middle = previous + (yaw - previous) / 2;
    return Math.abs(delta(middle, targetYaw)) <= m.arc * Math.PI / 360 + Math.abs(yaw - previous) / 2;
  }
  return false;
}
