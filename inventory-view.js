import { PART_TYPES, MATERIAL_SPECIES, MATERIALS, RARITIES, filterStacks, extractionYield, extractSelectedParts } from './inventory.js';

/** Full-screen material browser; selections remain drafts until confirmation. */
export function createInventoryView({ state, onBack, onExtract = () => true }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'inventoryMenu';
  dialog.className = 'inventory-menu';
  dialog.setAttribute('aria-labelledby', 'inventoryTitle');
  dialog.innerHTML = `<header class="inventory-heading"><h2 id="inventoryTitle"></h2><button class="menu-button" id="inventoryBack">Back to Gameplay</button></header>
    <p id="inventoryDescription"></p><p id="aetherDustBalance"></p><div class="inventory-layout"><aside>
    <details class="inventory-filter-section" id="inventoryTypes"><summary><span>Part type</span><span class="filter-active-count">(0)</span></summary><div class="filter-options"></div></details>
    <details class="inventory-filter-section" id="inventorySpecies"><summary><span>Behemoth</span><span class="filter-active-count">(0)</span></summary><div class="filter-options"></div></details>
    <button class="menu-button" id="inventoryClear">Clear filters</button></aside>
    <div class="inventory-content"><section class="inventory-items" aria-label="Material stacks"><p id="inventorySummary" aria-live="polite"></p><div class="inventory-grid" id="inventoryStacks"></div></section>
    <footer id="extractionControls" hidden aria-label="Extraction selections"><h3>Selected parts</h3><div id="extractionSelections"></div>
    <div class="extraction-actions"><button class="menu-button" id="extractionClear">Clear selections</button><p id="extractionPreview" aria-live="polite"></p><button class="menu-button" id="extractConfirm">Confirm extraction</button></div><p id="extractionStatus" role="status"></p></footer></div></div>`;
  document.body.append(dialog);
  let mode = 'player';
  let selections = {};
  const cardUpdates = new Map();
  const selected = selector => [...dialog.querySelectorAll(`${selector} input:checked`)].map(input => input.value);
  function updateSelectionState() {
    for (const update of cardUpdates.values()) update();
    const total = extractionYield(state, selections);
    dialog.querySelector('#extractConfirm').disabled = !total;
    dialog.querySelector('#extractionClear').disabled = !Object.keys(selections).length;
    dialog.querySelector('#extractionPreview').textContent = `Total aether-dust: ${total}`;
  }
  function renderSelections() {
    const list = dialog.querySelector('#extractionSelections'); list.replaceChildren();
    for (const [id, quantity] of Object.entries(selections)) {
      const row = document.createElement('div'); row.className = 'extraction-selection'; row.dataset.materialId = id;
      const name = document.createElement('span'); name.textContent = MATERIALS[id].name;
      const label = document.createElement('label'); label.append(document.createTextNode('Quantity'));
      const input = document.createElement('input'); input.type = 'number'; input.min = 1; input.max = state.player[id]; input.step = 1; input.value = quantity;
      input.addEventListener('input', () => {
        const value = Number(input.value);
        selections[id] = value;
        input.setCustomValidity(Number.isSafeInteger(value) && value > 0 && value <= state.player[id] ? '' : 'Select an owned material and a valid quantity.');
        updateSelectionState();
      });
      label.append(input);
      const remove = document.createElement('button'); remove.className = 'menu-button'; remove.textContent = 'Remove';
      remove.addEventListener('click', () => { delete selections[id]; renderSelections(); });
      row.append(name, label, remove); list.append(row);
    }
    if (!Object.keys(selections).length) { const empty = document.createElement('p'); empty.textContent = 'No parts selected.'; list.append(empty); }
    updateSelectionState();
  }
  dialog.querySelector('#extractionClear').addEventListener('click', () => { selections = {}; renderSelections(); });
  dialog.querySelector('#extractConfirm').addEventListener('click', () => {
    if (!extractSelectedParts(state, selections)) { updateSelectionState(); return; }
    const saved = onExtract(); selections = {}; render();
    dialog.querySelector('#extractionStatus').textContent = saved === false ? 'Extraction complete. Browser storage is unavailable; progress remains in memory.' : 'Extraction complete.';
  });
  function addFilters(selector, entries) {
    const options = dialog.querySelector(`${selector} .filter-options`);
    for (const [id, text] of entries) {
      const label = document.createElement('label'); const input = document.createElement('input');
      input.type = 'checkbox'; input.value = id; label.append(input, document.createTextNode(text)); options.append(label);
      input.addEventListener('change', render);
    }
  }
  addFilters('#inventoryTypes', Object.entries(PART_TYPES));
  addFilters('#inventorySpecies', Object.entries(MATERIAL_SPECIES).map(([id, value]) => [id, value.name]));
  function render() {
    for (const selector of ['#inventoryTypes', '#inventorySpecies']) {
      dialog.querySelector(`${selector} .filter-active-count`).textContent = `(${selected(selector).length})`;
    }
    const stacks = state[mode === 'extract' ? 'player' : mode];
    const all = filterStacks(stacks);
    const items = filterStacks(stacks, selected('#inventoryTypes'), selected('#inventorySpecies'));
    dialog.classList.toggle('extractor-mode', mode === 'extract');
    dialog.querySelector('#inventoryTitle').textContent = mode === 'extract' ? 'Extractor' : mode === 'loot' ? 'Hunting Loot' : 'Inventory';
    dialog.querySelector('#inventoryDescription').textContent = mode === 'loot'
      ? 'Materials harvested from defeated Behemoths. Added to your inventory when you return to safety.'
      : mode === 'extract' ? 'Hover, focus, or tap a part to add quantities. Review your selections below before confirming extraction.' : 'Materials stored safely in your inventory.';
    dialog.querySelector('#aetherDustBalance').textContent = `Aether-dust: ${state.aetherDust}`;
    dialog.querySelector('#extractionControls').hidden = mode !== 'extract';
    dialog.querySelector('#inventorySummary').textContent = `${items.length} / ${all.length} stacks`;
    const grid = dialog.querySelector('#inventoryStacks'); grid.replaceChildren(); cardUpdates.clear();
    for (const item of items) {
      const card = document.createElement('article'); card.className = `material-stack ${item.rarity}`; card.dataset.materialId = item.id;
      const name = document.createElement('h3'); name.textContent = item.name;
      const type = document.createElement('p'); type.textContent = PART_TYPES[item.type];
      const count = document.createElement('strong'); count.textContent = `\u00d7 ${item.count}`;
      const rarity = document.createElement('p'); rarity.textContent = RARITIES[item.rarity].name;
      card.append(name, type, rarity, count);
      if (mode === 'extract') {
        card.tabIndex = 0;
        const actions = document.createElement('div'); actions.className = 'material-increments';
        const buttons = [1, 10, 100].map(amount => {
          const button = document.createElement('button'); button.className = 'menu-button'; button.textContent = `+${amount}`; button.dataset.increment = amount;
          button.addEventListener('click', event => {
            event.stopPropagation();
            const current = Number.isSafeInteger(selections[item.id]) && selections[item.id] > 0 ? selections[item.id] : 0;
            if (amount > item.count - current) return;
            selections[item.id] = current + amount;
            dialog.querySelector('#extractionStatus').textContent = '';
            renderSelections();
            if (button.hidden) card.focus();
          });
          actions.append(button); return [amount, button];
        });
        card.addEventListener('click', () => { card.classList.toggle('increments-open'); });
        cardUpdates.set(item.id, () => {
          const quantity = Number.isSafeInteger(selections[item.id]) && selections[item.id] > 0 ? selections[item.id] : 0;
          card.classList.toggle('has-selection', quantity > 0);
          for (const [amount, button] of buttons) button.hidden = amount > item.count - quantity;
        });
        card.append(actions);
      }
      grid.append(card);
    }
    if (!items.length) { const empty = document.createElement('p'); empty.textContent = all.length ? 'No materials match these filters.' : 'No materials collected yet.'; grid.append(empty); }
    renderSelections();
  }
  dialog.querySelector('#inventoryClear').addEventListener('click', () => {
    for (const input of dialog.querySelectorAll('input[type="checkbox"]')) input.checked = false;
    render();
  });
  dialog.querySelector('#inventoryBack').addEventListener('click', onBack);
  dialog.addEventListener('cancel', event => { event.preventDefault(); onBack(); });
  return {
    get open() { return dialog.open; },
    show(nextMode) { mode = nextMode; selections = {}; dialog.querySelector('#extractionStatus').textContent = ''; render(); dialog.showModal(); dialog.querySelector('#inventoryBack').focus(); },
    close() { selections = {}; dialog.close(); },
  };
}
