import { CHARACTER_SLOTS } from './character-assets.js';
/** Visual catalog. URLs resolve relative to this module; none of these values are combat tuning.
 * Replace a procedural entry with { kind: 'skinned'|'rigid', url: './character-assets/...' }.
 * Rigid entries may specify attachment, transform, hideHair, hideFace and hideHead.
 */
export const VISUAL_ASSETS = {
  body: { kind: 'procedural' }, legs: { kind: 'procedural' }, gloves: { kind: 'procedural' },
  head: { kind: 'procedural' }, face: { kind: 'procedural' },
  helmet: { kind: 'procedural' }, hair: { kind: 'procedural' }, mask: { kind: 'procedural' }, goggles: { kind: 'procedural' },
  sword: { kind: 'procedural' }, repeaterLeft: { kind: 'procedural' }, repeaterRight: { kind: 'procedural' },
  chainbladeLeft: { kind: 'procedural' }, chainbladeRight: { kind: 'procedural' },
};
// Existing crafted equipment shares the current mannequin and attached weapon assets.
export const EQUIPMENT_VISUALS = Object.fromEntries(['embermane', 'quillshot'].flatMap(family => [
  [`${family}:helmet`, { helmet: 'helmet' }], [`${family}:chestplate`, { body: 'body' }],
  [`${family}:legs`, { legs: 'legs' }], [`${family}:gloves`, { gloves: 'gloves' }],
]));
for (const family of ['starter', 'embermane', 'quillshot']) {
  EQUIPMENT_VISUALS[`${family}:striker-sword`] = { sword: 'sword' };
  EQUIPMENT_VISUALS[`${family}:repeaters`] = { repeaterLeft: 'repeaterLeft', repeaterRight: 'repeaterRight' };
  EQUIPMENT_VISUALS[`${family}:chainblades`] = { chainbladeLeft: 'chainbladeLeft', chainbladeRight: 'chainbladeRight' };
}
export function equipmentVisualSelection(inventory) {
  const selection = Object.fromEntries(CHARACTER_SLOTS.map(id => [id, id]));
  for (const id of [inventory?.equipment?.equipped, ...Object.values(inventory?.armor?.equipped ?? {})]) {
    Object.assign(selection, EQUIPMENT_VISUALS[id]);
  }
  return selection;
}
/** Apply only changed visual IDs. The caller retains all gameplay state and authority. */
export function applyEquipmentVisuals(view, inventory, overrides = {}) {
  const selection = { ...equipmentVisualSelection(inventory), ...overrides };
  view.visualSelection ??= {};
  view.visualErrors ??= {};
  const pending = [];
  for (const [slot, id] of Object.entries(selection)) {
    if (view.visualSelection[slot] === id) continue;
    const definition = VISUAL_ASSETS[id];
    view.visualSelection[slot] = id; delete view.visualErrors[slot];
    if (!definition || definition.kind === 'procedural') view.assets.reset(slot);
    else pending.push(view.assets.load(slot, { ...definition, id, url: new URL(definition.url, import.meta.url).href })
      .catch(error => { if (view.visualSelection[slot] === id) view.visualErrors[slot] = error.message; }));
  }
  return Promise.all(pending);
}
