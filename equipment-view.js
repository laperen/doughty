import { CHESTPLATE_TEXT, chestplateAbility } from './chestplate-abilities.js';
import { configureMenuClose } from './menu-close.js';
import { ARMOR, ARMOR_SLOTS, armorDefense, armorPieceDefense, armorUpgradeRecipe, canUpgradeArmor, canCraftArmor } from './armor.js';
import { CELLS, CELL_TYPES, embeddedCellLevel } from './cells.js';
import { cellFitsSlot, equipmentCellLevels, equipmentCellSlots } from './equipment-cells.js';
import { FAMILY_TEXT } from './weapon-family-abilities.js';
import { EQUIPMENT, RECIPES, canCraft, canChangeEquipment } from './equipment.js';
import { MATERIALS } from './inventory.js';
import * as THREE from 'three';
import { createPlayerView, updatePlayerView } from './player-view.js';
import { createPlayerState } from './player-movement.js';
import { STRIKER_SWORD } from './striker-weapon.js';
import { REPEATERS } from './repeaters-weapon.js';
import { CHAINBLADES } from './chainblades-weapon.js';

const TYPES = { 'striker-sword': 'Sword', chainblades: 'Chainblades', repeaters: 'Repeaters' };
const HOLD_MS = 900;
const WEAPONS = { 'striker-sword': STRIKER_SWORD, repeaters: REPEATERS, chainblades: CHAINBLADES };

/** NPC crafting and owned equipment share selection, but never implicitly equip on craft. */
export function createEquipmentView({ inventory, area, onEquip, onCraft, onEquipArmor, onCraftArmor, onUpgradeArmor, onEquipCell, onBack }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'equipmentMenu'; dialog.className = 'inventory-menu equipment-menu';
  dialog.setAttribute('aria-labelledby', 'equipmentTitle');
  dialog.innerHTML = `<header class="inventory-heading"><h2 id="equipmentTitle">Equipment</h2><button class="menu-button" id="equipmentBack">Back</button></header>
    <p id="equipmentDescription"></p><div class="equipment-layout">
    <section class="equipment-sidebar"><nav id="equipmentTabs" aria-label="Equipment category"></nav><div id="equipmentItems"></div></section>
    <section class="equipment-preview"><div id="equipmentModel"></div><div id="equipmentDetails"></div></section>
    <section class="equipment-summary" id="equipmentSummary"></section></div>
    <footer class="equipment-footer"><p id="equipmentBalance"></p><p id="equipmentStatus" role="status" aria-live="polite"></p></footer>`;
  document.body.append(dialog);
  let cellTarget = null;
  let crafter = null, page = 'overview', type = 'striker-sword', selected = null, hold = null, animation = 0;
  let renderer, scene, camera, hunter, weaponRoot, previewWidth = 0, previewHeight = 0, lastPreviewFrame = 0;
  let previewYaw = -.3, drag = null;
  const isArmor = () => Object.hasOwn(ARMOR_SLOTS, type);
  const catalog = () => isArmor() ? ARMOR : EQUIPMENT;
  const equipmentState = () => isArmor() ? { owned: inventory.armor.owned, equipped: inventory.armor.equipped[type] } : inventory.equipment;
  const craftable = id => isArmor()
    ? (inventory.armor.owned[id] ? canUpgradeArmor(inventory, id) : canCraftArmor(inventory, id))
    : canCraft(inventory, id, crafter);
  const q = id => dialog.querySelector(`#${id}`);
  const element = (tag, text, className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
  const button = (label, action, className = '') => {
    const node = element('button', label, `menu-button ${className}`); node.type = 'button';
    node.addEventListener('click', action); return node;
  };
  function cancelHold() {
    if (hold) cancelAnimationFrame(hold.frame);
    hold = null;
    const craft = q('equipmentCraft');
    if (craft) { craft.style.setProperty('--hold', '0%'); craft.removeAttribute('data-holding'); }
  }
  function endDrag() {
    if (drag && q('equipmentModel').hasPointerCapture(drag.id)) q('equipmentModel').releasePointerCapture(drag.id);
    drag = null; q('equipmentModel').classList.remove('dragging');
  }
  q('equipmentModel').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); drag = { id: event.pointerId, x: event.clientX };
    q('equipmentModel').setPointerCapture(event.pointerId); q('equipmentModel').classList.add('dragging');
  });
  q('equipmentModel').addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    previewYaw += (event.clientX - drag.x) * .01; drag.x = event.clientX;
    if (hunter) hunter.root.rotation.y = previewYaw;
    if (weaponRoot) weaponRoot.rotation.y = previewYaw;
  });
  q('equipmentModel').addEventListener('pointerup', endDrag);
  q('equipmentModel').addEventListener('pointercancel', endDrag);
  q('equipmentModel').addEventListener('lostpointercapture', () => { drag = null; q('equipmentModel').classList.remove('dragging'); });
  function back() {
    cancelHold();
    if (!crafter && page !== 'overview') { page = 'overview'; type = EQUIPMENT[inventory.equipment.equipped]?.type || 'striker-sword'; selected = equipmentState().equipped; render(); }
    else onBack();
  }
  function beginHold(source) {
    if (hold || !dialog.open || !crafter || area() !== 'old-town' || !craftable(selected)) return;
    const craft = q('equipmentCraft'), id = selected, upgrading = isArmor() && !!inventory.armor.owned[id];
    hold = { source, id, start: performance.now(), frame: 0 };
    craft.dataset.holding = 'true';
    const tick = now => {
      if (!hold) return;
      if (!dialog.open || selected !== id || area() !== 'old-town' || !craftable(id)) { cancelHold(); return; }
      const progress = Math.min(1, (now - hold.start) / HOLD_MS);
      craft.style.setProperty('--hold', `${progress * 100}%`);
      if (progress < 1) hold.frame = requestAnimationFrame(tick);
      else {
        cancelHold();
        const success = isArmor() ? upgrading ? onUpgradeArmor(id) : onCraftArmor(id) : onCraft(id, crafter);
        render();
        q('equipmentStatus').textContent = success ? (upgrading ? 'Armor upgraded.' : isArmor() ? 'Armor crafted. Select Equip to use it.' : 'Weapon crafted. Select Equip to use it.') : (upgrading ? 'Unable to upgrade this armor.' : isArmor() ? 'Unable to craft this armor.' : 'Unable to craft this weapon.');
        q(success ? 'equipmentEquip' : 'equipmentCraft')?.focus();
      }
    };
    hold.frame = requestAnimationFrame(tick);
  }
  function equip(id) {
    if (!canChangeEquipment(area())) return;
    if ((isArmor() ? onEquipArmor(id, type) : onEquip(id)) === false) return;
    selected = id;
    if (!crafter) {
      page = 'overview';
      type = EQUIPMENT[inventory.equipment.equipped]?.type || 'striker-sword';
      selected = inventory.equipment.equipped;
    }
    render();
    if (!crafter) q('equipmentItems').querySelector('button')?.focus();
  }
  function select(id) {
    cancelHold(); selected = id;
    // Keep list focus intact while updating the preview and comparison.
    for (const row of q('equipmentItems').children) {
      row.classList.toggle('selected', row.dataset.equipmentId === selected);
      row.querySelector('button')?.setAttribute('aria-pressed', String(row.dataset.equipmentId === selected));
    }
    renderDetails();
    if (dialog.open && !dialog.contains(document.activeElement)) {
      (q('equipmentChange') || q('equipmentTabs').querySelector('button') || q('equipmentItems').querySelector('button') || q('equipmentBack')).focus();
    }
  }
  function initializePreview() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.setAttribute('aria-hidden', 'true'); q('equipmentModel').append(renderer.domElement);
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(35, 1, .1, 30);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x24334b, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(3, 4, -3); scene.add(light);
    hunter = createPlayerView(); scene.add(hunter.root);
    weaponRoot = new THREE.Group(); scene.add(weaponRoot);
  }
  function updatePreview(item) {
    initializePreview();
    hunter.root.visible = !crafter || isArmor(); weaponRoot.visible = !!crafter && !isArmor();
    const definition = WEAPONS[item?.type];
    const state = definition?.createState();
    if (state) state.sheathed = false;
    // The same presentation function owns combat and menu weapon poses.
    updatePlayerView(hunter, createPlayerState([0, 0, 0]), definition ? { definition, state } : null, 0);
    // Reuse the existing weapon meshes; crafted variants intentionally share starter visuals.
    weaponRoot.clear();
    const meshes = item?.type === 'striker-sword' ? [hunter.sword] : item?.type === 'repeaters' ? hunter.pistols : item && !isArmor() ? hunter.chainblades : [];
    meshes.forEach((mesh, i) => { const copy = mesh.clone(); copy.visible = true; copy.position.set(i ? .4 : -.2, 0, 0); copy.rotation.set(0, 0, item.type === 'chainblades' ? -.3 : 0); weaponRoot.add(copy); });
    camera.position.set(0, crafter && !isArmor() ? .5 : 1, crafter && !isArmor() ? -4.4 : -4.7); camera.lookAt(0, crafter && !isArmor() ? .35 : .9, 0);
    hunter.root.rotation.y = previewYaw; weaponRoot.rotation.y = previewYaw;
  }
  function animate() {
    if (!dialog.open) return;
    const box = q('equipmentModel').getBoundingClientRect();
    if (renderer && box.width && box.height && performance.now() - lastPreviewFrame >= 33) {
      if (previewWidth !== box.width || previewHeight !== box.height) {
        renderer.setSize(box.width, box.height, false); camera.aspect = box.width / box.height; camera.updateProjectionMatrix();
        previewWidth = box.width; previewHeight = box.height;
      }
      lastPreviewFrame = performance.now();
      renderer.render(scene, camera);
    }
    animation = requestAnimationFrame(animate);
  }
  function renderDetails() {
    const state = equipmentState(), item = catalog()[selected], current = catalog()[state.equipped];
    const details = q('equipmentDetails'); details.replaceChildren();
    if (item) details.append(element('p', item.species ? item.species === 'embermane' ? 'Embermane' : 'Quillshot' : 'Starter', 'equipment-origin'));
    details.append(element('h3', item?.name || (isArmor() ? 'No armor equipped' : 'Unarmed')));
    if (item) {
      details.append(element('p', isArmor() ? `Defense: ${armorPieceDefense(item, state.owned[item.id])}` : `Damage: ${item.damage}`));
      const progress = state.owned[item.id];
      if (item.species && !isArmor()) {
        details.append(element('p', FAMILY_TEXT[item.species]));
        details.append(element('p', FAMILY_TEXT[`${item.species}Description`]));
      }
      if (isArmor() && item.type === 'chestplate') {
        details.append(element('p', CHESTPLATE_TEXT[item.species]), element('p', CHESTPLATE_TEXT[`${item.species}Description`]));
      }
      if (item.embeddedCell) {
        const perk = element('p', CELLS[item.embeddedCell].name);
        perk.append(element('strong', ` +${embeddedCellLevel(progress)}`)); details.append(perk);
        details.append(element('p', CELLS[item.embeddedCell].description));
      }
      if (progress) details.append(element('p', `Tier: ${progress.tier} · Reforges: ${progress.reforges}`));
      details.append(element('h4', 'Cell slots'));
      const slots = element('div', '', 'equipment-cell-slots');
      equipmentCellSlots(item, progress).forEach((category, index) => {
        const slot = element('p', '', 'equipment-cell-slot'); slot.dataset.slotIndex = String(index); slot.dataset.cellType = category;
        slot.append(element('span', String(index + 1) + '. '), element('span', category === 'prismatic' ? 'Prismatic' : CELL_TYPES[category]));
        slots.append(slot);
      });
      details.append(slots);
    }
    const summary = q('equipmentSummary'); summary.replaceChildren();
    if (crafter || page === 'picker') {
      summary.append(element('h3', isArmor() ? 'Defense comparison' : 'Damage comparison'));
      summary.append(element('p', current?.name || (isArmor() ? 'No armor equipped' : 'Unarmed')), element('p', isArmor() ? `Defense: ${armorPieceDefense(current, state.owned[current?.id])}` : `Damage: ${current?.damage || 0}`, 'equipment-current-damage'));
    } else {
      const weapon = EQUIPMENT[inventory.equipment.equipped];
      const chestplate = ARMOR[inventory.armor.equipped.chestplate];
      summary.append(element('h3', 'Summary'),
        element('p', `Damage: ${weapon?.damage || 0}`, 'equipment-current-damage'),
        element('p', `Defense: ${armorDefense(inventory.armor)}`));
      summary.append(element('h4', 'Abilities'));
      let abilities = 0;
      for (const [piece, wording] of [[weapon, FAMILY_TEXT], [chestplate, CHESTPLATE_TEXT]]) {
        if (!piece?.species || !wording[piece.species]) continue;
        summary.append(element('strong', wording[piece.species]), element('p', wording[`${piece.species}Description`]));
        abilities++;
      }
      if (!abilities) summary.append(element('p', 'No abilities active.'));
      summary.append(element('h4', 'Cells'));
      const levels = equipmentCellLevels(inventory);
      for (const [id, level] of Object.entries(levels)) {
        const row = element('p', CELLS[id].name);
        row.dataset.cellId = id; row.dataset.cellLevel = String(level);
        row.append(element('strong', ` +${level}`));
        addCellDescription(row, id); summary.append(row);
      }
      if (!Object.keys(levels).length) summary.append(element('p', 'No cells active.'));
    }
    if (item && (crafter || page === 'picker')) {
      const value = isArmor() ? armorPieceDefense(item, state.owned[item.id]) : item.damage;
      const delta = value - (isArmor() ? armorPieceDefense(current, state.owned[current?.id]) : current?.damage || 0);
      summary.append(element('p', item.name), element('p', `${value} (${delta > 0 ? '+' : ''}${delta})`, delta >= 0 ? 'requirement-met' : 'requirement-missing'));
    }
    if (crafter && item) {
      const owned = !!state.owned[item.id], upgrading = isArmor() && owned;
      const recipe = isArmor() ? upgrading ? armorUpgradeRecipe(inventory, item.id) : item : RECIPES[item.id];
      if (upgrading && recipe) {
        const progress = state.owned[item.id], next = { ...progress, tier: recipe.tier };
        summary.append(element('h3', 'Upgrade preview'),
          element('p', 'Tier: ' + progress.tier + ' \u2192 ' + next.tier),
          element('p', 'Defense: ' + armorPieceDefense(item, progress) + ' \u2192 ' + armorPieceDefense(item, next)),
          element('p', 'Embedded cell: +' + embeddedCellLevel(progress) + ' \u2192 +' + embeddedCellLevel(next)));
        if (item.type === 'chestplate') {
          const before = chestplateAbility(item, progress), after = chestplateAbility(item, next);
          summary.append(element('p', item.species === 'embermane'
            ? 'Attack speed: ' + before.percent + '% \u2192 ' + after.percent + '%'
            : 'Quills: ' + before.quills + ' \u2192 ' + after.quills));
        }
      }
      summary.append(element('h3', upgrading && recipe ? 'Upgrade requirements' : owned ? 'Owned' : 'Crafting requirements'));
      if (owned && (!isArmor() || !recipe)) summary.append(element('p', isArmor() ? 'Maximum armor tier reached.' : 'Tier upgrades and reforging are not available yet.'));
      else {
        const requirement = (name, count, required) => {
          const row = element('p', '', `equipment-requirement ${count >= required ? 'requirement-met' : 'requirement-missing'}`);
          row.append(element('span', name), element('strong', `${count} / ${required}`)); summary.append(row);
        };
        requirement('Currency', inventory.currency, recipe.currency);
        for (const [id, count] of Object.entries(recipe.materials)) requirement(MATERIALS[id].name, inventory.player[id] || 0, count);
        const craft = button(upgrading ? 'Hold E or click to upgrade' : 'Hold E or click to craft', () => {} , 'equipment-hold'); craft.id = 'equipmentCraft';
        craft.disabled = area() !== 'old-town' || !craftable(item.id);
        craft.addEventListener('pointerdown', event => {
          if (event.button !== 0) return; event.preventDefault(); craft.focus(); beginHold('pointer');
        });
        craft.addEventListener('pointerleave', () => { if (hold?.source === 'pointer') cancelHold(); });
        craft.addEventListener('pointercancel', cancelHold); summary.append(craft);
      }
      if (owned && canChangeEquipment(area())) {
        const equipButton = button(state.equipped === item.id ? 'Equipped' : 'Equip', () => equip(item.id));
        equipButton.id = 'equipmentEquip'; equipButton.disabled = state.equipped === item.id; summary.append(equipButton);
      }
    }
    updatePreview(item);
  }
  function addCellDescription(row, id) {
    row.append(element('span', CELLS[id].description, 'equipment-cell-description'));
  }
  function appendCellSlots(parent, item) {
    if (!item) return;
    const progress = (EQUIPMENT[item.id] ? inventory.equipment : inventory.armor).owned[item.id];
    parent.append(element('h4', 'Cell slots'));
    equipmentCellSlots(item, progress).forEach((category, index) => {
      const key = inventory.cellSockets?.[item.id]?.[index];
      const slot = button('', () => {
        cellTarget = { item, index }; page = 'cells'; selected = item.id; render();
      }, 'equipment-cell-slot');
      slot.dataset.slotIndex = String(index); slot.dataset.cellItem = item.id;
      slot.append(element('span', `${index + 1}. `), element('span', category === 'prismatic' ? 'Prismatic' : CELL_TYPES[category]),
        element('span', ' ? '), element('span', key ? CELLS[key.split(':')[0]].name : 'Empty cell slot'));
      if (key) slot.append(element('strong', ` +${key.split(':')[1]}`));
      parent.append(slot);
    });
  }
  function renderCellPicker() {
    const { item, index } = cellTarget;
    const editable = canChangeEquipment(area());
    q('equipmentTitle').textContent = 'Select cell';
    q('equipmentDescription').textContent = editable ? 'Select a cell for this slot.' : 'Equipment can only be reviewed in combat areas.';
    q('equipmentTabs').hidden = true;
    const list = q('equipmentItems'); list.replaceChildren();
    const current = inventory.cellSockets?.[item.id]?.[index] ?? null;
    const commit = key => {
      if (!editable || onEquipCell(item.id, index, key) === false) return;
      back();
    };
    const remove = button('Unequip', () => commit(null)); remove.disabled = !editable || !current; list.append(remove);
    let count = 0;
    for (const key of new Set([...Object.keys(inventory.cells), ...(current ? [current] : [])])) {
      if (!cellFitsSlot(inventory, item.id, index, key)) continue;
      const [id, rank] = key.split(':');
      const row = element('article', '', 'equipment-row'); row.dataset.cellKey = key;
      const choose = button('', () => commit(key)); choose.disabled = !editable;
      choose.append(element('span', CELLS[id].name), element('strong', ` +${rank}`));
      row.append(choose, element('p', CELLS[id].description), element('span', key === current ? 'Equipped' : 'Owned'), element('strong', ` ${inventory.cells[key] ?? 0}`));
      list.append(row); count++;
    }
    if (!count) list.append(element('p', 'No compatible cells available.'));
    q('equipmentDetails').replaceChildren(element('h3', item.name));
    appendCellSlots(q('equipmentDetails'), item);
    q('equipmentSummary').replaceChildren(element('h3', 'Cells'));
    for (const [id, level] of Object.entries(equipmentCellLevels(inventory))) {
      const row = element('p', CELLS[id].name); row.append(element('strong', ` +${level}`)); addCellDescription(row, id); q('equipmentSummary').append(row);
    }
    updatePreview(item);
    q('equipmentBack').focus();
  }
  function render() {
    cancelHold();
    if (page === 'cells') { dialog.dataset.page = 'cells'; renderCellPicker(); return; }
    const state = equipmentState(), editable = canChangeEquipment(area());
    dialog.dataset.page = crafter ? 'craft' : page;
    q('equipmentTitle').textContent = crafter === 'armorer' ? 'Armorer' : crafter === 'smith' ? 'Weapon smith' : crafter === 'repeaters' ? 'Repeaters master' : 'Equipment';
    q('equipmentDescription').textContent = crafter === 'armorer' ? 'Craft armor or upgrade owned pieces to tier 4.' : crafter ? 'Craft one of each weapon. Owned weapons are reserved for future tier upgrades and reforging.' : editable ? 'Select equipment to inspect, equip, or unequip.' : 'Equipment can only be reviewed in combat areas.';
    q('equipmentBalance').textContent = `Currency: ${inventory.currency}`;
    const tabs = q('equipmentTabs'); tabs.replaceChildren();
    const browse = !!crafter || page === 'picker';
    const showTabs = browse && (!!crafter || !isArmor());
    tabs.hidden = !showTabs;
    if (showTabs) for (const [id, name] of Object.entries(crafter === 'armorer' ? ARMOR_SLOTS : TYPES)) {
      if (crafter && crafter !== 'armorer' && (crafter === 'repeaters') !== (id === 'repeaters')) continue;
      const tab = button(name, () => { type = id; selected = candidates()[0]?.id || null; render(); }, type === id ? 'active' : '');
      tab.setAttribute('aria-pressed', String(type === id)); tabs.append(tab);
    }
    const list = q('equipmentItems'); list.replaceChildren();
    if (page === 'picker' && !crafter && editable) {
      const row = element('article', '', 'equipment-row'); row.dataset.equipmentId = '';
      const unequip = button('Unequip', () => equip(null));
      unequip.addEventListener('pointerenter', () => select(null));
      unequip.addEventListener('focus', () => select(null));
      row.append(unequip); list.append(row);
    }
    if (browse) for (const item of candidates()) {
      const row = element('article', '', `equipment-row ${selected === item.id ? 'selected' : ''}`); row.dataset.equipmentId = item.id;
      const label = button(item.name, () => crafter ? select(item.id) : equip(item.id)); label.setAttribute('aria-pressed', String(selected === item.id));
      label.addEventListener('pointerenter', () => { if (selected !== item.id) select(item.id); });
      label.addEventListener('focus', () => { if (selected !== item.id) select(item.id); });
      const mark = element('span', state.equipped === item.id ? '✓' : state.owned[item.id] ? '◆' : '+', 'equipment-marker'); mark.setAttribute('aria-hidden', 'true');
      label.prepend(mark); row.append(label, element('p', isArmor() ? `Defense: ${armorPieceDefense(item, state.owned[item.id])}` : `Damage: ${item.damage}`), element('small', state.equipped === item.id ? 'Equipped' : state.owned[item.id] ? 'Owned' : 'Craft')); list.append(row);
    } else {
      const row = element('article', '', 'equipment-slot'); row.dataset.equipmentId = state.equipped || '';
      row.append(element('h3', isArmor() ? 'Equipped' : 'Weapon'), element('p', catalog()[state.equipped]?.name || (isArmor() ? 'No armor equipped' : 'Unarmed')));
      const open = button(isArmor() ? 'Armor details' : 'Weapon details', () => { page = editable ? 'picker' : 'detail'; selected = state.equipped; render(); }); row.append(open); appendCellSlots(row, catalog()[state.equipped]); list.append(row);
      if (page === 'overview') {
        list.append(element('p', `Total defense: ${armorDefense(inventory.armor)}`));
        for (const [slot, label] of Object.entries(ARMOR_SLOTS)) {
          const armorRow = element('article', '', 'equipment-slot'); armorRow.dataset.armorSlot = slot;
          armorRow.append(element('h3', label), element('p', ARMOR[inventory.armor.equipped[slot]]?.name || 'No armor equipped'),
            button('Armor details', () => { type = slot; page = editable ? 'picker' : 'detail'; selected = equipmentState().equipped; render(); }));
          appendCellSlots(armorRow, ARMOR[inventory.armor.equipped[slot]]);
          list.append(armorRow);
        }
      }
    }
    renderDetails();
    if (dialog.open && !dialog.contains(document.activeElement)) {
      (q('equipmentChange') || q('equipmentTabs').querySelector('button') || q('equipmentItems').querySelector('button') || q('equipmentBack')).focus();
    }
  }
  function candidates() {
    return Object.values(catalog()).filter(item => item.type === type && (crafter ? isArmor() ? crafter === 'armorer' : RECIPES[item.id]?.crafter === crafter : equipmentState().owned[item.id]));
  }
  q('equipmentBack').addEventListener('click', back);
  dialog.addEventListener('cancel', event => { event.preventDefault(); back(); });
  // Consume menu shortcuts before the gameplay/window listeners see them.
  window.addEventListener('keydown', event => {
    if (!dialog.open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) back(); }
    if (event.key.toLowerCase() === 'e' && crafter) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) beginHold('keyboard'); }
  }, true);
  window.addEventListener('keyup', event => { if (event.key.toLowerCase() === 'e' && hold?.source === 'keyboard') cancelHold(); });
  window.addEventListener('pointerup', () => { if (hold?.source === 'pointer') cancelHold(); });
  window.addEventListener('blur', () => { cancelHold(); endDrag(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHold(); });
  dialog.addEventListener('close', () => { cancelHold(); endDrag(); cancelAnimationFrame(animation); });
  return { get open() { return dialog.open; }, back, close() { cancelHold(); cancelAnimationFrame(animation); dialog.close(); }, show(service = null) {
    cellTarget = null; previewYaw = -.3; endDrag();
    crafter = service; configureMenuClose(q('equipmentBack'), !!service); page = 'overview'; type = service === 'armorer' ? 'helmet' : service === 'repeaters' ? 'repeaters' : inventory.equipment.equipped ? EQUIPMENT[inventory.equipment.equipped].type : 'striker-sword';
    if (service === 'smith' && type === 'repeaters') type = 'striker-sword';
    selected = crafter ? candidates()[0]?.id || null : inventory.equipment.equipped;
    q('equipmentStatus').textContent = ''; render(); dialog.showModal(); q('equipmentBack').focus(); animate();
  } };
}
