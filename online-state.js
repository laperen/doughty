import { BEHEMOTH_SPECIES, createBehemothState } from './encounter-combat.js';
import { createIslandEncounter, islandDefinition } from './island-encounters.js';
import { hasRunOutContact } from './behemoth-run-out.js';

/** Definitions stay local; snapshots include timers, RNG, projectiles and lifecycle. */
export function plainState(value) {
  return JSON.parse(JSON.stringify(value, (key, entry) => key === 'definition' ? undefined : entry instanceof Set ? [...entry] : entry));
}
/** Only equipped gear crosses the network; stored materials/currency stay private. */
export function networkLoadout(inventory) {
  const weapon = inventory.equipment.equipped;
  const armorIds = Object.values(inventory.armor.equipped).filter(Boolean);
  const itemIds = [weapon, ...armorIds].filter(Boolean);
  return {
    equipment: { equipped: weapon, owned: weapon ? { [weapon]: inventory.equipment.owned[weapon] } : {} },
    armor: { equipped: inventory.armor.equipped, owned: Object.fromEntries(armorIds.map(id => [id, inventory.armor.owned[id]])) },
    cellSockets: Object.fromEntries(itemIds.filter(id => inventory.cellSockets?.[id]).map(id => [id, inventory.cellSockets[id]])),
  };
}
export function restoreEncounter(snapshot, previous) {
  const map = islandDefinition(snapshot?.mapId);
  if (!snapshot || !map || !BEHEMOTH_SPECIES.includes(snapshot.speciesId) || !Number.isInteger(snapshot.index) || snapshot.index < 0 || snapshot.index >= map.arenas.length) throw new Error('Invalid encounter snapshot');
  const same = previous?.id === snapshot.id && previous?.speciesId === snapshot.speciesId && previous?.boss.tier === snapshot.boss?.tier;
  const result = same ? previous : createIslandEncounter(snapshot.index, snapshot.serial, snapshot.speciesId, snapshot.tier, snapshot.mapId);
  const boss = same ? result.boss : createBehemothState(snapshot.speciesId, snapshot.boss.tier);
  const definition = boss.definition;
  for (const key of Object.keys(boss)) if (key !== 'definition') delete boss[key];
  Object.assign(boss, snapshot.boss, { definition });
  const oldSummon = result.summon;
  const others = snapshot.others?.map(e => restoreEncounter(e, result.others?.find(old => old.id === e.id)));
  Object.assign(result, snapshot, { boss, summon: snapshot.summon ? restoreEncounter(snapshot.summon, oldSummon) : null });
  if (others) result.others = others;
  else delete result.others;
  return result;
}

/** Keep repeated melee contacts independent per hunter, including side-combo phases. */
export function contactKey(boss) {
  if (hasRunOutContact(boss)) return `run-out:${boss.runOutCount}`;
  return `${boss.attackCount}:${boss.move}:${boss.sideCombo?.cycle ?? ''}:${boss.sideCombo?.phase ?? ''}`;
}
