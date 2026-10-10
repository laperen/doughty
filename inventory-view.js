import { PART_TYPES, MATERIAL_SPECIES, filterStacks } from './inventory.js';

/** Full-screen material browser; the app retains its menu/pause state. */
export function createInventoryView({ state, onBack }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'inventoryMenu';
  dialog.className = 'inventory-menu';
  dialog.setAttribute('aria-labelledby', 'inventoryTitle');
  dialog.innerHTML = `<header class="inventory-heading"><h2 id="inventoryTitle"></h2><button class="menu-button" id="inventoryBack">Back to Gameplay</button></header>
    <p id="inventoryDescription"></p><div class="inventory-layout"><aside>
    <fieldset id="inventoryTypes"><legend>Part type</legend></fieldset>
    <fieldset id="inventorySpecies"><legend>Behemoth</legend></fieldset>
    <button class="menu-button" id="inventoryClear">Clear filters</button></aside>
    <section aria-label="Material stacks"><p id="inventorySummary" aria-live="polite"></p><div class="inventory-grid" id="inventoryStacks"></div></section></div>`;
  document.body.append(dialog);
  let mode = 'player';
  function addFilters(selector, entries) {
    const fieldset = dialog.querySelector(selector);
    for (const [id, label] of entries) {
      const row = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = id;
      row.append(input, document.createTextNode(label)); fieldset.append(row);
      input.addEventListener('change', render);
    }
  }
  addFilters('#inventoryTypes', Object.entries(PART_TYPES));
  addFilters('#inventorySpecies', Object.entries(MATERIAL_SPECIES).map(([id, value]) => [id, value.name]));
  const selected = selector => [...dialog.querySelectorAll(`${selector} input:checked`)].map(input => input.value);
  function render() {
    const all = filterStacks(state[mode]);
    const items = filterStacks(state[mode], selected('#inventoryTypes'), selected('#inventorySpecies'));
    dialog.querySelector('#inventoryTitle').textContent = mode === 'loot' ? 'Hunting Loot' : 'Inventory';
    dialog.querySelector('#inventoryDescription').textContent = mode === 'loot'
      ? 'Materials harvested from defeated Behemoths. Added to your inventory when you return to safety.'
      : 'Materials stored safely in your inventory.';
    dialog.querySelector('#inventorySummary').textContent = `${items.length} / ${all.length} stacks`;
    const grid = dialog.querySelector('#inventoryStacks'); grid.replaceChildren();
    for (const item of items) {
      const card = document.createElement('article'); card.className = 'material-stack';
      if (item.rare) card.classList.add('rare');
      const name = document.createElement('h3'); name.textContent = item.name;
      const type = document.createElement('p'); type.textContent = PART_TYPES[item.type];
      const count = document.createElement('strong'); count.textContent = `× ${item.count}`;
      card.append(name, type, count); grid.append(card);
    }
    if (!items.length) {
      const empty = document.createElement('p');
      empty.textContent = all.length ? 'No materials match these filters.' : 'No materials collected yet.';
      grid.append(empty);
    }
  }
  dialog.querySelector('#inventoryClear').addEventListener('click', () => {
    for (const input of dialog.querySelectorAll('input')) input.checked = false;
    render();
  });
  dialog.querySelector('#inventoryBack').addEventListener('click', onBack);
  dialog.addEventListener('cancel', event => { event.preventDefault(); onBack(); });
  return {
    get open() { return dialog.open; },
    show(nextMode) { mode = nextMode; render(); dialog.showModal(); dialog.querySelector('#inventoryBack').focus(); },
    close() { dialog.close(); },
  };
}
