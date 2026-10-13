import { addTimedStatModifier } from './stat-modifiers.js';
import { REPEATER_TUNING } from './repeaters-weapon.js';
import { QUILL_TUNING } from './weapon-family-abilities.js';

export const CHESTPLATE_TEXT = Object.freeze({
  embermane: 'Kindled Fury', quillshot: 'Quill Throw',
  embermaneDescription: 'Tap V to gain attack speed for 20 seconds. Cooldown: 30 seconds. Base: 5%; tier 4 adds 5%; reforge 8 adds 5%, for a maximum of 15%.',
  quillshotDescription: 'Charge for 30 seconds, then tap V to throw one interrupting quill straight in your facing direction. Deals 60 base damage and travels up to the maximum repeater shooting range. One ready quill is retained until used.',
});
export const CHESTPLATE_TUNING = Object.freeze({ buffDuration: 20, cooldown: 30, chargeTime: 30, damage: 60, commitment: 0.5, releaseAt: 0.45 });
export function chestplateAbility(item, { tier = 1, reforges = 0 } = {}) {
  if (item?.type !== 'chestplate') return null;
  if (item.species === 'embermane') return { species: item.species, percent: 5 + (tier >= 4 ? 5 : 0) + (reforges >= 8 ? 5 : 0) };
  if (item.species === 'quillshot') return { species: item.species, damage: CHESTPLATE_TUNING.damage, quills: 1 + (tier >= 4 ? 1 : 0) + (reforges >= 8 ? 1 : 0) };
  return null;
}
export function createChestplateAbilityState() { return { cooldown: 0, charge: 0, commitment: 0, yaw: 0, pendingProjectile: null }; }
export function stepChestplateAbility(state, ability, dt) {
  state.commitment = Math.max(0, state.commitment - dt);
  if (state.commitment < 1e-8) state.commitment = 0;
  state.cooldown = Math.max(0, state.cooldown - dt);
  if (ability?.species === 'quillshot') state.charge = Math.min(CHESTPLATE_TUNING.chargeTime, state.charge + dt);
  if (state.pendingProjectile && state.commitment <= CHESTPLATE_TUNING.commitment - CHESTPLATE_TUNING.releaseAt + 1e-8) {
    const projectile = state.pendingProjectile;
    state.pendingProjectile = null;
    return projectile;
  }
  return null;
}
export function activateChestplateAbility(state, ability, modifiers, yaw) {
  if (state.commitment > 0) return { activated: false, projectile: null };
  if (ability?.species === 'embermane' && state.cooldown <= 0) {
    addTimedStatModifier(modifiers, { source: 'embermane-chestplate', stat: 'attackSpeed', percent: ability.percent, duration: CHESTPLATE_TUNING.buffDuration });
    state.cooldown = CHESTPLATE_TUNING.cooldown;
    return { activated: true, projectile: null };
  }
  if (ability?.species === 'quillshot' && state.charge >= CHESTPLATE_TUNING.chargeTime) {
    state.charge = 0;
    state.commitment = CHESTPLATE_TUNING.commitment;
    state.yaw = yaw;
    state.pendingProjectile = Array.from({ length: ability.quills }, (_, index) => ({ ...QUILL_TUNING, id: 'chestplate-quill', kind: 'quill', attackYaw: yaw + (index - (ability.quills - 1) / 2) * 5 * Math.PI / 180,
      damage: ability.damage, range: REPEATER_TUNING.maxRange, lateralOffset: 0, dissipateWidth: QUILL_TUNING.width, interrupt: true }));
    return { activated: true, projectile: null };
  }
  return { activated: false, projectile: null };
}
