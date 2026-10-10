/** Materials are species-owned; physical parts explicitly map to shared items. */
export const PART_TYPES = Object.freeze({ legs: 'Legs', tails: 'Tails', heads: 'Heads', horns: 'Horns', cores: 'Cores (core and heart)', growths: 'Growths' });
const commonParts = { head: 'head', tail: 'tail', leftFore: 'leg', rightFore: 'leg', leftHind: 'leg', rightHind: 'leg' };
export const MATERIAL_SPECIES = Object.freeze({
  'first-behemoth': { name: 'Embermane', core: 'heart', parts: { ...commonParts, horn: 'horn' }, items: { leg: 'legs', tail: 'tails', head: 'heads', horn: 'horns', heart: 'cores' } },
  quillshot: { name: 'Quillshot', core: 'core', parts: { ...commonParts, leftTusk: 'tusk', rightTusk: 'tusk', quillFrontLeft: 'quills', quillFrontRight: 'quills', quillRearLeft: 'quills', quillRearRight: 'quills' }, items: { leg: 'legs', tail: 'tails', head: 'heads', tusk: 'horns', quills: 'growths', core: 'cores' } },
});
export const MATERIALS = Object.freeze(Object.fromEntries(Object.entries(MATERIAL_SPECIES).flatMap(([speciesId, species]) => Object.entries(species.items).map(([part, type]) => {
  const id = `${speciesId}:${part}`;
  return [id, { id, speciesId, type, name: `${species.name} ${part[0].toUpperCase()}${part.slice(1)}`, rare: type === 'cores' }];
}))));
export const INVENTORY_STORAGE_KEY = 'doughty-material-inventory-v1';
const validStacks = input => Object.fromEntries(Object.entries(input && typeof input === 'object' ? input : {}).filter(([id, count]) => MATERIALS[id] && Number.isSafeInteger(count) && count > 0));
export function createInventoryState(saved = {}) {
  return { player: validStacks(saved?.player), loot: validStacks(saved?.loot) };
}
export function loadInventory(storage) {
  try { return createInventoryState(JSON.parse(storage.getItem(INVENTORY_STORAGE_KEY) || '{}')); }
  catch { return createInventoryState(); }
}
export function saveInventory(state, storage) {
  try { storage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
/** Idempotent per encounter. Regrowth cannot erase or duplicate a physical part. */
export function collectDefeatLoot(inventory, boss, random = Math.random) {
  if (boss.mode !== 'defeated' || boss.lootAwarded) return {};
  const speciesId = boss.speciesId ?? 'first-behemoth';
  const species = MATERIAL_SPECIES[speciesId];
  if (!species) return {};
  const rewards = {};
  for (const [partId, part] of Object.entries(boss.parts)) {
    const material = species.parts[partId];
    if (material && (part.broken || part.everBroken)) {
      const id = `${speciesId}:${material}`;
      rewards[id] = (rewards[id] || 0) + 1;
    }
  }
  if (random() < 0.5) rewards[`${speciesId}:${species.core}`] = 1;
  for (const [id, count] of Object.entries(rewards)) inventory.loot[id] = (inventory.loot[id] || 0) + count;
  boss.lootAwarded = true;
  return rewards;
}
/** Merge and clear together, saved as one record by the caller. */
export function bankLoot(inventory) {
  for (const [id, count] of Object.entries(inventory.loot)) inventory.player[id] = (inventory.player[id] || 0) + count;
  inventory.loot = {};
}
export function filterStacks(stacks, types = [], species = []) {
  return Object.entries(stacks).filter(([id, count]) => count > 0 && MATERIALS[id])
    .map(([id, count]) => ({ ...MATERIALS[id], count }))
    .filter(item => (!types.length || types.includes(item.type)) && (!species.length || species.includes(item.speciesId)))
    .sort((a, b) => a.name.localeCompare(b.name));
}
