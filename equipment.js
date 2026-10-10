/** Equipment identity is independent of the weapon module's moveset. */
export const STARTER_DAMAGE = Object.freeze({ 'striker-sword': 20, repeaters: 10, chainblades: 14 });
const types = { 'striker-sword': 'Sword', repeaters: 'Repeaters', chainblades: 'Chainblades' };
export const EQUIPMENT = Object.freeze(Object.fromEntries(Object.entries(types).flatMap(([type, name]) => [
  [`starter:${type}`, { id: `starter:${type}`, type, name: `Starter ${name}`, damage: STARTER_DAMAGE[type], starter: true }],
  ...['embermane', 'quillshot'].map(species => [`${species}:${type}`, { id: `${species}:${type}`, type, species,
    name: `${species === 'embermane' ? 'Embermane' : 'Quillshot'} ${name}`, damage: STARTER_DAMAGE[type] + (type === 'striker-sword' ? 5 : 2) }]),
])));
export const RECIPES = Object.freeze(Object.fromEntries(Object.values(EQUIPMENT).filter(item => !item.starter).map(item => {
  const ember = item.species === 'embermane', sword = item.type === 'striker-sword', ranged = item.type === 'repeaters';
  const prefix = ember ? 'first-behemoth' : 'quillshot';
  const parts = ember ? (ranged ? { head: 1, leg: 1 } : { leg: 2 }) : (sword ? { tusk: 1, leg: 1 } : { tusk: 2 });
  return [item.id, { itemId: item.id, crafter: ranged ? 'repeaters' : 'smith', currency: 200,
    materials: Object.fromEntries(Object.entries(parts).map(([part, count]) => [`${prefix}:${part}`, count])) }];
})));
export function createEquipmentState(saved = {}, legacyType = 'striker-sword') {
  const owned = Object.fromEntries(Object.values(EQUIPMENT).filter(item => item.starter).map(item => [item.id, { tier: 1, reforges: 0 }]));
  for (const [id, progress] of Object.entries(saved?.owned || {})) {
    if (Object.hasOwn(EQUIPMENT, id)) owned[id] = { tier: Number.isInteger(progress?.tier) && progress.tier >= 1 && progress.tier <= 4 ? progress.tier : 1,
      reforges: Number.isSafeInteger(progress?.reforges) && progress.reforges >= 0 ? progress.reforges : 0 };
  }
  const selected = Object.hasOwn(saved || {}, 'equipped') ? saved.equipped : legacyType === '' ? null : `starter:${legacyType}`;
  return { owned, equipped: selected === null ? null : Object.hasOwn(owned, selected) ? selected : 'starter:striker-sword' };
}
export function canChangeEquipment(area) { return area === 'old-town' || area === 'range'; }
export function equipItem(state, id, area) {
  if (!canChangeEquipment(area) || id !== null && !Object.hasOwn(state.owned, id)) return false;
  state.equipped = id; return true;
}
export function canCraft(inventory, id, crafter) {
  const recipe = Object.hasOwn(RECIPES, id) ? RECIPES[id] : null;
  return !!recipe && recipe.crafter === crafter && !inventory.equipment.owned[id] && inventory.currency >= recipe.currency
    && Object.entries(recipe.materials).every(([part, count]) => (inventory.player[part] || 0) >= count);
}
/** Validate all inputs before any mutation; the caller persists one complete record. */
export function craftWeapon(inventory, id, crafter, area) {
  if (area !== 'old-town' || !canCraft(inventory, id, crafter)) return false;
  const recipe = RECIPES[id];
  inventory.currency -= recipe.currency;
  for (const [part, count] of Object.entries(recipe.materials)) {
    inventory.player[part] -= count;
    if (!inventory.player[part]) delete inventory.player[part];
  }
  inventory.equipment.owned[id] = { tier: 1, reforges: 0 };
  return true;
}
