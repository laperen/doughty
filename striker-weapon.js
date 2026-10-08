import { getStatModifierRemaining } from './stat-modifiers.js';
import { STAMINA } from './stamina.js';
/**
 * Reference-informed Striker-style weapon prototype with weapon-owned pose metadata.
 * All timings are estimates and live here so playtest tuning stays local.
 */
const SURGE_AVAILABILITY_DURATION = 12; // Prototype tuning value in seconds.
const MANTRA_DURATION = 12; // Estimated slot lifetime in seconds.
const COMBO_CHAIN_WINDOW = 1.0; // Full grace period after a completed combo stage.
export const STRIKER_INPUT_BUFFER = 0.24; // One queued input, up to 240 ms before completion (real time).
export const SURGE_TRAVEL_PROFILE = Object.freeze({ travel: 6, active: 0.16, travelSpeedMultiplier: 2 });

/** Weapon-owned special definition; another Striker special can replace this entry. */
export const STRIKER_CRESCENT_SPECIAL = Object.freeze({
  id: 'crescent-projectile',
  label: 'Crescent',
  kind: 'ranged',
  damage: 100,
  width: 4, // World units across the blade face.
  height: 0.2, // Thin vertical profile.
  depth: 1.72 * (2 / 3), // Forward length; swapped with the previous hitbox height.
  centerHeight: 1.72 * (2 / 3),
  dissipateWidth: 1.5 * 1.5, // Only the central 1.5-square blade lane ends the projectile on impact.
  range: 10 * 1.5,
  speed: SURGE_TRAVEL_PROFILE.travel / (SURGE_TRAVEL_PROFILE.active / SURGE_TRAVEL_PROFILE.travelSpeedMultiplier),
  activate({ cameraYaw = 0, groundNormal = [0, 1, 0] }) {
    // Keep the camera's horizontal heading, then follow the local ground slope.
    const forward = [-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)];
    const normalLength = Math.hypot(...groundNormal) || 1;
    const normal = groundNormal.map((component) => component / normalLength);
    const alongNormal = forward.reduce((sum, component, index) => sum + component * normal[index], 0);
    const tangent = forward.map((component, index) => component - alongNormal * normal[index]);
    const tangentLength = Math.hypot(...tangent) || 1;
    return {
      id: this.id,
      kind: this.kind,
      damage: this.damage,
      width: this.width,
      height: this.height,
      depth: this.depth,
      centerHeight: this.centerHeight,
      dissipateWidth: this.dissipateWidth,
      range: this.range,
      speed: this.speed,
      attackYaw: cameraYaw,
      direction: tangent.map((component) => component / tangentLength),
      interrupt: true,
    };
  },
});

/** Weapon-owned tap ability definition; another ability can replace this entry. */
export const STRIKER_SURGE_ABILITY = Object.freeze({
  id: 'surge',
  label: 'Surge',
  activate({ state, attackYaw }) {
    return useStrikerSurge(state, { attackYaw });
  },
});

const LIGHT_OPEN = Object.freeze({
  id: 'light-open', presentation: { weight: 'light', side: 1 }, label: 'Light opener', startup: 0.12, active: 0.1, recovery: 0.14,
  range: 1.75, arc: 105, damage: 20, stagger: 8,
  travel: 0.5, movementLock: 0.22,
});
const COMBOS = Object.freeze([
  {
    id: 'focused-assault', name: 'Focused Assault', inputs: ['light', 'light', 'light'], mantra: 'Focus',
    moves: [LIGHT_OPEN, Object.freeze({
      id: 'light-follow', presentation: { weight: 'light', side: -1 }, label: 'Quick strike', startup: 0.12, active: 0.1, recovery: 0.14,
      range: 1.82, arc: 110, damage: 22, stagger: 9,
      travel: 0.5, movementLock: 0.22,
    }), Object.freeze({
      id: 'focused-finisher', presentation: { weight: 'light', side: 1 }, label: 'Focused finisher', startup: 0.16, active: 0.12, recovery: 0.24,
      range: 2.0, arc: 120, damage: 34, stagger: 18,
      travel: 0.5, movementLock: 0.28,
    })],
  },
  {
    id: 'spirit-barrage', name: 'Spirit Barrage', inputs: ['light', 'heavy', 'heavy'], mantra: 'Spirit',
    moves: [LIGHT_OPEN, Object.freeze({
      id: 'spirit-barrage-flurry', presentation: { weight: 'light', side: 1 }, label: 'Spirit Barrage', startup: 0.22, active: 0.52, recovery: 0.24,
      range: 2.2, arc: 125, damage: 14, stagger: 8,
      travel: 0.5, movementLock: 0.74, hitOffsets: [0.26, 0.40, 0.54, 0.68],
    }), Object.freeze({
      id: 'spirit-heavy-finisher', presentation: { weight: 'heavy', side: -1 }, label: 'Spirit heavy finisher', startup: 0.24, active: 0.14, recovery: 0.26,
      range: 2.05, arc: 100, damage: 30, stagger: 18,
      travel: 0.5, movementLock: 0.38,
    })],
  },
  {
    id: 'mighty-squall', name: 'Mighty Squall', inputs: ['heavy', 'heavy', 'heavy'], mantra: 'Might',
    moves: [Object.freeze({
      id: 'heavy-open', presentation: { weight: 'heavy', side: 1 }, label: 'Heavy opener', startup: 0.24, active: 0.14, recovery: 0.26,
      range: 1.95, arc: 100, damage: 30, stagger: 18,
      travel: 0.5, movementLock: 0.38,
    }), Object.freeze({
      id: 'heavy-follow', presentation: { weight: 'heavy', side: -1 }, label: 'Heavy follow-up', startup: 0.26, active: 0.14, recovery: 0.28,
      range: 2.0, arc: 105, damage: 34, stagger: 21,
      travel: 0.5, movementLock: 0.4,
    }), Object.freeze({
      id: 'mighty-finisher', presentation: { weight: 'heavy', side: 1 }, label: 'Mighty finisher', startup: 0.34, active: 0.18, recovery: 0.38,
      range: 2.25, arc: 115, damage: 48, stagger: 34,
      travel: 0.5, movementLock: 0.52,
    })],
  },
]);

export const STRIKER_SWORD = Object.freeze({
  id: 'striker-sword',
  name: 'Striker Sword (Prototype)',
  kind: 'melee',
  presentation: Object.freeze({ weaponShape: 'sword', trailColor: '#e7ffa1' }),
  specials: Object.freeze({ threeMantra: STRIKER_CRESCENT_SPECIAL }),
  abilities: Object.freeze({ tap: STRIKER_SURGE_ABILITY }),
  combos: COMBOS,
  getHudResources: (state, player) => [
    ...COMBOS.map((combo, index) => {
      const remaining = state.mantras.find(slot => slot.source === combo.id)?.remaining ?? 0;
      return { id: combo.id, label: combo.name, kind: 'slot', glyph: ['I', 'II', 'III'][index],
        value: remaining, max: MANTRA_DURATION, description: remaining > 0 ? `${remaining.toFixed(1)} seconds remaining` : 'Empty' };
    }),
    { id: 'surge', label: 'Surge', kind: 'bar', glyph: 'Q',
      value: state.surgeReady ? state.surgeAvailabilityRemaining : 0, max: SURGE_AVAILABILITY_DURATION },
    { id: 'tempest', label: 'Tempest Form', kind: 'buff', glyph: 'ϟ',
      value: getStatModifierRemaining(player.statModifiers, 'tempest-form'), max: 10 },
  ],
  movement: Object.freeze({
    facing: 'travel',
    camera: Object.freeze({ distance: 8.67, height: 3.47, shoulder: 0 }),
  }),
  createState: createStrikerState,
  handleAttack: inputStriker,
  step: stepStriker,
  useTechnique: useStrikerTechnique,
  useTapAbility: useStrikerTapAbility,
  setSheathed: setStrikerSheathed,
  cancelAction: cancelStrikerAction,
  onHit: (state, event) => confirmStrikerHit(state, event),
  onTargetRemoved: state => { state.karmaDotRemaining = 0; state.karmaDotAccumulator = 0; },
});

export function createStrikerState() {
  return {
    sheathed: true,
    action: null,
    routeCandidates: [],
    comboIndex: 0,
    pendingInput: null,
    pendingRoutes: [],
    pendingRestart: false,
    pendingAttackYaw: null,
    elapsed: 0,
    attackYaw: null,
    finisherConnected: false,
    chainWindowRemaining: 0,
    hitCursor: 0,
    appliedTravel: 0,
    mantras: [],
    surgeAvailabilityRemaining: 0,
    karmaDotRemaining: 0,
    karmaDotAccumulator: 0,
    surgeReady: false,
    lastEvent: 'Weapon sheathed',
  };
}

const actionDuration = (move) => move.startup + move.active + move.recovery;

export function getCurrentStrikerMove(state) {
  if (!state.action) return null;
  return state.routeCandidates[0]?.moves[state.comboIndex] ?? state.action.move;
}

/**
 * Attack inputs while sheathed only unsheathe. Inputs during an attack are
 * accepted near completion, after the first contact; the queued move cannot cancel recovery.
 */
export function inputStriker(state, input, { attackYaw = null, spend = () => true } = {}) {
  if (!['light', 'heavy'].includes(input)) return { type: 'input-ignored' };
  if (state.sheathed) {
    state.sheathed = false;
    state.lastEvent = 'Unsheathed - attack again to strike';
    return { type: 'unsheathed' };
  }
  if (!state.action) {
    if (state.chainWindowRemaining > 0 && state.routeCandidates.length) {
      const comboIndex = state.comboIndex + 1;
      const chainRoutes = state.routeCandidates.filter((combo) => combo.inputs[comboIndex] === input);
      if (chainRoutes.length && comboIndex < chainRoutes[0].inputs.length) {
        if (input === 'heavy') spend(STAMINA.heavyAttackCost);
        state.chainWindowRemaining = 0;
        state.attackYaw = Number.isFinite(attackYaw) ? attackYaw : state.attackYaw;
        startStage(state, chainRoutes, comboIndex, input);
        return { type: 'attack-start', move: getCurrentStrikerMove(state) };
      }
    }
    const routes = COMBOS.filter((combo) => combo.inputs[0] === input);
    if (input === 'heavy') spend(STAMINA.heavyAttackCost);
    state.attackYaw = Number.isFinite(attackYaw) ? attackYaw : null;
    state.finisherConnected = false;
    startStage(state, routes, 0, input);
    return { type: 'attack-start', move: getCurrentStrikerMove(state) };
  }
  const move = getCurrentStrikerMove(state);
  const combo = state.routeCandidates[0];
  const restart = Boolean(combo && state.comboIndex === combo.inputs.length - 1);
  const nextRoutes = restart ? COMBOS.filter((route) => route.inputs[0] === input)
    : state.routeCandidates.filter((route) => route.inputs[state.comboIndex + 1] === input);
  if (!state.action.ability && nextRoutes.length && !state.pendingInput
    && state.elapsed >= (move.hitOffsets?.[0] ?? move.startup + move.active * 0.5)
    && (actionDuration(move) - state.elapsed) / (state.attackSpeedMultiplier ?? 1) <= STRIKER_INPUT_BUFFER) {
    state.pendingInput = input;
    state.pendingRoutes = nextRoutes;
    state.pendingRestart = restart;
    state.pendingAttackYaw = attackYaw;
    return { type: 'input-buffered' };
  }
  return { type: 'input-ignored' };
}

function startStage(state, routes, index, input) {
  state.routeCandidates = routes;
  state.comboIndex = index;
  state.action = { move: routes[0].moves[index], interrupt: input === 'heavy' };
  state.elapsed = 0;
  state.hitCursor = 0;
  state.appliedTravel = 0;
  state.pendingInput = null;
  state.pendingRoutes = [];
  state.pendingRestart = false;
  state.pendingAttackYaw = null;
  state.chainWindowRemaining = 0;
  state.lastEvent = state.action.move.label;
}

function addMantra(state, combo) {
  for (const slot of state.mantras) slot.remaining = MANTRA_DURATION;
  const existingSlot = state.mantras.find((slot) => slot.source === combo.id);
  if (existingSlot) existingSlot.remaining = MANTRA_DURATION;
  else state.mantras.push({ type: combo.mantra, source: combo.id, remaining: MANTRA_DURATION });
  grantSurgeAvailability(state);
  state.lastEvent = `${combo.mantra} Mantra ${existingSlot ? 'refreshed' : 'gained'}`;
}

function grantSurgeAvailability(state) {
  state.surgeReady = true;
  state.surgeAvailabilityRemaining = SURGE_AVAILABILITY_DURATION;
}

export function useStrikerTechnique(state, { attackYaw = state.attackYaw, cameraYaw = attackYaw, groundNormal, spend = () => true, addStatModifier = () => {}, special = null } = {}) {
  if (state.sheathed || state.action) return { type: 'unavailable' };
  const count = state.mantras.length;
  if (count >= 3 && special?.activate) {
    state.mantras.splice(0, 3);
    state.action = {
      ability: 'crescent-special',
      special: special.activate({ attackYaw, cameraYaw, groundNormal }),
      launchDelay: 0.5,
      move: { id: 'crescent-windup', label: 'Crescent wind-up', startup: 0, active: 0, recovery: 0.5, range: 0, arc: 0, damage: 0, stagger: 0, travel: 0, movementLock: 0.5 },
    };
    state.attackYaw = Number.isFinite(state.action.special.attackYaw) ? state.action.special.attackYaw : attackYaw;
    state.elapsed = 0;
    state.hitCursor = 0;
    state.appliedTravel = 0;
    state.pendingInput = null;
    state.pendingRoutes = [];
    state.pendingRestart = false;
    state.pendingAttackYaw = null;
    state.routeCandidates = [];
    state.comboIndex = 0;
    state.chainWindowRemaining = 0;
    state.lastEvent = `${special.label} charging`;
    return { type: 'special-charging', duration: 0.5 };
  }
  if (count >= 2) {
    state.mantras.splice(0, 2);
    state.action = { ability: 'karma-breaker', interrupt: true, move: {
      id: 'karma-breaker', presentation: { weight: 'heavy', side: 1, motion: 'thrust' }, label: 'Karma Breaker', startup: 0.40, active: 0.15, recovery: 0.48,
      range: LIGHT_OPEN.range, arc: LIGHT_OPEN.arc, damage: 55, stagger: 32, travel: 6,
      travelSpeedMultiplier: 2, travelDuringActive: true, continuousHitbox: true, hitOffsets: [], movementLock: 0.95,
    } };
    state.attackYaw = Number.isFinite(cameraYaw) ? cameraYaw : attackYaw;
    state.elapsed = 0;
    state.hitCursor = 0;
    state.appliedTravel = 0;
    state.pendingInput = null;
    state.routeCandidates = [];
    state.comboIndex = 0;
    state.chainWindowRemaining = 0;
    state.lastEvent = 'Karma Breaker â€” forward strike';
    return { type: 'ability-start', ability: 'karma-breaker', move: state.action.move };
  }
  if (count >= 1) {
    state.mantras.splice(0, 1);
    addStatModifier({ source: 'tempest-form', stat: 'attackSpeed', percent: 20, duration: 10 }); // Provisional duration.
    grantSurgeAvailability(state);
    state.action = { ability: 'tempest-form', move: {
      id: 'tempest-cast', label: 'Tempest Form Cast', startup: 0, active: 0, recovery: 0.5,
      range: 0, arc: 0, damage: 0, stagger: 0, travel: 0, movementLock: 0.5,
    } };
    state.attackYaw = Number.isFinite(attackYaw) ? attackYaw : null;
    state.elapsed = 0;
    state.hitCursor = 0;
    state.appliedTravel = 0;
    state.pendingInput = null;
    state.pendingRoutes = [];
    state.pendingRestart = false;
    state.pendingAttackYaw = null;
    state.routeCandidates = [];
    state.comboIndex = 0;
    state.chainWindowRemaining = 0;
    state.lastEvent = 'Tempest Form â€” attack speed +20%';
    return { type: 'tempest-casting', duration: 0.5 };
  }
  return { type: 'unavailable' };
}

export function cancelStrikerAction(state) {
    state.action = null;
    state.attackYaw = null;
    state.routeCandidates = [];
    state.pendingInput = null;
    state.pendingRoutes = [];
    state.pendingRestart = false;
    state.pendingAttackYaw = null;
    state.comboIndex = 0;
    state.elapsed = 0;
    state.attackYaw = null;
    state.finisherConnected = false;
    state.chainWindowRemaining = 0;
}

export function setStrikerSheathed(state, sheathed) {
  state.sheathed = Boolean(sheathed);
  if (state.sheathed) {
    cancelStrikerAction(state);
    state.lastEvent = 'Weapon sheathed';
  } else state.lastEvent = 'Weapon ready';
}


export function useStrikerSurge(state, { attackYaw = state.attackYaw } = {}) {
  if (state.sheathed || state.action || !state.surgeReady) return { type: 'unavailable' };
  for (const slot of state.mantras) slot.remaining = MANTRA_DURATION;
  state.action = { ability: 'surge', move: {
    id: 'surge', label: 'Surge', startup: 0.12, active: 0.16, recovery: 0.18,
    range: 2.85, arc: 70, damage: 24, stagger: 14, ...SURGE_TRAVEL_PROFILE, phaseEnemies: true, travelDuringActive: true, movementLock: 0.38,
  } };
  state.attackYaw = Number.isFinite(attackYaw) ? attackYaw : null;
  state.elapsed = 0;
  state.hitCursor = 0;
  state.appliedTravel = 0;
  state.pendingInput = null;
  state.routeCandidates = [];
  state.comboIndex = 0;
  state.chainWindowRemaining = 0;
  state.surgeReady = false;
  state.surgeAvailabilityRemaining = 0;
  state.lastEvent = 'Surge';
  return { type: 'ability-start', ability: 'surge', move: state.action.move };
}

export function useStrikerTapAbility(state, { attackYaw = state.attackYaw, ability = null } = {}) {
  if (!ability?.activate) return { type: 'unavailable' };
  return ability.activate({ state, attackYaw });
}

/** Advance ability timers and deterministic attack/hit events by fixed dt. */
export function stepStriker(state, dt, { attackSpeedMultiplier = 1, spend = () => true } = {}) {
  const events = [];
  const speedMultiplier = attackSpeedMultiplier;
  state.attackSpeedMultiplier = speedMultiplier;
  let expiredMantra = false;
  state.mantras = state.mantras.filter((slot) => {
    slot.remaining = Math.max(0, slot.remaining - dt);
    if (slot.remaining === 0) expiredMantra = true;
    return slot.remaining > 0;
  });
  if (expiredMantra) {
    state.lastEvent = 'Mantra slot expired';
    events.push({ type: 'mantra-expired' });
  }
  if (state.surgeAvailabilityRemaining > 0) {
    state.surgeAvailabilityRemaining = Math.max(0, state.surgeAvailabilityRemaining - dt);
    if (state.surgeAvailabilityRemaining === 0 && state.surgeReady) {
      state.surgeReady = false;
      state.lastEvent = 'Surge availability expired';
      events.push({ type: 'surge-expired' });
    }
  }
  if (state.karmaDotRemaining > 0) {
    state.karmaDotAccumulator += dt;
    state.karmaDotRemaining = Math.max(0, state.karmaDotRemaining - dt);
    while (state.karmaDotAccumulator >= 1) {
      state.karmaDotAccumulator -= 1;
      events.push({ type: 'karma-tick', damage: 12, stagger: 4 });
    }
  }
  if (!state.action && state.chainWindowRemaining > 0) {
    state.chainWindowRemaining = Math.max(0, state.chainWindowRemaining - dt);
    if (state.chainWindowRemaining === 0) {
      state.routeCandidates = [];
      state.comboIndex = 0;
      state.attackYaw = null;
    }
  }
  if (!state.action) return { events, speedMultiplier, locked: false, movementScale: 1, travelDelta: 0 };

  const move = getCurrentStrikerMove(state);
  const previousElapsed = state.elapsed;
  const actionRate = ['tempest-form', 'crescent-special'].includes(state.action.ability) ? 1 : speedMultiplier;
  state.elapsed += dt * actionRate;
  if (state.action.ability === 'crescent-special' && !state.action.specialLaunched
    && previousElapsed < state.action.launchDelay && state.elapsed >= state.action.launchDelay) {
    state.action.specialLaunched = true;
    events.push({ type: 'special-launch', projectile: state.action.special });
    state.lastEvent = `${state.action.special.id} launched`;
  }
  const activeStart = move.startup;
  const activeEnd = move.startup + move.active;
  const hitOffsets = move.hitOffsets ?? [activeStart + move.active * 0.5];
  while (state.hitCursor < hitOffsets.length && previousElapsed < hitOffsets[state.hitCursor] && state.elapsed >= hitOffsets[state.hitCursor]) {
    events.push({ type: 'attack-hit', move, ability: state.action.ability ?? null, interrupt: state.action.interrupt === true });
    state.hitCursor += 1;
  }
  if (move.continuousHitbox && state.elapsed >= activeStart && previousElapsed < activeEnd) {
    events.push({ type: 'attack-active', move, action: state.action, yaw: state.attackYaw, ability: state.action.ability ?? null, interrupt: state.action.interrupt === true });
  }
  const totalDuration = actionDuration(move);
  const travelProgress = move.travelDuringActive
    ? (state.elapsed - activeStart) / Math.max(move.active, 0.001)
    : state.elapsed / Math.max(activeEnd, 0.001);
  const travelFraction = Math.max(0, Math.min(1, travelProgress * (move.travelSpeedMultiplier ?? 1)));
  const travelTarget = move.travel * travelFraction;
  const travelDelta = Math.max(0, travelTarget - state.appliedTravel);
  state.appliedTravel = travelTarget;
  let locked = state.elapsed <= move.movementLock;
  let movementScale = locked ? 0 : state.elapsed < activeEnd ? 0.18 : 0.32;

  if (state.elapsed >= totalDuration) {
    const combo = state.routeCandidates[0];
    if (combo && state.comboIndex === combo.inputs.length - 1) {
      if (state.finisherConnected) {
        events.push({ type: 'combo-complete', combo });
      } else {
        state.lastEvent = `${combo.name} finisher missed - no Mantra`;
        events.push({ type: 'combo-missed', combo });
      }
    }
    const queuedInput = state.pendingInput;
    const queuedRoutes = state.pendingRoutes;
    const queuedRestart = state.pendingRestart;
    const queuedYaw = state.pendingAttackYaw;
    state.pendingInput = null;
    state.pendingRoutes = [];
    state.pendingRestart = false;
    state.pendingAttackYaw = null;
    const finishedYaw = state.attackYaw;
    state.action = null;
    state.attackYaw = null;
    if (combo && state.comboIndex < combo.inputs.length - 1) {
      state.chainWindowRemaining = COMBO_CHAIN_WINDOW;
      if (state.chainWindowRemaining === 0) state.routeCandidates = [];
    } else {
      state.routeCandidates = [];
      state.chainWindowRemaining = 0;
    }
    if (queuedInput && queuedRoutes.length) {
      if (queuedInput === 'heavy') spend(STAMINA.heavyAttackCost);
      if (queuedRestart) {
        state.finisherConnected = false;
      }
      state.attackYaw = Number.isFinite(queuedYaw) ? queuedYaw : finishedYaw;
      startStage(state, queuedRoutes, queuedRestart ? 0 : state.comboIndex + 1, queuedInput);
      locked = true;
      movementScale = 0;
      events.push({ type: 'attack-start', move: getCurrentStrikerMove(state) });
    }
  }
  return { events, speedMultiplier, locked, movementScale, travelDelta };
}

export function confirmStrikerHit(state, event) {
  let confirmed = false;
  if (!event.ability && state.action && !state.action.ability) {
    const combo = state.routeCandidates[0];
    const finalMove = combo?.moves[combo.inputs.length - 1];
    if (combo && !state.finisherConnected && state.comboIndex === combo.inputs.length - 1 && event.move.id === finalMove.id) {
      state.finisherConnected = true;
      addMantra(state, combo);
      confirmed = true;
    }
  }
  if (event.ability === 'karma-breaker' && state.karmaDotRemaining <= 0) {
    state.karmaDotRemaining = 5;
    state.karmaDotAccumulator = 0;
    state.lastEvent = 'Karma Breaker applied damage over time';
    confirmed = true;
  }
  return confirmed;
}
