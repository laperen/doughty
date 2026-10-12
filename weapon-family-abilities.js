import { addTimedStatModifier } from './stat-modifiers.js';

export const QUILL_TUNING = Object.freeze({ chargeTime: 12, speed: 24, range: 25,
  width: .18, height: .18, depth: .65, centerHeight: 1.3, spacing: .22 });
export const FAMILY_TEXT = Object.freeze({
  embermane: 'Embermane movement', quillshot: 'Regrowing volley',
  embermaneDescription: 'Dodging through an attack grants movement speed for 20 seconds. Further qualifying evades refresh the timer. Tiers 1-3: 10%; tier 4: 20%; reforge 8+: 30%.',
  quillshotDescription: 'Charge for 12 seconds, including while sheathed. The next executed attack launches quills forward, even on a miss. Each quill deals 100% weapon base damage. Tiers 1-3: one quill; tier 4: two; reforge 8+: three. Launching restarts charging; one ready volley is retained until used.',
});
export function familyAbility(item, { tier = 1, reforges = 0 } = {}) {
  if (item?.species === 'embermane') return { species: item.species, percent: reforges >= 8 ? 30 : tier >= 4 ? 20 : 10 };
  if (item?.species === 'quillshot') return { species: item.species, count: reforges >= 8 ? 3 : tier >= 4 ? 2 : 1, damage: item.damage };
  return null;
}
export function createFamilyAbilityState() { return { charge: 0, seenActions: new WeakSet() }; }
export function stepFamilyAbility(state, ability, dt) {
  if (ability?.species === 'quillshot') state.charge = Math.min(QUILL_TUNING.chargeTime, state.charge + dt);
}
export function activateEmbermane(modifiers, ability, { contact, dodgeProtected, otherwiseProtected = false, damage = 0 }) {
  if (ability?.species !== 'embermane' || !contact || !dodgeProtected || otherwiseProtected || damage <= 0) return false;
  addTimedStatModifier(modifiers, { source: 'embermane-movement', stat: 'movementSpeed', percent: ability.percent, duration: 20 });
  return true;
}
/** Observe actual action identity, so buffering, reloads and unsheathing never consume a volley. */
export function executeFamilyAttack(state, ability, action, yaw) {
  if (!action || !(action.move?.damage > 0 || action.special || ['light', 'heavy'].includes(action.type)) || state.seenActions.has(action)) return [];
  state.seenActions.add(action);
  if (ability?.species !== 'quillshot' || state.charge < QUILL_TUNING.chargeTime) return [];
  state.charge = 0;
  return Array.from({ length: ability.count }, (_, index) => ({ ...QUILL_TUNING,
    id: 'weapon-quill', kind: 'quill', attackYaw: yaw, damage: ability.damage,
    lateralOffset: (index - (ability.count - 1) / 2) * QUILL_TUNING.spacing,
    dissipateWidth: QUILL_TUNING.width, interrupt: false }));
}
