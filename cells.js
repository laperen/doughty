import { CELL_TUNING, CELL_RECIPES } from './content-tuning.js';
import { contentText } from './content-text.js';
import { addTimedStatModifier, getEffectiveStat } from './stat-modifiers.js';
import { grantShield } from './resource-shields.js';

export const CELL_TYPES = Object.freeze({ defense: 'Defense', mobility: 'Mobility', power: 'Power', technique: 'Technique', utility: 'Utility' });

export const CELLS = Object.freeze({
  "tough": { name: "Tough", type: "defense", ...CELL_TUNING["tough"], get description() { return contentText("cell:tough"); } },
  "counter-measures": { name: "Counter Measures", type: "defense", ...CELL_TUNING["counter-measures"], get description() { return contentText("cell:counter-measures"); } },
  "endurance": { name: "Endurance", type: "mobility", ...CELL_TUNING["endurance"], get description() { return contentText("cell:endurance"); } },
  "evasive-fury": { name: "Evasive Fury", type: "mobility", ...CELL_TUNING["evasive-fury"], get description() { return contentText("cell:evasive-fury"); } },
  "discipline": { name: "Discipline", type: "power", ...CELL_TUNING["discipline"], get description() { return contentText("cell:discipline"); } },
  "stunning-grace": { name: "Stunning Grace", type: "technique", ...CELL_TUNING["stunning-grace"], get description() { return contentText("cell:stunning-grace"); } },
  "wild-frenzy": { name: "Wild Frenzy", type: "technique", ...CELL_TUNING["wild-frenzy"], get description() { return contentText("cell:wild-frenzy"); } },
  "parasitic": { name: "Parasitic", type: "utility", ...CELL_TUNING["parasitic"], get description() { return contentText("cell:parasitic"); } },
  "agility": { name: "Agility", type: "utility", ...CELL_TUNING["agility"], get description() { return contentText("cell:agility"); } },
  "recycle": { name: "Recycle", type: "power", ...CELL_TUNING["recycle"], get description() { return contentText("cell:recycle"); } },
});
export const cellBonus = level => cellEffect('recycle', level);
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
  return inventory.aetherDust >= CELL_RECIPES[rank].dust
    && (rank === 1 || (inventory.cells[`${id}:${rank - 1}`] || 0) >= CELL_RECIPES[rank].inputs)
    && Number.isSafeInteger((inventory.cells[`${id}:${rank}`] || 0) + 1);
}
export function createCell(inventory, id, rank, area) {
  if (!canCreateCell(inventory, id, rank, area)) return false;
  inventory.aetherDust -= CELL_RECIPES[rank].dust;
  if (rank > 1) {
    const input = `${id}:${rank - 1}`;
    inventory.cells[input] -= CELL_RECIPES[rank].inputs;
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
    if (id === 'counter-measures') grantShield(player, 'health', 'counter-measures', cellEffect(id, levels[id]), CELL_TUNING[id].duration);
    else return { stagger: Math.max(0, basicStagger) * cellEffect(id, levels[id]) / 100, interrupt: levels[id] >= CELL_TUNING[id].interruptLevel };
  }
  return null;
}
export function recordCellDamage(player, levels, { brokenPart, coreDamage = 0, melee = false, periodic = false, growth = false, hasPart = true }) {
  if (brokenPart && levels['wild-frenzy']) addTimedStatModifier(player.statModifiers, {
    source: 'wild-frenzy', stat: 'attackSpeed', percent: cellEffect('wild-frenzy', levels['wild-frenzy']), duration: CELL_TUNING['wild-frenzy'].duration,
  });
  if (melee && !periodic && !growth && hasPart && player.health > 0) {
    const heal = Math.max(0, coreDamage) * cellEffect('parasitic', levels.parasitic) / 100;
    player.health = Math.min(player.maxHealth ?? 100, player.health + heal);
  }
}
export function recordRecycleHit(state, target, part, level, periodic = false) {
  if (!level || periodic) return 0;
  state.stacks = state.target === target && state.part === part ? Math.min(CELL_TUNING.recycle.maxStacks, state.stacks + 1) : 1;
  state.target = target; state.part = part;
  return cellBonus(level) * state.stacks / CELL_TUNING.recycle.maxStacks;
}
export function activateEvasiveFury(modifiers, level, { contact, dodgeProtected, otherwiseProtected = false, damage = 0 }) {
  if (!level || !contact || !dodgeProtected || otherwiseProtected || damage <= 0) return false;
  addTimedStatModifier(modifiers, { source: 'evasive-fury', stat: 'attackSpeed', percent: cellEffect('evasive-fury', level), duration: CELL_TUNING['evasive-fury'].duration });
  return true;
}
