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
export function createEquipmentView({ inventory, area, onEquip, onCraft, onBack }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'equipmentMenu'; dialog.className = 'inventory-menu equipment-menu';
  dialog.setAttribute('aria-labelledby', 'equipmentTitle');
  dialog.innerHTML = `<header class="inventory-heading"><h2 id="equipmentTitle">Equipment</h2><button class="menu-button" id="equipmentBack">Back</button></header>
    <p id="equipmentDescription"></p><div class="equipment-layout">
    <section class="equipment-sidebar"><nav id="equipmentTabs" aria-label="Weapon type"></nav><div id="equipmentItems"></div></section>
    <section class="equipment-preview"><div id="equipmentModel"></div><div id="equipmentDetails"></div></section>
    <section class="equipment-summary" id="equipmentSummary"></section></div>
    <footer class="equipment-footer"><p id="equipmentBalance"></p><p id="equipmentStatus" role="status" aria-live="polite"></p></footer>`;
  document.body.append(dialog);
  let crafter = null, page = 'overview', type = 'striker-sword', selected = null, hold = null, animation = 0;
  let renderer, scene, camera, hunter, weaponRoot, previewWidth = 0, previewHeight = 0, lastPreviewFrame = 0;
  let previewYaw = -.3, drag = null;
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
    if (!crafter && page !== 'overview') { page = page === 'picker' ? 'detail' : 'overview'; selected = inventory.equipment.equipped; render(); }
    else onBack();
  }
  function beginHold(source) {
    if (hold || !dialog.open || !crafter || area() !== 'old-town' || !canCraft(inventory, selected, crafter)) return;
    const craft = q('equipmentCraft'), id = selected;
    hold = { source, id, start: performance.now(), frame: 0 };
    craft.dataset.holding = 'true';
    const tick = now => {
      if (!hold) return;
      if (!dialog.open || selected !== id || area() !== 'old-town' || !canCraft(inventory, id, crafter)) { cancelHold(); return; }
      const progress = Math.min(1, (now - hold.start) / HOLD_MS);
      craft.style.setProperty('--hold', `${progress * 100}%`);
      if (progress < 1) hold.frame = requestAnimationFrame(tick);
      else {
        cancelHold();
        const success = onCraft(id, crafter);
        render();
        q('equipmentStatus').textContent = success ? 'Weapon crafted. Select Equip to use it.' : 'Unable to craft this weapon.';
        q(success ? 'equipmentEquip' : 'equipmentCraft')?.focus();
      }
    };
    hold.frame = requestAnimationFrame(tick);
  }
  function equip(id) {
    if (!canChangeEquipment(area())) return;
    if (onEquip(id) === false) return;
    selected = id;
    if (!crafter) page = 'detail';
    render();
    q('equipmentChange')?.focus();
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
    hunter.root.visible = !crafter; weaponRoot.visible = !!crafter;
    const definition = WEAPONS[item?.type];
    const state = definition?.createState();
    if (state) state.sheathed = false;
    // The same presentation function owns combat and menu weapon poses.
    updatePlayerView(hunter, createPlayerState([0, 0, 0]), definition ? { definition, state } : null, 0);
    // Reuse the existing weapon meshes; crafted variants intentionally share starter visuals.
    weaponRoot.clear();
    const meshes = item?.type === 'striker-sword' ? [hunter.sword] : item?.type === 'repeaters' ? hunter.pistols : item ? hunter.chainblades : [];
    meshes.forEach((mesh, i) => { const copy = mesh.clone(); copy.visible = true; copy.position.set(i ? .4 : -.2, 0, 0); copy.rotation.set(0, 0, item.type === 'chainblades' ? -.3 : 0); weaponRoot.add(copy); });
    camera.position.set(0, crafter ? .5 : 1, crafter ? -4.4 : -4.7); camera.lookAt(0, crafter ? .35 : .9, 0);
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
    const state = inventory.equipment, item = EQUIPMENT[selected], current = EQUIPMENT[state.equipped];
    const details = q('equipmentDetails'); details.replaceChildren();
    if (item) details.append(element('p', item.species ? item.species === 'embermane' ? 'Embermane' : 'Quillshot' : 'Starter', 'equipment-origin'));
    details.append(element('h3', item?.name || 'Unarmed'));
    if (item) {
      details.append(element('p', `Damage: ${item.damage}`));
      const progress = state.owned[item.id];
      if (progress) details.append(element('p', `Tier: ${progress.tier} · Reforges: ${progress.reforges}`));
    }
    const summary = q('equipmentSummary'); summary.replaceChildren();
    summary.append(element('h3', crafter || page === 'picker' ? 'Damage comparison' : 'Equipped'));
    summary.append(element('p', current?.name || 'Unarmed'), element('p', `Damage: ${current?.damage || 0}`, 'equipment-current-damage'));
    if (item && (crafter || page === 'picker')) {
      const delta = item.damage - (current?.damage || 0);
      summary.append(element('p', item.name), element('p', `${item.damage} (${delta > 0 ? '+' : ''}${delta})`, delta >= 0 ? 'requirement-met' : 'requirement-missing'));
    }
    if (crafter && item) {
      const owned = !!state.owned[item.id], recipe = RECIPES[item.id];
      summary.append(element('h3', owned ? 'Owned' : 'Crafting requirements'));
      if (owned) summary.append(element('p', 'Tier upgrades and reforging are not available yet.'));
      else {
        const requirement = (name, count, required) => {
          const row = element('p', '', `equipment-requirement ${count >= required ? 'requirement-met' : 'requirement-missing'}`);
          row.append(element('span', name), element('strong', `${count} / ${required}`)); summary.append(row);
        };
        requirement('Currency', inventory.currency, recipe.currency);
        for (const [id, count] of Object.entries(recipe.materials)) requirement(MATERIALS[id].name, inventory.player[id] || 0, count);
        const craft = button('Hold E or click to craft', () => {} , 'equipment-hold'); craft.id = 'equipmentCraft';
        craft.disabled = area() !== 'old-town' || !canCraft(inventory, item.id, crafter);
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
    } else if (page === 'detail' && canChangeEquipment(area())) {
      const change = button('Change Weapon', () => { page = 'picker'; selected = state.equipped; render(); }); change.id = 'equipmentChange'; summary.append(change);
      if (state.equipped) summary.append(button('Unequip', () => equip(null)));
    }
    updatePreview(item);
  }
  function render() {
    cancelHold();
    const state = inventory.equipment, editable = canChangeEquipment(area());
    dialog.dataset.page = crafter ? 'craft' : page;
    q('equipmentTitle').textContent = crafter === 'smith' ? 'Weapon smith' : crafter === 'repeaters' ? 'Repeaters master' : 'Equipment';
    q('equipmentDescription').textContent = crafter ? 'Craft one of each weapon. Owned weapons are reserved for future tier upgrades and reforging.' : editable ? 'Select an owned weapon to equip, or unequip your current weapon.' : 'Equipment can only be reviewed in combat areas.';
    q('equipmentBalance').textContent = `Currency: ${inventory.currency}`;
    const tabs = q('equipmentTabs'); tabs.replaceChildren();
    const browse = !!crafter || page === 'picker'; tabs.hidden = !browse;
    if (browse) for (const [id, name] of Object.entries(TYPES)) {
      if (crafter && (crafter === 'repeaters') !== (id === 'repeaters')) continue;
      const tab = button(name, () => { type = id; selected = candidates()[0]?.id || null; render(); }, type === id ? 'active' : '');
      tab.setAttribute('aria-pressed', String(type === id)); tabs.append(tab);
    }
    const list = q('equipmentItems'); list.replaceChildren();
    if (browse) for (const item of candidates()) {
      const row = element('article', '', `equipment-row ${selected === item.id ? 'selected' : ''}`); row.dataset.equipmentId = item.id;
      const label = button(item.name, () => crafter ? select(item.id) : equip(item.id)); label.setAttribute('aria-pressed', String(selected === item.id));
      label.addEventListener('pointerenter', () => { if (selected !== item.id) select(item.id); });
      label.addEventListener('focus', () => { if (selected !== item.id) select(item.id); });
      const mark = element('span', state.equipped === item.id ? '✓' : state.owned[item.id] ? '◆' : '+', 'equipment-marker'); mark.setAttribute('aria-hidden', 'true');
      label.prepend(mark); row.append(label, element('p', `Damage: ${item.damage}`), element('small', state.equipped === item.id ? 'Equipped' : state.owned[item.id] ? 'Owned' : 'Craft')); list.append(row);
    } else {
      const row = element('article', '', 'equipment-slot'); row.dataset.equipmentId = state.equipped || '';
      row.append(element('h3', 'Equipped'), element('p', EQUIPMENT[state.equipped]?.name || 'Unarmed'));
      const open = button('Weapon details', () => { page = 'detail'; selected = state.equipped; render(); }); row.append(open); list.append(row);
    }
    renderDetails();
    if (dialog.open && !dialog.contains(document.activeElement)) {
      (q('equipmentChange') || q('equipmentTabs').querySelector('button') || q('equipmentItems').querySelector('button') || q('equipmentBack')).focus();
    }
  }
  function candidates() {
    return Object.values(EQUIPMENT).filter(item => item.type === type && (crafter ? RECIPES[item.id]?.crafter === crafter : inventory.equipment.owned[item.id]));
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
    previewYaw = -.3; endDrag();
    crafter = service; page = 'overview'; type = service === 'repeaters' ? 'repeaters' : inventory.equipment.equipped ? EQUIPMENT[inventory.equipment.equipped].type : 'striker-sword';
    if (service === 'smith' && type === 'repeaters') type = 'striker-sword';
    selected = crafter ? candidates()[0]?.id || null : inventory.equipment.equipped;
    q('equipmentStatus').textContent = ''; render(); dialog.showModal(); q('equipmentBack').focus(); animate();
  } };
}
