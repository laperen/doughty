import { ARMOR, ARMOR_SLOTS } from './armor.js';
import { canChangeEquipment, EQUIPMENT } from './equipment.js';
import { CELLS, embeddedCellLevel } from './cells.js';

/** Slot upgrades replace category restrictions without adding slots. */
export function equipmentCellSlots(item, { reforges = 0 } = {}) {
  return (item?.cellSlots ?? []).map((category, index) =>
    reforges >= (index === 0 ? 6 : 10) ? 'prismatic' : category);
}

/** Fixed embeddings grant effects only from owned, currently equipped pieces. */
export function equipmentCellTotals(inventory) {
  const totals = {};
  const add = (item, progress) => {
    if (!item || !progress) return;
    if (item.embeddedCell) totals[item.embeddedCell] = (totals[item.embeddedCell] ?? 0) + embeddedCellLevel(progress);
    for (const key of inventory.cellSockets?.[item.id] ?? []) {
      if (!key) continue;
      const [id, rank] = key.split(':');
      totals[id] = (totals[id] ?? 0) + Number(rank);
    }
  };
  const weaponId = inventory.equipment.equipped;
  add(EQUIPMENT[weaponId], inventory.equipment.owned[weaponId]);
  for (const slot of Object.keys(ARMOR_SLOTS)) {
    const id = inventory.armor.equipped[slot];
    if (ARMOR[id]?.type === slot) add(ARMOR[id], inventory.armor.owned[id]);
  }
  return totals;
}
export function equipmentCellLevels(inventory) {
  return Object.fromEntries(Object.entries(equipmentCellTotals(inventory)).map(([id, total]) => [id, Math.min(6, total)]));
}

const cellItem = (inventory, id) => {
  const item = EQUIPMENT[id] ?? ARMOR[id];
  const progress = EQUIPMENT[id] ? inventory.equipment.owned[id] : inventory.armor.owned[id];
  return { item, progress };
};
export function cellFitsSlot(inventory, itemId, index, key) {
  const { item, progress } = cellItem(inventory, itemId);
  const category = progress && equipmentCellSlots(item, progress)[index];
  if (!category || !Number.isInteger(index) || index < 0) return false;
  if (key === null) return true;
  const [id, rank] = String(key).split(':');
  return !!CELLS[id] && ['1', '2', '3'].includes(rank) && key === `${id}:${rank}`
    && (category === 'prismatic' || CELLS[id].type === category);
}
/** Stored stacks exclude inserted copies; replacement returns the previous copy. */
export function equipCell(inventory, itemId, index, key, area) {
  const equipped = inventory.equipment.equipped === itemId || Object.values(inventory.armor.equipped).includes(itemId);
  if (!canChangeEquipment(area) || !equipped || !cellFitsSlot(inventory, itemId, index, key)) return false;
  const previous = inventory.cellSockets?.[itemId]?.[index] ?? null;
  if (previous === key) return true;
  if (key !== null && !(inventory.cells[key] > 0)) return false;
  if (previous && !Number.isSafeInteger((inventory.cells[previous] ?? 0) + 1)) return false;
  inventory.cellSockets ??= {};
  const { item, progress } = cellItem(inventory, itemId);
  const slots = inventory.cellSockets[itemId] ?? Array(equipmentCellSlots(item, progress).length).fill(null);
  if (key !== null && --inventory.cells[key] === 0) delete inventory.cells[key];
  if (previous) inventory.cells[previous] = (inventory.cells[previous] ?? 0) + 1;
  slots[index] = key; inventory.cellSockets[itemId] = slots;
  return true;
}
export function restoreCellSockets(inventory, saved = {}) {
  const result = {};
  for (const [id, slots] of Object.entries(saved ?? {})) {
    const { item, progress } = cellItem(inventory, id);
    if (!item || !progress || !Array.isArray(slots)) continue;
    result[id] = equipmentCellSlots(item, progress).map((_, index) => cellFitsSlot(inventory, id, index, slots[index]) ? slots[index] : null);
  }
  return result;
}
