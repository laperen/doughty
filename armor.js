import { canChangeEquipment } from './equipment.js';

export const ARMOR_SLOTS = Object.freeze({ helmet: 'Helmet', chestplate: 'Chestplate', gloves: 'Gloves', legs: 'Legs' });
const parts = {
  embermane: { chestplate: { horn: 1, head: 1 }, gloves: { leg: 2 }, legs: { leg: 2 }, helmet: { horn: 1 } },
  quillshot: { chestplate: { head: 1, tusk: 1 }, gloves: { tusk: 2 }, legs: { leg: 1, tusk: 1 }, helmet: { head: 1 } },
};
const cellLayouts = {
  embermane: { helmet: ['counter-measures', ['technique']], chestplate: ['agility', ['utility', 'mobility']],
    gloves: ['endurance', ['power']], legs: ['tough', ['technique']] },
  quillshot: { helmet: ['tough', ['power']], chestplate: ['endurance', ['utility', 'defense']],
    gloves: ['counter-measures', ['technique']], legs: ['agility', ['power']] },
};
export const ARMOR = Object.freeze(Object.fromEntries(Object.entries(parts).flatMap(([species, recipes]) =>
  Object.entries(ARMOR_SLOTS).map(([slot, label]) => {
    const id = `${species}:${slot}`, prefix = species === 'embermane' ? 'first-behemoth' : species;
    return [id, { id, type: slot, species, name: `${species === 'embermane' ? 'Embermane' : 'Quillshot'} ${label}`,
      embeddedCell: cellLayouts[species][slot][0], cellSlots: Object.freeze(cellLayouts[species][slot][1]),
      defense: slot === 'chestplate' ? 2 : 1, currency: slot === 'chestplate' ? 200 : 100,
      materials: Object.fromEntries(Object.entries(recipes[slot]).map(([part, count]) => [`${prefix}:${part}`, count])) }];
  }))));
export function createArmorState(saved = {}) {
  const owned = Object.fromEntries(Object.keys(saved?.owned || {}).filter(id => Object.hasOwn(ARMOR, id)).map(id => {
    const progress = saved.owned[id];
    return [id, { tier: Number.isInteger(progress?.tier) && progress.tier >= 1 && progress.tier <= 4 ? progress.tier : 1,
      reforges: Number.isSafeInteger(progress?.reforges) && progress.reforges >= 0 ? progress.reforges : 0 }];
  }));
  const equipped = Object.fromEntries(Object.keys(ARMOR_SLOTS).map(slot => {
    const id = saved?.equipped?.[slot];
    return [slot, owned[id] && ARMOR[id]?.type === slot ? id : null];
  }));
  return { owned, equipped };
}
export function equipArmor(state, id, slot, area) {
  if (!canChangeEquipment(area) || !Object.hasOwn(ARMOR_SLOTS, slot)
    || id !== null && (!Object.hasOwn(state.owned, id) || ARMOR[id]?.type !== slot)) return false;
  state.equipped[slot] = id;
  return true;
}
export function canCraftArmor(inventory, id) {
  const item = Object.hasOwn(ARMOR, id) ? ARMOR[id] : null;
  return !!item && !Object.hasOwn(inventory.armor.owned, id) && inventory.currency >= item.currency
    && Object.entries(item.materials).every(([part, count]) => (inventory.player[part] || 0) >= count);
}
export function craftArmor(inventory, id, area) {
  if (area !== 'old-town' || !canCraftArmor(inventory, id)) return false;
  const item = ARMOR[id];
  inventory.currency -= item.currency;
  for (const [part, count] of Object.entries(item.materials)) {
    inventory.player[part] -= count;
    if (!inventory.player[part]) delete inventory.player[part];
  }
  inventory.armor.owned[id] = { tier: 1, reforges: 0 };
  return true;
}
const DEFENSE_TIERS = { helmet: [1, 3, 4, 5], chestplate: [2, 3, 4, 5], gloves: [1, 2, 4, 5], legs: [1, 2, 3, 5] };
export function armorPieceDefense(item, { tier = 1 } = {}) {
  return DEFENSE_TIERS[item?.type]?.[tier - 1] ?? 0;
}
export function armorUpgradeRecipe(inventory, id) {
  const item = Object.hasOwn(ARMOR, id) ? ARMOR[id] : null;
  const progress = inventory.armor.owned[id];
  if (!item || !progress || progress.tier >= 4) return null;
  const tier = progress.tier + 1;
  return { tier, currency: item.currency * tier,
    materials: Object.fromEntries(Object.entries(item.materials).map(([part, count]) => [part, count * tier])) };
}
export function canUpgradeArmor(inventory, id) {
  const recipe = armorUpgradeRecipe(inventory, id);
  return !!recipe && inventory.currency >= recipe.currency
    && Object.entries(recipe.materials).every(([part, count]) => (inventory.player[part] || 0) >= count);
}
export function upgradeArmor(inventory, id, area) {
  if (area !== 'old-town' || !canUpgradeArmor(inventory, id)) return false;
  const recipe = armorUpgradeRecipe(inventory, id);
  inventory.currency -= recipe.currency;
  for (const [part, count] of Object.entries(recipe.materials)) {
    inventory.player[part] -= count;
    if (!inventory.player[part]) delete inventory.player[part];
  }
  inventory.armor.owned[id].tier = recipe.tier;
  return true;
}
export function armorDefense(state) {
  return Object.keys(ARMOR_SLOTS).reduce((total, slot) => {
    const id = state.equipped[slot];
    return total + (Object.hasOwn(state.owned, id) && ARMOR[id]?.type === slot ? armorPieceDefense(ARMOR[id], state.owned[id]) : 0);
  }, 0);
}
export function mitigateDamage(damage, defense) { return Math.max(0, damage - Math.max(0, defense)); }
