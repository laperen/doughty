import { CELLS, canCreateCell } from './cells.js';

export function createCellView({ inventory, area, onCreate, onBack, narrative }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'cellMenu'; dialog.className = 'inventory-menu';
  dialog.setAttribute('aria-labelledby', 'cellTitle');
  document.body.append(dialog);
  const text = source => narrative?.translate(source) ?? source;
  const node = (tag, source, parent) => { const n = document.createElement(tag); n.textContent = text(source); parent.append(n); return n; };
  function render() {
    dialog.replaceChildren();
    const header = node('header', '', dialog); header.className = 'inventory-heading';
    node('h2', 'Cell researcher', header).id = 'cellTitle';
    const back = node('button', 'Back', header); back.className = 'menu-button'; back.onclick = onBack;
    const balance = node('p', 'Aether-dust', dialog); balance.className = 'cell-balance'; node('strong', String(inventory.aetherDust), balance);
    node('p', 'Crafted cells are stored for future equipment slots. Embedded weapon effects work independently.', dialog);
    const list = node('div', '', dialog); list.className = 'cell-list';
    for (const [id, definition] of Object.entries(CELLS)) {
      const card = node('section', '', list); card.className = 'cell-card'; card.dataset.cellId = id;
      node('h3', definition.name, card); node('p', definition.description, card);
      for (const rank of [1, 2, 3]) {
        const row = node('div', '', card); row.className = 'cell-rank';
        node('span', `+${rank}`, row);
        const count = node('span', 'Owned', row); node('strong', String(inventory.cells[`${id}:${rank}`] || 0), count);
        const cost = node('span', 'Aether-dust', row); node('strong', String(rank === 3 ? 40 : 20), cost);
        if (rank > 1) { const input = node('span', 'Required identical cells', row); node('strong', `2 × +${rank - 1}`, input); }
        const button = node('button', rank === 1 ? 'Craft cell' : 'Upgrade cell', row);
        button.className = 'menu-button'; button.dataset.rank = rank;
        button.disabled = !canCreateCell(inventory, id, rank, area());
        button.onclick = () => { if (onCreate(id, rank)) { render(); dialog.querySelector(`[data-cell-id="${id}"] [data-rank="${rank}"]`).focus(); } };
      }
    }
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); onBack(); });
  narrative?.onLanguageChange(() => { if (dialog.open) render(); });
  return { show() { render(); dialog.showModal(); }, close() { dialog.close(); }, get open() { return dialog.open; } };
}
