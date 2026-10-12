import { addTimedStatModifier, getEffectiveStat } from './stat-modifiers.js';
import { grantShield } from './resource-shields.js';

export const CELL_TYPES = Object.freeze({ defense: 'Defense', mobility: 'Mobility', power: 'Power', technique: 'Technique', utility: 'Utility' });

export const CELLS = Object.freeze({
  tough: { name: 'Tough', type: 'defense', levels: [25, 30, 35, 40, 45, 50], description: 'Increase maximum health by 25/30/35/40/45/50% at +1/+2/+3/+4/+5/+6.' },
  'counter-measures': { name: 'Counter Measures', type: 'defense', levels: [10, 20, 30, 40, 50, 60], description: 'Dodging through a damaging attack with invulnerability grants 10/20/30/40/50/60 health shields at +1/+2/+3/+4/+5/+6, once per dodge. Shields accumulate without a cap and absorb damage before health. All remaining shields disappear after 60 seconds without gaining shields.' },
  endurance: { name: 'Endurance', type: 'mobility', levels: [50, 60, 70, 80, 90, 100], description: 'Increase maximum stamina by 50/60/70/80/90/100% at +1/+2/+3/+4/+5/+6.' },
  'evasive-fury': { name: 'Evasive Fury', type: 'mobility', description: 'Avoid damage with dodge invulnerability to gain attack speed for 8 seconds. Successful evades refresh the duration.' },
  discipline: { name: 'Discipline', type: 'power', levels: [30, 40, 50, 60, 70, 80], description: 'Reduce maximum health by 30/40/50/60/70/80% and increase base power by 30/40/50/60/70/80% at +1/+2/+3/+4/+5/+6.' },
  'stunning-grace': { name: 'Stunning Grace', type: 'technique', levels: [15, 30, 55, 70, 85, 100], description: 'Dodging through a damaging attack with invulnerability immediately deals 15/30/55/70/85/100% of the equipped weapon’s first basic attack stagger damage at +1/+2/+3/+4/+5/+6, once per dodge. At +3 and above, this hit can interrupt, even with a weapon that deals no stagger damage.' },
  'wild-frenzy': { name: 'Wild Frenzy', type: 'technique', levels: [10, 12, 14, 16, 18, 20], description: 'After personally breaking a Behemoth part, gain 10/12/14/16/18/20% attack speed at +1/+2/+3/+4/+5/+6 for 15 seconds. Further breaks refresh the duration without stacking.' },
  parasitic: { name: 'Parasitic', type: 'utility', levels: [10, 12, 14, 16, 18, 20], description: 'Direct melee hits on Behemoth parts other than growths heal for 10/12/14/16/18/20% of actual core health damage dealt at +1/+2/+3/+4/+5/+6. Already-broken parts qualify; periodic damage does not.' },
  agility: { name: 'Agility', type: 'utility', levels: [25, 30, 35, 40, 45, 50], description: 'Reduce dodge stamina cost by 25/30/35/40/45/50% at +1/+2/+3/+4/+5/+6.' },
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
export function createCellCombatState() { return { target: null, part: null, stacks: 0, dodgeTriggers: new Set() }; }
/** Accept combined build levels; equipment slots can supply this map in a later step. */
export function cellEffect(id, level) {
  return level > 0 ? CELLS[id]?.levels?.[Math.min(6, Math.floor(level)) - 1] ?? 0 : 0;
}
export function syncCellStats(player, levels) {
  player.statModifiers = player.statModifiers.filter(m => !m.source.startsWith('cell-passive:'));
  for (const [id, stat, sign] of [['tough', 'maxHealth', 1], ['discipline', 'maxHealth', -1],
    ['discipline', 'coreDamage', 1], ['endurance', 'maxStamina', 1], ['agility', 'dodgeCost', -1]]) {
    const percent = cellEffect(id, levels[id]) * sign;
    if (percent) player.statModifiers.push({ source: `cell-passive:${id}`, stat, percent, flat: 0, remaining: Infinity });
  }
  player.maxHealth = Math.max(1, getEffectiveStat(100, 'maxHealth', player.statModifiers));
  player.maxStamina = Math.max(1, getEffectiveStat(100, 'maxStamina', player.statModifiers));
  player.health = Math.min(player.health, player.maxHealth);
  player.stamina = Math.min(player.stamina, player.maxStamina);
}
export function beginCellDodge(state) { state.dodgeTriggers.clear(); }
export function activateDodgeCells(state, player, levels, qualification, basicStagger = 0) {
  const { contact, dodgeProtected, otherwiseProtected = false, damage = 0 } = qualification;
  if (!contact || !dodgeProtected || otherwiseProtected || damage <= 0) return null;
  if (levels['evasive-fury']) activateEvasiveFury(player.statModifiers, levels['evasive-fury'], qualification);
  for (const id of ['counter-measures', 'stunning-grace']) {
    if (!levels[id] || state.dodgeTriggers.has(id)) continue;
    state.dodgeTriggers.add(id);
    if (id === 'counter-measures') grantShield(player, 'health', 'counter-measures', cellEffect(id, levels[id]), 60);
    else return { stagger: Math.max(0, basicStagger) * cellEffect(id, levels[id]) / 100, interrupt: levels[id] >= 3 };
  }
  return null;
}
export function recordCellDamage(player, levels, { brokenPart, coreDamage = 0, melee = false, periodic = false, growth = false, hasPart = true }) {
  if (brokenPart && levels['wild-frenzy']) addTimedStatModifier(player.statModifiers, {
    source: 'wild-frenzy', stat: 'attackSpeed', percent: cellEffect('wild-frenzy', levels['wild-frenzy']), duration: 15,
  });
  if (melee && !periodic && !growth && hasPart && player.health > 0) {
    const heal = Math.max(0, coreDamage) * cellEffect('parasitic', levels.parasitic) / 100;
    player.health = Math.min(player.maxHealth ?? 100, player.health + heal);
  }
}
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
