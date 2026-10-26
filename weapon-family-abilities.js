import { QUILL_TUNING, FAMILY_TUNING } from './content-tuning.js';
import { contentText } from './content-text.js';
import { addTimedStatModifier } from './stat-modifiers.js';

export { QUILL_TUNING } from './content-tuning.js';
export const FAMILY_TEXT = Object.freeze({
  embermane: 'Embermane movement', quillshot: 'Regrowing volley',
  get embermaneDescription() { return contentText('family:embermane'); },
  get quillshotDescription() { return contentText('family:quillshot'); },
});
export function familyAbility(item, { tier = 1, reforges = 0 } = {}) {
  if (item?.species === 'embermane') return { species: item.species, percent: reforges >= 8 ? FAMILY_TUNING.embermane.reforge8 : tier >= 4 ? FAMILY_TUNING.embermane.tier4 : FAMILY_TUNING.embermane.base };
  if (item?.species === 'quillshot') return { species: item.species, count: reforges >= 8 ? FAMILY_TUNING.quillshot.reforge8 : tier >= 4 ? FAMILY_TUNING.quillshot.tier4 : FAMILY_TUNING.quillshot.base, damage: item.damage * FAMILY_TUNING.quillshot.damagePercent / 100 };
  return null;
}
export function createFamilyAbilityState() { return { charge: 0, seenActions: new WeakSet() }; }
export function stepFamilyAbility(state, ability, dt) {
  if (ability?.species === 'quillshot') state.charge = Math.min(QUILL_TUNING.chargeTime, state.charge + dt);
}
export function activateEmbermane(modifiers, ability, { contact, dodgeProtected, otherwiseProtected = false, damage = 0 }) {
  if (ability?.species !== 'embermane' || !contact || !dodgeProtected || otherwiseProtected || damage <= 0) return false;
  addTimedStatModifier(modifiers, { source: 'embermane-movement', stat: 'movementSpeed', percent: ability.percent, duration: FAMILY_TUNING.embermane.duration });
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
