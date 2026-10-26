import { CELL_RECIPES } from './content-tuning.js';
import { CELLS, CELL_TYPES, canCreateCell } from './cells.js';
import { configureMenuClose } from './menu-close.js';

export function createCellView({ inventory, area, onCreate, onBack, narrative }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'cellMenu'; dialog.className = 'inventory-menu';
  dialog.setAttribute('aria-labelledby', 'cellTitle');
  document.body.append(dialog);
  const text = source => narrative?.translate(source) ?? source;
  const node = (tag, source, parent) => { const n = document.createElement(tag); n.textContent = text(source); parent.append(n); return n; };
  const selectedTypes = new Set();
  const selectedRanks = new Set();
  const header = node('header', '', dialog); header.className = 'inventory-heading';
  const title = node('h2', 'Cell researcher', header); title.id = 'cellTitle';
  const back = node('button', 'Back', header); back.className = 'menu-button'; back.onclick = onBack;
  configureMenuClose(back);
  const balance = node('p', '', dialog); balance.className = 'cell-balance';
  const note = node('p', 'Crafted cells can be equipped through cell slots in the equipment menu.', dialog);
  const layout = node('div', '', dialog); layout.className = 'inventory-layout';
  const aside = node('aside', '', layout);
  const filters = node('details', '', aside); filters.className = 'inventory-filter-section'; filters.id = 'researcherCellTypes';
  const summary = node('summary', '', filters);
  const filterTitle = node('span', 'Cell type', summary);
  const activeCount = node('span', '(0)', summary); activeCount.className = 'filter-active-count';
  const options = node('div', '', filters); options.className = 'filter-options';
  const filterLabels = [];
  for (const [id, labelText] of Object.entries(CELL_TYPES)) {
    const label = node('label', '', options), input = document.createElement('input');
    input.type = 'checkbox'; input.value = id;
    const caption = document.createElement('span'); caption.textContent = text(labelText);
    label.append(input, caption); filterLabels.push([caption, labelText]);
    input.onchange = () => { if (input.checked) selectedTypes.add(id); else selectedTypes.delete(id); render(); };
  }
  const ranks = node('details', '', aside); ranks.className = 'inventory-filter-section'; ranks.id = 'researcherCellRanks';
  const rankSummary = node('summary', '', ranks);
  const rankTitle = node('span', 'Cell rank', rankSummary);
  const rankCount = node('span', '(0)', rankSummary); rankCount.className = 'filter-active-count';
  const rankOptions = node('div', '', ranks); rankOptions.className = 'filter-options';
  for (const rank of [1, 2, 3]) {
    const label = node('label', '', rankOptions), input = document.createElement('input');
    input.type = 'checkbox'; input.value = String(rank); label.append(input, document.createTextNode(`+${rank}`));
    input.onchange = () => { if (input.checked) selectedRanks.add(rank); else selectedRanks.delete(rank); render(); };
  }
  const clear = node('button', 'Clear filters', aside); clear.className = 'menu-button'; clear.id = 'researcherCellsClear';
  clear.onclick = () => { selectedTypes.clear(); selectedRanks.clear(); for (const input of aside.querySelectorAll('input')) input.checked = false; render(); };
  const content = node('div', '', layout); content.className = 'inventory-content';
  const list = node('div', '', content); list.className = 'cell-list'; list.id = 'researcherCells';
  function render() {
    title.textContent = text('Cell researcher'); configureMenuClose(back);
    filterTitle.textContent = text('Cell type'); clear.textContent = text('Clear filters');
    for (const [caption, source] of filterLabels) caption.textContent = text(source);
    note.textContent = text('Crafted cells can be equipped through cell slots in the equipment menu.');
    activeCount.textContent = `(${selectedTypes.size})`;
    rankTitle.textContent = text('Cell rank'); rankCount.textContent = `(${selectedRanks.size})`;
    balance.replaceChildren(); node('span', 'Aether-dust', balance); node('strong', String(inventory.aetherDust), balance);
    list.replaceChildren();
    for (const [id, definition] of Object.entries(CELLS).sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
      if (selectedTypes.size && !selectedTypes.has(definition.type)) continue;
      for (const rank of [1, 2, 3]) {
        if (selectedRanks.size && !selectedRanks.has(rank)) continue;
        const row = node('article', '', list); row.className = 'cell-row'; row.dataset.cellId = id;
        row.dataset.cellType = definition.type; row.dataset.cellRank = String(rank);
        const details = node('div', '', row); details.className = 'cell-row-details';
        const name = node('h3', '', details); node('span', definition.name, name); node('span', ` +${rank}`, name);
        node('p', CELL_TYPES[definition.type], details); node('p', definition.description, details);
        const actions = node('div', '', row); actions.className = 'cell-row-actions';
        const count = node('p', 'Owned', actions); node('strong', String(inventory.cells[`${id}:${rank}`] || 0), count);
        const cost = node('p', 'Aether-dust', actions); node('strong', String(CELL_RECIPES[rank].dust), cost);
        if (rank > 1) { const input = node('p', 'Required identical cells', actions); node('strong', `${CELL_RECIPES[rank].inputs} \u00d7 +${rank - 1}`, input); }
        const button = node('button', rank === 1 ? 'Craft cell' : 'Upgrade cell', actions);
        button.className = 'menu-button'; button.dataset.rank = rank;
        button.disabled = !canCreateCell(inventory, id, rank, area());
        button.onclick = () => {
          const scrollTop = list.scrollTop;
          if (onCreate(id, rank)) {
            render();
            dialog.querySelector(`[data-cell-id="${id}"][data-cell-rank="${rank}"] button`).focus({ preventScroll: true });
            list.scrollTop = scrollTop;
          }
        };
      }
    }
    if (!list.children.length) node('p', 'No cells match these filters.', list);
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); onBack(); });
  narrative?.onLanguageChange(() => { if (dialog.open) render(); });
  return { show() { filters.open = false; ranks.open = false; render(); dialog.showModal(); back.focus(); }, close() { dialog.close(); }, get open() { return dialog.open; } };
}
