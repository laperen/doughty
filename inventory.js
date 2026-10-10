/** Materials are species-owned; physical parts explicitly map to shared items. */
export const PART_TYPES = Object.freeze({ legs: 'Legs', tails: 'Tails', heads: 'Heads', horns: 'Horns', cores: 'Cores (core and heart)', growths: 'Growths' });
const commonParts = { head: 'head', tail: 'tail', leftFore: 'leg', rightFore: 'leg', leftHind: 'leg', rightHind: 'leg' };
export const MATERIAL_SPECIES = Object.freeze({
  'first-behemoth': { name: 'Embermane', core: 'heart', parts: { ...commonParts, horn: 'horn' }, items: { leg: 'legs', tail: 'tails', head: 'heads', horn: 'horns', heart: 'cores' } },
  quillshot: { name: 'Quillshot', core: 'core', parts: { ...commonParts, leftTusk: 'tusk', rightTusk: 'tusk', quillFrontLeft: 'quills', quillFrontRight: 'quills', quillRearLeft: 'quills', quillRearRight: 'quills' }, items: { leg: 'legs', tail: 'tails', head: 'heads', tusk: 'horns', quills: 'growths', core: 'cores' } },
});
export const RARITIES = Object.freeze({ common: { name: 'Common', dust: 5, score: 1 }, rare: { name: 'Rare', dust: 10, score: 2 }, superior: { name: 'Superior', dust: 20, score: 3 } });
export const MATERIALS = Object.freeze(Object.fromEntries(Object.entries(MATERIAL_SPECIES).flatMap(([speciesId, species]) => Object.entries(species.items).map(([part, type]) => {
  const id = `${speciesId}:${part}`;
  const rarity = type === 'cores' ? 'superior' : (speciesId === 'first-behemoth' ? ['horn', 'tail'] : ['head', 'tail']).includes(part) ? 'rare' : 'common';
  return [id, { id, speciesId, type, rarity, rarityScore: RARITIES[rarity].score, dustYield: RARITIES[rarity].dust, name: `${species.name} ${part[0].toUpperCase()}${part.slice(1)}`, rare: rarity === 'rare' }];
}))));
export const INVENTORY_STORAGE_KEY = 'doughty-material-inventory-v1';
const validStacks = input => Object.fromEntries(Object.entries(input && typeof input === 'object' ? input : {}).filter(([id, count]) => MATERIALS[id] && Number.isSafeInteger(count) && count > 0));
export function createInventoryState(saved = {}) {
  return { player: validStacks(saved?.player), loot: validStacks(saved?.loot), aetherDust: Number.isSafeInteger(saved?.aetherDust) && saved.aetherDust >= 0 ? saved.aetherDust : 0 };
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

/** Validate the complete selection before consuming any banked parts. */
export function extractionYield(inventory, selections) {
  const entries = Object.entries(selections || {});
  if (!entries.length) return 0;
  let total = 0;
  for (const [id, quantity] of entries) {
    if (!MATERIALS[id] || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > (inventory.player[id] || 0)) return 0;
    total += MATERIALS[id].dustYield * quantity;
    if (!Number.isSafeInteger(total)) return 0;
  }
  return Number.isSafeInteger(inventory.aetherDust + total) ? total : 0;
}
export function extractSelectedParts(inventory, selections) {
  const dust = extractionYield(inventory, selections);
  if (!dust) return 0;
  for (const [id, quantity] of Object.entries(selections)) {
    inventory.player[id] -= quantity;
    if (!inventory.player[id]) delete inventory.player[id];
  }
  inventory.aetherDust += dust;
  return dust;
}
export function extractAetherDust(inventory, id, quantity) {
  return extractSelectedParts(inventory, { [id]: quantity });
}
