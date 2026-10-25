import { damageProfile } from './weapon-damage.js';
import { getStatModifierRemaining } from './stat-modifiers.js';

// Reference timings; damage, range boundaries and vertical spread are prototype tuning.
export const REPEATER_TUNING = Object.freeze({ shotInterval: .35, ...damageProfile(10, 1), reload: 1,
  empoweredDuration: 20, empoweredPercent: 70, idealRange: 8, middleRange: 15, maxRange: 25 });
export const SCATTERSHOT = Object.freeze({ id: 'scattershot', label: 'Scattershot', cooldown: 15,
  duration: 1.1, fireAt: .45, pellets: 10, ...damageProfile(10, 1.2), spread: 60, verticalSpread: 6 });
export const CAPTAIN_GRIP = Object.freeze({ id: 'captain-grip', label: 'Haste mine', cooldown: 20,
  duration: .5, fireAt: .25, lifetime: 20, buffDuration: 12, attackSpeed: 15 });
export function repeaterFalloff(distance) {
  return distance <= REPEATER_TUNING.idealRange ? 1
    : distance <= REPEATER_TUNING.middleRange ? .5
    : distance <= REPEATER_TUNING.maxRange ? .25 : 0;
}
export function createRepeaters({ chamber = SCATTERSHOT, grip = CAPTAIN_GRIP } = {}) {
  const definition = {
    basicAttack: { ...REPEATER_TUNING, stagger: 0 },
    id: 'repeaters', name: 'Repeaters', kind: 'ranged', aimSource: 'camera', presentation: { weaponShape: 'pistols' },
    movement: { facing: 'aim', camera: { distance: 5.5, height: 2, shoulder: .8 } },
    parts: { chamber, grip },
    hudHint: 'Hold LMB: fire | RMB: scattershot | R: reload | Q: haste mine | X: sheath',
    createState: () => ({ sheathed: true, action: null, elapsed: 0, ammo: 12, hand: 0,
      empowered: 0, scatterCooldown: 0, buffCooldown: 0, lastEvent: 'Weapon sheathed' }),
    setSheathed(state, value) {
      if (state.action) return;
      state.sheathed = value; state.lastEvent = value ? 'Weapon sheathed' : 'Repeaters drawn';
    },
    cancelAction(state) { state.action = null; state.elapsed = 0; },
    handleAttack(state, input, { autoReload = false, idealRange = false, reloadOrigin = null } = {}) {
      if (!['light', 'heavy', 'reload', 'buff'].includes(input) || state.action) return { type: 'input-ignored' };
      if (state.sheathed) {
        if (!['light', 'heavy'].includes(input)) return { type: 'input-ignored' };
        state.sheathed = false; return { type: 'unsheathed' };
      }
      if (input === 'light' && state.ammo === 0) {
        if (!autoReload) return { type: 'input-ignored' };
        input = 'reload';
      }
      if (input === 'heavy' && state.scatterCooldown > 0
        || input === 'buff' && state.buffCooldown > 0) return { type: 'input-ignored' };
      const duration = input === 'light' ? REPEATER_TUNING.shotInterval
        : input === 'reload' ? REPEATER_TUNING.reload : input === 'heavy' ? chamber.duration : grip.duration;
      state.action = { type: input, duration, fired: false, hand: state.hand };
      if (input === 'reload') {
        state.action.empoweredReload = idealRange;
        state.action.reloadOrigin = reloadOrigin;
      }
      state.elapsed = 0;
      if (input === 'light') { state.ammo--; state.hand = 1 - state.hand; }
      if (input === 'heavy') state.scatterCooldown = chamber.cooldown;
      if (input === 'buff') state.buffCooldown = grip.cooldown;
      state.lastEvent = { light: 'Alternating fire', reload: 'Reloading', heavy: chamber.label, buff: grip.label }[input];
      return { type: input };
    },
    step(state, dt, { attackSpeedMultiplier = 1 } = {}) {
      const events = [];
      for (const key of ['empowered', 'scatterCooldown', 'buffCooldown']) state[key] = Math.max(0, state[key] - dt);
      const action = state.action;
      if (action) {
        state.elapsed += dt * (action.type === 'light' ? attackSpeedMultiplier : 1);
        const fireAt = action.type === 'heavy' ? chamber.fireAt : action.type === 'buff' ? grip.fireAt : 0;
        if (!action.fired && state.elapsed >= fireAt) {
          action.fired = true;
          if (action.type === 'light' || action.type === 'heavy') events.push({ type: 'ranged-shot',
            ...damageProfile(10, action.type === 'light' ? REPEATER_TUNING.damageMultiplier : chamber.damageMultiplier ?? chamber.damage / 10),
            damageModifiers: state.empowered > 0 ? [{ source: 'repeater-empowered', stat: 'coreDamage',
              percent: REPEATER_TUNING.empoweredPercent, flat: 0, remaining: state.empowered }] : [],
            pellets: action.type === 'light' ? 1 : chamber.pellets,
            spread: action.type === 'light' ? 0 : chamber.spread,
            verticalSpread: chamber.verticalSpread, hand: action.hand });
          if (action.type === 'reload' && action.empoweredReload) events.push({ type: 'empowered-reload', origin: action.reloadOrigin });
          if (action.type === 'buff') events.push({ type: 'buff-mine', definition: grip });
        }
        if (state.elapsed + 1e-8 >= action.duration) {
          if (action.type === 'reload') {
            state.ammo = 12;
            if (action.empoweredReload) {
              state.empowered = REPEATER_TUNING.empoweredDuration;
            }
            state.lastEvent = action.empoweredReload ? 'Empowered reload' : 'Reloaded';
          }
          state.action = null;
        }
      }
      return { events, locked: Boolean(action), allowMove: true, movementScale: 1, travelDelta: 0 };
    },
    getHudResources: (state, player) => [
      { id: 'ammo', label: 'Ammo / R reload', kind: 'bar', glyph: 'R', text: `${state.ammo}/12`, value: state.ammo, max: 12 },
      { id: 'scatter', label: chamber.label, kind: 'slot', glyph: 'RMB', text: state.scatterCooldown > 0 ? `RMB ${state.scatterCooldown.toFixed(1)}` : 'RMB READY', value: chamber.cooldown - state.scatterCooldown, max: chamber.cooldown },
      { id: 'mine', label: grip.label, kind: 'slot', glyph: 'Q', text: state.buffCooldown > 0 ? `Q ${state.buffCooldown.toFixed(1)}` : 'Q READY', value: grip.cooldown - state.buffCooldown, max: grip.cooldown },
      { id: 'empowered', label: 'Empowered +70%', kind: 'bar', glyph: 'E', text: `EMPOWERED ${state.empowered.toFixed(1)}s`, value: state.empowered, max: 20 },
      { id: 'haste', label: 'Attack speed +15%', kind: 'buff', glyph: '+15%', value: getStatModifierRemaining(player.statModifiers, 'repeater-haste'), max: 12 },
    ],
  };
  return definition;
}
export const REPEATERS = createRepeaters();
