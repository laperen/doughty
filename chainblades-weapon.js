import { STAMINA } from './stamina.js';

// Unmeasured values are prototype tuning; rule durations and the cap are confirmed.
export const CHAINBLADES_TUNING = Object.freeze({ maxResources: 4, chargePerResource: 100,
  chargePerHit: 10, chainWindow: 1, inputBuffer: .24, pullMin: 2.3, pullMax: 12,
  pushRange: 2.6, airWindow: 1.5, pushDuration: .3, pushBack: 1.4, airHeight: 3, dashTravel: 6,
  slamWindup: .25, slamLanding: .45, slamImpact: .5,
  slamDamagePerResource: 35, dodgeDuration: .25, dodgeSpeed: 11 });
const T = CHAINBLADES_TUNING;
const duration = m => m.startup + m.active + m.recovery;
const move = (id, values = {}) => ({ id, label: id, startup: .12, active: .24, recovery: .16,
  range: 2.1, arc: 125, damage: 14, stagger: 0, wound: 0, travel: .4, movementLock: .52,
  hitOffsets: [.17, .32], interrupt: true, presentation: { weight: 'light' }, ...values });
const lights = Array.from({ length: 6 }, (_, i) => move(`Twin cut ${i + 1}`, { recovery: i === 5 ? .36 : .16 }));
const heavies = Array.from({ length: 4 }, (_, i) => move(`Wounding cut ${i + 1}`, {
  startup: .24, active: .14, recovery: i === 3 ? .46 : .26, movementLock: .38,
  damage: 28, wound: 40, hitOffsets: [.31], interrupt: false, presentation: { weight: 'heavy' },
}));
const spin = move('Chain spin', { startup: .2, active: .65, recovery: .22, range: 3.8,
  arc: 360, damage: 12, travel: 0, movementLock: 1.07, interrupt: false,
  hitOffsets: [.25, .4, .55, .7, .82], presentation: { motion: 'spin', weight: 'heavy' } });
const finish = move('Chain finisher', { damage: 24, recovery: .34, hitOffsets: [.24],
  presentation: { motion: 'chain-finisher', weight: 'light' } });

export function createChainbladesState() {
  return { sheathed: true, action: null, elapsed: 0, attackYaw: null, hitCursor: 0,
    appliedTravel: 0, sequence: '', chainWindowRemaining: 0, pendingInput: null,
    resources: 0, charge: 0, airElapsed: null, airHeight: 0, slamResources: 0,
    lastEvent: 'Weapon sheathed' };
}
export function cancelChainbladesAction(s) {
  s.action = null; s.sequence = ''; s.pendingInput = null; s.chainWindowRemaining = 0;
  s.airElapsed = null; s.airHeight = 0; s.attackYaw = null;
}
function start(s, m, yaw, ability = null) {
  s.action = { move: m, interrupt: m.interrupt, ability }; s.elapsed = 0;
  s.hitCursor = 0; s.appliedTravel = 0; s.pendingInput = null;
  s.attackYaw = yaw ?? s.attackYaw ?? 0; s.lastEvent = m.label;
  return { type: 'attack-start', move: m };
}
export function inputChainblades(s, input, context = {}) {
  if (!['light', 'heavy'].includes(input)) return { type: 'input-ignored' };
  if (s.sheathed) { s.sheathed = false; s.lastEvent = 'Unsheathed - attack again to strike'; return { type: 'unsheathed' }; }
  if (s.airElapsed !== null && s.action?.ability === 'push-off') {
    if (s.airElapsed < T.pushDuration || s.airElapsed >= T.airWindow) return { type: 'input-ignored' };
    s.sequence = '';
    if (input === 'light') return start(s, move('Aerial dash', { startup: .05, active: .28, recovery: .22,
      hitOffsets: [], continuousHitbox: true, travelDuringActive: true, travel: Math.min(T.pullMax, context.target?.distance ?? T.dashTravel),
      damage: 30, movementLock: .55, presentation: { motion: 'air-dash', weight: 'light' } }), context.target?.yaw ?? context.attackYaw, 'air-dash');
    s.slamResources = s.resources + 1;
    return start(s, move('Aerial slam', { startup: .45, active: .15, recovery: .4,
      hitOffsets: [T.slamImpact], range: 2.5, originOffset: 3, arc: 360, damage: T.slamDamagePerResource * s.slamResources,
      travel: 0, movementLock: 1, presentation: { motion: 'slam', weight: 'heavy' } }), context.attackYaw, 'air-slam');
  }
  if (s.action) {
    if (!s.action.ability && !s.pendingInput && (duration(s.action.move) - s.elapsed) / (s.attackSpeedMultiplier ?? 1) <= T.inputBuffer)
      { s.pendingInput = { input, context }; return { type: 'input-buffered' }; }
    return { type: 'input-ignored' };
  }
  const key = input === 'light' ? 'L' : 'H';
  let sequence = s.chainWindowRemaining > 0 ? s.sequence + key : key;
  if (!['LLLLLL', 'HHHH', 'LLHL'].some(route => route.startsWith(sequence))) sequence = key;
  let m;
  if (sequence === 'LLH') m = spin;
  else if (sequence === 'LLHL') m = finish;
  else if (key === 'L') m = lights[sequence.length - 1];
  else if (context.target && context.target.distance > T.pullMin && context.target.distance <= T.pullMax) {
    sequence = '';
    m = move('Chain pull', { startup: .18, active: .3, recovery: .2, hitOffsets: [], continuousHitbox: true,
      travelDuringActive: true, travel: Math.max(0, context.target.distance - 1), damage: 18,
      interrupt: false, movementLock: .68, presentation: { motion: 'thrust', weight: 'heavy' } });
  } else m = heavies[sequence.length - 1];
  // Match the existing Strikers stamina policy: spend available stamina, including partial pools.
  if (key === 'H') context.spend?.(STAMINA.heavyAttackCost);
  s.sequence = sequence; s.chainWindowRemaining = 0;
  return start(s, m, m.label === 'Chain pull' ? context.target.yaw : context.attackYaw);
}
export function pushOff(s, { target, attackYaw, grounded = true } = {}) {
  if (s.sheathed || s.action?.ability || s.airElapsed !== null || s.resources < 1 || !grounded || !target || target.distance > T.pushRange) return { type: 'unavailable' };
  s.resources--; s.airElapsed = 0; s.sequence = ''; s.chainWindowRemaining = 0;
  return start(s, move('Push off - L dash / H slam', { startup: T.pushDuration, active: T.airWindow - T.pushDuration, recovery: 0,
    hitOffsets: [], travel: T.pushBack, travelDuration: T.pushDuration, retreat: true,
    damage: 0, range: 0, movementLock: T.airWindow, presentation: { motion: 'push-off' } }), target.yaw ?? attackYaw, 'push-off');
}
/** Separate rise, suspended wind-up, and accelerating fall; time is real seconds. */
export function chainbladesAirHeight(ability, elapsed, airElapsed = elapsed) {
  const clamp = n => Math.max(0, Math.min(1, n));
  if (ability === 'push-off') return T.airHeight * (1 - (1 - clamp(airElapsed / T.pushDuration)) ** 2);
  if (ability === 'air-slam') {
    const fall = clamp((elapsed - T.slamWindup) / (T.slamLanding - T.slamWindup));
    return T.airHeight * (1 - fall * fall);
  }
  if (ability === 'air-dash') return T.airHeight * (1 - clamp((elapsed - .05) / .28));
  if (ability === 'landing') return T.airHeight * (1 - clamp(elapsed / .25) ** 2);
  return 0;
}
export function stepChainblades(s, dt, { attackSpeedMultiplier = 1 } = {}) {
  const events = []; s.attackSpeedMultiplier = attackSpeedMultiplier;
  if (!s.action) {
    s.chainWindowRemaining = Math.max(0, s.chainWindowRemaining - dt);
    return { events, locked: false, movementScale: 1, travelDelta: 0 };
  }
  const action = s.action, m = action.move;
  const before = s.elapsed;
  s.elapsed += dt * (action.ability ? 1 : attackSpeedMultiplier);
  if (s.airElapsed !== null) {
    s.airElapsed += dt;
    s.airHeight = chainbladesAirHeight(action.ability, s.elapsed, s.airElapsed);
  }
  for (; s.hitCursor < m.hitOffsets.length && s.elapsed >= m.hitOffsets[s.hitCursor]; s.hitCursor++) {
    events.push({ type: 'attack-hit', move: m, ability: action.ability, interrupt: m.interrupt, yaw: s.attackYaw });
    if (action.ability === 'air-slam') s.resources = 0;
  }
  if (m.continuousHitbox && s.elapsed >= m.startup && before < m.startup + m.active)
    events.push({ type: 'attack-active', move: m, action, ability: action.ability, yaw: s.attackYaw, interrupt: m.interrupt });
  const progress = Math.max(0, Math.min(1, m.travelDuration ? s.elapsed / m.travelDuration
    : m.travelDuringActive ? (s.elapsed - m.startup) / m.active : s.elapsed / (m.startup + m.active)));
  const fraction = m.retreat ? 1 - (1 - progress) ** 2 : progress;
  const travelDelta = m.travel * fraction - s.appliedTravel; s.appliedTravel += travelDelta;
  const yaw = s.attackYaw;
  if (s.elapsed >= duration(m)) {
    const pending = s.pendingInput;
    s.action = null; s.pendingInput = null;
    if (action.ability === 'push-off') {
      start(s, move('Landing', { startup: .25, active: 0, recovery: 0, hitOffsets: [], travel: 0, range: 0, movementLock: .25 }), yaw, 'landing');
    } else if (action.ability) { s.airElapsed = null; s.airHeight = 0; }
    else {
      if (['LLLLLL', 'HHHH', 'LLHL'].includes(s.sequence)) s.sequence = '';
      s.chainWindowRemaining = T.chainWindow;
      if (pending) inputChainblades(s, pending.input, pending.context);
    }
  }
  return { events, locked: true, movementScale: 0, travelDelta, travelYaw: yaw + (m.retreat ? Math.PI : 0) };
}
export const CHAINBLADES = Object.freeze({
  id: 'chainblades', name: 'Chain Blades', kind: 'melee', abilityInput: 'press', resourceColumns: 4, targetContext: true,
  presentation: { weaponShape: 'chainblades', trailColor: '#75e5ff' },
  hudHint: 'L twin cuts / H wound or pull / LLHL spin / Q push-off / airborne L dash, H slam',
  movement: { facing: 'travel', dodge: { duration: T.dodgeDuration, cooldown: .125, speed: T.dodgeSpeed, animation: 'dash' } },
  createState: createChainbladesState, handleAttack: inputChainblades, step: stepChainblades,
  useTapAbility: pushOff, cancelAction: cancelChainbladesAction,
  setSheathed(s, value) { s.sheathed = Boolean(value); if (value) cancelChainbladesAction(s); },
  onHit(s, event = {}) {
    if (s.resources >= T.maxResources) return;
    s.charge += T.chargePerHit;
    while (s.charge >= T.chargePerResource && s.resources < T.maxResources) { s.charge -= T.chargePerResource; s.resources++; }
    if (s.resources === T.maxResources) s.charge = 0;
    if (event.ability === 'air-slam') s.resources = 0;
  },
  getHudResources: s => [
    { id: 'charge', label: 'Chain charge', kind: 'bar', glyph: 'CB', value: s.charge, max: T.chargePerResource },
    ...Array.from({ length: 4 }, (_, i) => ({ id: `chain-${i}`, label: `Resource ${i + 1}`, kind: 'slot', glyph: '◆', value: s.resources > i ? 1 : 0, max: 1 })),
  ],
});
