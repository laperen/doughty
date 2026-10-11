import { addTimedStatModifier } from './stat-modifiers.js';

export const CELL_TYPES = Object.freeze({ defense: 'Defense', mobility: 'Mobility', power: 'Power', technique: 'Technique', utility: 'Utility' });

export const CELLS = Object.freeze({
  'evasive-fury': { name: 'Evasive Fury', type: 'technique', description: 'Avoid damage with dodge invulnerability to gain attack speed for 8 seconds. Successful evades refresh the duration.' },
  recycle: { name: 'Recycle', type: 'power', description: 'Each direct hit on the same Behemoth part adds one fifth of the damage bonus, up to five stacks. Hitting another part starts a new streak. Periodic damage does not build stacks.' },
});
export const cellBonus = level => level > 0 ? 5 + (Math.min(6, level) - 1) * 3 : 0;
export const embeddedCellLevel = ({ tier = 1, reforges = 0 } = {}) => Math.min(3, Math.max(Math.min(3, tier), reforges >= 4 ? 3 : reforges >= 2 ? 2 : 1));
export function createCellInventory(saved = {}) {
  return Object.fromEntries(Object.entries(saved || {}).filter(([key, count]) => {
    const [id, rank] = key.split(':');
    return Object.hasOwn(CELLS, id) && key === `${id}:${rank}` && ['1', '2', '3'].includes(rank) && Number.isSafeInteger(count) && count > 0;
  }));
}
/** Craft +1, or consume two identical preceding-rank cells. Validate before mutation. */
export function canCreateCell(inventory, id, rank, area) {
  if (area !== 'old-town' || !Object.hasOwn(CELLS, id) || ![1, 2, 3].includes(rank)) return false;
  return inventory.aetherDust >= (rank === 3 ? 40 : 20)
    && (rank === 1 || (inventory.cells[`${id}:${rank - 1}`] || 0) >= 2)
    && Number.isSafeInteger((inventory.cells[`${id}:${rank}`] || 0) + 1);
}
export function createCell(inventory, id, rank, area) {
  if (!canCreateCell(inventory, id, rank, area)) return false;
  inventory.aetherDust -= rank === 3 ? 40 : 20;
  if (rank > 1) {
    const input = `${id}:${rank - 1}`;
    inventory.cells[input] -= 2;
    if (!inventory.cells[input]) delete inventory.cells[input];
  }
  const output = `${id}:${rank}`;
  inventory.cells[output] = (inventory.cells[output] || 0) + 1;
  return true;
}
export function createCellCombatState() { return { target: null, part: null, stacks: 0 }; }
export function recordRecycleHit(state, target, part, level, periodic = false) {
  if (!level || periodic) return 0;
  state.stacks = state.target === target && state.part === part ? Math.min(5, state.stacks + 1) : 1;
  state.target = target; state.part = part;
  return cellBonus(level) * state.stacks / 5;
}
export function activateEvasiveFury(modifiers, level, { contact, dodgeProtected, otherwiseProtected = false, damage = 0 }) {
  if (!level || !contact || !dodgeProtected || otherwiseProtected || damage <= 0) return false;
  addTimedStatModifier(modifiers, { source: 'evasive-fury', stat: 'attackSpeed', percent: cellBonus(level), duration: 8 });
  return true;
}
