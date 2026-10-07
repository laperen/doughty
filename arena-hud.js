/** Shared arena presentation. Weapon definitions own their resource descriptors. */
export function createArenaHud(container) {
  const root = document.createElement('div');
  root.className = 'player-hud';
  root.setAttribute('aria-label', 'Player status');
  root.innerHTML = `<div class="hunter-emblem" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M33 5 39 9 22 32 17 28Z M12 26 25 36 M17 32 9 42"/></svg></div>
    <div class="player-vitals"><div class="vital health"><output></output><div class="vital-track" role="meter" aria-label="Health" aria-valuemin="0"><i></i></div></div>
    <div class="vital stamina"><output></output><div class="vital-track" role="meter" aria-label="Stamina" aria-valuemin="0"><i></i></div></div>
    <div class="weapon-resources"></div></div>`;
  container.append(root);
  const weaponLabel = document.createElement('div');
  weaponLabel.className = 'equipped-label';
  const weaponHint = document.createElement('div');
  weaponHint.className = 'weapon-hint';
  root.querySelector('.player-vitals').append(weaponLabel, weaponHint);
  const resources = root.querySelector('.weapon-resources');
  let resourceLayout = '';
  const setMeter = (node, value, max) => {
    value = Math.max(0, Math.min(max, value));
    node.setAttribute('aria-valuemax', max);
    node.setAttribute('aria-valuenow', value);
    node.firstElementChild.style.transform = `scaleX(${max > 0 ? value / max : 0})`;
  };
  return {
    update(player, equipment) {
      weaponLabel.textContent = equipment ? `${equipment.definition.name} / ${equipment.state.sheathed ? 'SHEATHED' : equipment.state.action?.type === 'reload' ? 'RELOADING' : 'DRAWN'}` : 'UNARMED';
      weaponHint.textContent = equipment?.definition.hudHint ?? '';
      root.querySelector('.hunter-emblem').style.display = equipment?.definition.kind === 'ranged' ? 'none' : '';
      for (const [name, value, max] of [['health', player.health, 100], ['stamina', player.stamina, 100]]) {
        const node = root.querySelector(`.vital.${name}`);
        node.querySelector('output').textContent = `${Math.ceil(value)} / ${max}`;
        setMeter(node.querySelector('[role=meter]'), value, max);
        node.classList.toggle('low', value <= max * .25);
      }
      root.classList.toggle('sheathed', Boolean(equipment?.state.sheathed));
      root.classList.toggle('unarmed', !equipment);
      root.classList.toggle('down', player.health <= 0);
      const items = equipment?.definition.getHudResources?.(equipment.state, player) ?? [];
      const layout = JSON.stringify(items.map(({ id, label, kind, glyph }) => ({ id, label, kind, glyph })));
      if (layout !== resourceLayout) {
        resourceLayout = layout;
        resources.replaceChildren(...items.map(item => {
          const node = document.createElement('div');
          node.className = `weapon-resource resource-${item.kind}`;
          node.title = item.label;
          node.setAttribute('aria-label', item.label);
          node.setAttribute('role', 'meter');
          node.setAttribute('aria-valuemin', 0);
          node.innerHTML = '<i></i><span></span>';
          node.lastElementChild.textContent = item.glyph ?? '';
          return node;
        }));
      }
      items.forEach((item, index) => {
        const node = resources.children[index];
        setMeter(node, item.value, item.max);
        node.lastElementChild.textContent = item.text ?? item.glyph ?? '';
        node.title = item.label + (item.text ? ': ' + item.text : '');
        node.classList.toggle('active', item.value > 0);
        node.setAttribute('aria-valuetext', item.description ?? `${item.value} / ${item.max}`);
      });
    },
  };
}
