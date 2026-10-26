import { CELL_TUNING, FAMILY_TUNING } from './content-tuning.js';
import { CHESTPLATE_TEXT, CHESTPLATE_TUNING } from './chestplate-abilities.js';
import { getStatModifierRemaining } from './stat-modifiers.js';
import { FAMILY_TEXT, QUILL_TUNING } from './weapon-family-abilities.js';
import { shieldAmount, shieldCapacity } from './resource-shields.js';
import { COMBAT_TEXT } from './combat-text.js';
/** Shared arena presentation. Weapon definitions own their resource descriptors. */
export function createArenaHud(container, text = entry => entry.value) {
  const root = document.createElement('div');
  root.className = 'player-hud';
  root.setAttribute('aria-label', 'Player status');
  root.innerHTML = `<div class="hunter-emblem" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M33 5 39 9 22 32 17 28Z M12 26 25 36 M17 32 9 42"/></svg></div>
    <div class="player-vitals"><div class="vital health"><output></output><div class="vital-track" role="meter" aria-label="Health" aria-valuemin="0"><i></i></div></div>
    <div class="vital stamina"><output></output><div class="vital-track" role="meter" aria-label="Stamina" aria-valuemin="0"><i></i></div></div>
    <div class="weapon-resources"></div></div>`;
  container.append(root);
  const shield = document.createElement('div');
  shield.className = 'vital health-shield';
  shield.innerHTML = '<output></output><div class="vital-track" role="meter" aria-label="Health shields" aria-valuemin="0"><i></i></div>';
  shield.hidden = true;
  root.querySelector('.player-vitals').prepend(shield);
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
      const shields = shieldAmount(player, 'health');
      shield.hidden = shields <= 0;
      shield.querySelector('output').textContent = String(Math.ceil(shields));
      setMeter(shield.querySelector('[role=meter]'), shields, Math.max(1, shieldCapacity(player, 'health')));
      for (const [name, value, max] of [['health', player.health, player.maxHealth ?? 100], ['stamina', player.stamina, player.maxStamina ?? 100]]) {
        const node = root.querySelector(`.vital.${name}`);
        node.querySelector('output').textContent = `${Math.ceil(value)} / ${max}`;
        setMeter(node.querySelector('[role=meter]'), value, max);
        node.classList.toggle('low', value <= max * .25);
      }
      root.classList.toggle('sheathed', Boolean(equipment?.state.sheathed));
      root.classList.toggle('unarmed', !equipment);
      root.classList.toggle('down', player.health <= 0);
      resources.style.gridTemplateColumns = `repeat(${equipment?.definition.resourceColumns ?? 3}, 1fr)`;
      const items = [...(equipment?.definition.getHudResources?.(equipment.state, player) ?? [])];
      if (player.burning) items.push({ id: 'burning', label: text(COMBAT_TEXT.burning), kind: 'burning',
        value: player.burning.remaining, max: 6, text: `${text(COMBAT_TEXT.burning)} ${Math.ceil(player.burning.remaining)}s` });
      const movement = player.statModifiers.find(m => m.source === 'embermane-movement');
      if (movement) items.push({ id: 'embermane-movement', label: FAMILY_TEXT.embermane, kind: 'status', value: movement.remaining, max: FAMILY_TUNING.embermane.duration, text: `+${movement.percent}% / ${Math.ceil(movement.remaining)}s` });
      if (equipment && player.familyAbility?.species === 'quillshot') items.push({ id: 'weapon-quills', label: FAMILY_TEXT.quillshot, kind: 'status', value: player.familyAbility.charge, max: QUILL_TUNING.chargeTime, text: `${player.familyAbility.count} / ${player.familyAbility.charge.toFixed(1)}s` });
      const chestplate = player.chestplateAbility;
      if (chestplate?.species === 'embermane') {
        const buff = getStatModifierRemaining(player.statModifiers, 'embermane-chestplate');
        items.push({ id: 'chestplate-active', label: CHESTPLATE_TEXT.embermane, kind: 'status',
          value: CHESTPLATE_TUNING.cooldown - chestplate.cooldown, max: CHESTPLATE_TUNING.cooldown,
          text: `V / ${chestplate.cooldown > 0 ? Math.ceil(chestplate.cooldown) + 's' : 'Ready'}` });
        if (buff > 0) items.push({ id: 'chestplate-haste', label: CHESTPLATE_TEXT.embermane, kind: 'status',
          value: buff, max: CHESTPLATE_TUNING.buffDuration, text: `+${chestplate.percent}% / ${Math.ceil(buff)}s` });
      }
      if (chestplate?.species === 'quillshot') items.push({ id: 'chestplate-active', label: CHESTPLATE_TEXT.quillshot, kind: 'status',
        value: chestplate.charge, max: CHESTPLATE_TUNING.chargeTime,
        text: `V / ${chestplate.charge >= CHESTPLATE_TUNING.chargeTime ? 'Ready' : Math.ceil(chestplate.charge) + ' / ' + CHESTPLATE_TUNING.chargeTime + 's'}` });
      const woundHaste = getStatModifierRemaining(player.statModifiers, 'wound-haste');
      if (woundHaste > 0) items.push({ id: 'wound-haste', label: 'Wound haste +15%', kind: 'status', glyph: '+15%', value: woundHaste, max: 20, text: `+15% / ${Math.ceil(woundHaste)}s` });
      const fury = player.statModifiers.find(m => m.source === 'evasive-fury');
      if (fury) items.push({ id: 'evasive-fury', label: 'Evasive Fury', kind: 'status', value: fury.remaining, max: CELL_TUNING['evasive-fury'].duration, text: `+${fury.percent}% / ${Math.ceil(fury.remaining)}s` });
      const frenzy = player.statModifiers.find(m => m.source === 'wild-frenzy');
      if (frenzy) items.push({ id: 'wild-frenzy', label: 'Wild Frenzy', kind: 'status', value: frenzy.remaining, max: CELL_TUNING['wild-frenzy'].duration, text: `+${frenzy.percent}% / ${Math.ceil(frenzy.remaining)}s` });
      if (player.cellStatus?.id === 'recycle') items.push({ id: 'recycle', label: 'Recycle', kind: 'status', value: player.cellStatus.stacks, max: 5, text: `${player.cellStatus.stacks}/5 +${Number(player.cellStatus.bonus.toFixed(1))}%` });
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
