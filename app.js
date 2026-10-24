import { OnlineConnection } from './online-connection.js';
import { OnlinePresentation, motionKey } from './online-presentation.js';
import { createOnlineMenu } from './online-menu.js';
import { ONLINE_TEXT } from './online-text.js';
import { configureMenuClose } from './menu-close.js';
import { plainState, restoreEncounter, contactKey, networkLoadout } from './online-state.js';
import { createInventoryState } from './inventory.js';
import { EXPLORATION_ISLANDS } from './exploration-islands.js';
import { createExplorationIslandView } from './exploration-island-view.js';
import { chestplateAbility, createChestplateAbilityState, stepChestplateAbility, activateChestplateAbility } from './chestplate-abilities.js';
import { ARMOR, equipArmor, craftArmor, upgradeArmor, armorDefense, mitigateDamage } from './armor.js';
import { cellBonus, embeddedCellLevel, createCell, createCellCombatState, recordRecycleHit, syncCellStats, beginCellDodge, activateDodgeCells, recordCellDamage } from './cells.js';
import { consumeResource, stepShields } from './resource-shields.js';
import { equipCell, equipmentCellLevels } from './equipment-cells.js';
import { familyAbility, createFamilyAbilityState, stepFamilyAbility, activateEmbermane, executeFamilyAttack } from './weapon-family-abilities.js';
import { selectRepeaterRayHit } from './repeater-targeting.js';
import { createCellView } from './cell-view.js';
import { EQUIPMENT, createEquipmentState, equipItem, craftWeapon, canChangeEquipment } from './equipment.js';
import { createEquipmentView } from './equipment-view.js';
import { resolveWeaponEvents, resolveAttackDamage } from './weapon-damage.js';
import { loadMapAsset } from './map-loader.js';
import { loadInventory, saveInventory, collectDefeatLoot, bankLoot } from './inventory.js';
import { createInventoryView } from './inventory-view.js';
import { createNarrative } from './narrative.js';
import { OLD_TOWN, createOldTownView } from './old-town-view.js';
import { behemothPushOut } from './behemoth-collision.js';
import { CHAINBLADES } from './chainblades-weapon.js';
import { createEnvironment } from './environment.js';
import { createSunShadows } from './sun-shadows.js';
import { ISLAND, encounterEnemies, createIslandEncounter, stepIslandEncounter, alertEncounter, inTerritory, encounterTouchable } from './island-encounters.js';
import { createIslandView } from './island-view.js';
import { createRangeScenery } from './range-scenery.js';
import { createArenaHud } from './arena-hud.js';
import { isRecovering, isRecoveryProtected, startKnockdown } from './player-recovery.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { ARENA_COLLIDERS, ARENA_SCALE, createPlayerState, isWalkableSlope, slopeContactCorrection, resolveWeaponMovement, stepPlayer } from './player-movement.js';
import { REPEATERS, REPEATER_TUNING, repeaterFalloff } from './repeaters-weapon.js';
import { STRIKER_SWORD } from './striker-weapon.js';
import { sweptMeleeContact } from './swept-melee.js';
import { spendStamina } from './stamina.js';
import { addTimedStatModifier, getEffectiveStat, getStatModifierRemaining, stepStatModifiers } from './stat-modifiers.js';
import { definitionFor, behemothAttackTouchesPlayer, behemothContactAttack, createBehemothState, hitBehemoth, isInterruptible } from './encounter-combat.js';
import { createBehemothView, updateBehemothView, disposeBehemothView } from './encounter-view.js';
import { quillImpactTouches } from './quillshot.js';
import { applyBurning, dodgeBurning, stepBurning } from './burning.js';
import { COMBAT_TEXT } from './combat-text.js';
import { createPlayerView, updatePlayerView } from './player-view.js';
import { createCombatFeedback } from './combat-feedback.js';
import { TRAINING_TARGET, createTrainingState, hitTrainingTarget, stepTrainingTarget, trainingDps } from './training-target.js';
import { createTrainingTargetView, updateTrainingTargetView } from './training-target-view.js';

let remoteHunter = null;
let online = null;
let onlineMenu = null;
let onlineStarting = false;
let pendingWorld = null;
let latestConfirmedWorld = null;
let lastOnlineAimYaw = 0;
let huntEpoch = 0;
let lastOnlineEpoch = null;
const remoteHunters = new Map();
const onlinePresentation = new OnlinePresentation();
const onlineMotionKeys = new Map();
const latestOnlineBosses = new Map();
let onlineEventSequence = 0;
let onlineEventAck = 0;
const onlineEventHistory = [];
const confirmedEventHistory = [];
const confirmedRewardHistory = [];
const onlineEventSeen = new Set();
let pendingCombatEvents = [];
let lastWorldTime = -Infinity;
const presentImpact = (point, damage, details) => {
  feedback.impact(point, damage, details);
  if (online?.host) {
    const event = { sequence: ++onlineEventSequence, epoch: huntEpoch, time: performance.now(), point, damage, details,
      attacker: remoteHunter?.id ?? online.id };
    onlineEventHistory.push(event);
    if (onlineEventHistory.length > 256) onlineEventHistory.shift();
    online.broadcast('combat', event);
  }
};
let narrative = null;
let dialogueActionHandled = false;
try {
  narrative = await createNarrative({ commands: {
    OpenSmithCrafting() {
      dialogueActionHandled = true;
      settlementPanel.hidden = true;
      openEquipment('smith');
    },
    OpenArmorCrafting() {
      dialogueActionHandled = true;
      settlementPanel.hidden = true;
      openEquipment('armorer');
    },
    OpenRepeaterCrafting() {
      dialogueActionHandled = true;
      settlementPanel.hidden = true;
      openEquipment('repeaters');
    },
    OpenCellResearch() {
      dialogueActionHandled = true;
      settlementPanel.hidden = true;
      openCells();
    },
  } });
} catch (error) {
  console.warn('Narrative assets could not be loaded; using the existing English UI.', error);
}

const root = document.querySelector('#scene');
const appShell = document.querySelector('.app-shell');
const loading = document.querySelector('#loading');
const fallback = document.querySelector('#webglFallback');
const homeScreen = document.querySelector('#homeScreen');
const arenaScreen = document.querySelector('#arenaScreen');
const playerHud = createArenaHud(arenaScreen, entry => narrative?.text(entry.id) ?? entry.value);
const islandStatus = document.createElement('div');
islandStatus.className = 'island-status hidden';
islandStatus.setAttribute('aria-label', 'Island encounter');
arenaScreen.append(islandStatus);
const settingsMenu = document.querySelector('#settingsMenu');
const settingsClose = document.querySelector('#settingsClose');
const arenaSettings = document.querySelector('#arenaSettings');
const resetArenaButton = document.querySelector('#resetArenaButton');
const selectedArenaName = document.querySelector('#selectedArenaName');
const settingsToggle = document.querySelector('#settingsToggle');
let settingsOpen = false;
let mapTransitionActive = false;
let pointerUnlockSettingsTimer = null;
let lastSettingsEscape = -Infinity;
let cameraPointerLocked = false;
let resumeCameraAfterEscape = false;
const enterButton = document.querySelector('#enterButton');
const cameraHint = document.querySelector('#cameraHint');
const fovSlider = document.querySelector('#fovSlider');
const fovValue = document.querySelector('#fovValue');
const arenaModeBadge = document.querySelector('#arenaModeBadge');
const arenaCaption = document.querySelector('#arenaCaption');
const settingsArenaOptions = [...document.querySelectorAll('input[name="settings-arena"]')];
const goToArenaButton = document.querySelector('#goToArenaButton');
const collisionVisibilityToggle = document.querySelector('#collisionVisibilityToggle');
const combatStatus = document.querySelector('#combatStatus');
const staminaBar = document.querySelector('#staminaBar');
const staminaFill = document.querySelector('#staminaFill');
const staminaValue = document.querySelector('#staminaValue');
const combatResources = document.querySelector('#combatResources');
const combatMantraDots = document.querySelector('#combatMantraDots');
const combatTargetStatus = document.querySelector('#combatTargetStatus');
const weaponButton = document.querySelector('#weaponButton');
const behemothHud = document.createElement('div');
behemothHud.className = 'behemoth-hud hidden';
behemothHud.setAttribute('aria-live', 'polite');
document.querySelector('.arena-hud-left').append(behemothHud);
const fovStorageKey = 'open-range-camera-fov';
const collisionVisibilityStorageKey = 'open-range-visible-collision';
const arenaStorageKey = 'open-range-selected-arena';
let selectedArena = 'range';
try {
  const savedArena = localStorage.getItem(arenaStorageKey);
  if (savedArena === 'combat') selectedArena = 'island';
  else if (['range', 'island', 'old-town', ...Object.keys(EXPLORATION_ISLANDS)].includes(savedArena)) selectedArena = savedArena;
} catch { /* Use the current range when storage is unavailable. */ }
let pendingArena = selectedArena;
let materialInventory = loadInventory({ getItem: key => localStorage.getItem(key) });
try {
  const saved = JSON.parse(localStorage.getItem('doughty-material-inventory-v1') || '{}');
  materialInventory.equipment = createEquipmentState(saved.equipment, localStorage.getItem('doughty-selected-weapon') ?? 'striker-sword');
} catch {}
const persistMaterials = () => {
  if (remoteHunter) return true;
  const saved = saveInventory(materialInventory, { setItem: (key, value) => localStorage.setItem(key, value) });
  document.querySelector('#inventorySaveWarning').hidden = saved;
  return saved;
};
const syncArenaSelection = () => {
  for (const option of settingsArenaOptions) option.checked = option.value === pendingArena;
  goToArenaButton.disabled = pendingArena === selectedArena;
  document.querySelector('#returnToSettlementButton').disabled = selectedArena === 'old-town';
};
let selectedFov = Number(fovSlider.value);
try {
  const savedFov = Number(localStorage.getItem(fovStorageKey));
  if (Number.isFinite(savedFov) && savedFov >= Number(fovSlider.min) && savedFov <= Number(fovSlider.max)) {
    selectedFov = savedFov;
    fovSlider.value = String(savedFov);
  }
} catch {
  // Keep the default FOV when browser storage is unavailable.
}
fovValue.value = `${selectedFov}Â°`;
fovValue.textContent = `${selectedFov}Â°`;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (error) {
  fallback.classList.remove('hidden');
  loading.classList.add('done');
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(root.clientWidth, root.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#11151b');
scene.fog = new THREE.Fog('#11151b', 24, 52);
const camera = new THREE.PerspectiveCamera(selectedFov, root.clientWidth / root.clientHeight, 0.1, 120);
camera.position.set(15, 12, 17);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enableZoom = false;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 24;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minPolarAngle = 0.22;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.32;

const ambientLight = new THREE.HemisphereLight('#e5edff', '#373b3e', 2.0);
scene.add(ambientLight);
const keyLight = new THREE.DirectionalLight('#fff1cf', 3.4);
keyLight.position.set(-7, 15, 9);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight('#a2c8ff', 1.7);
rimLight.position.set(13, 8, -8);
scene.add(rimLight);
const environment = createEnvironment(scene, camera, { sun: keyLight, ambient: ambientLight });
const sunShadows = createSunShadows(renderer, scene, keyLight, environment.state, document.querySelector('#shadowQuality'));

const arena = new THREE.Group();
arena.scale.set(ARENA_SCALE, 1, ARENA_SCALE);
scene.add(arena);
const islandView = new THREE.Group(); islandView.visible = false;
scene.add(islandView);
const oldTownView = { root: new THREE.Group(), stations: [] }; oldTownView.root.visible = false;
scene.add(oldTownView.root);
const explorationViews = new Map(Object.keys(EXPLORATION_ISLANDS).map(id => { const view = new THREE.Group(); view.visible = false; scene.add(view); return [id, view]; }));
const currentExplorationIsland = () => EXPLORATION_ISLANDS[selectedArena];
const mapLoads = new Map();
const preparedMapCollision = new Map();
const ensureMapLoaded = (mode) => {
  if (mode === 'range') return Promise.resolve();
  if (!mapLoads.has(mode)) mapLoads.set(mode, (async () => {
    const view = await loadMapAsset(mode, EXPLORATION_ISLANDS[mode] ? () => createExplorationIslandView(EXPLORATION_ISLANDS[mode]) : mode === 'old-town' ? createOldTownView : createIslandView);
    const destination = explorationViews.get(mode) ?? (mode === 'old-town' ? oldTownView.root : islandView);
    destination.add(...[...view.root.children]);
    destination.name = view.root.name;
    destination.position.copy(view.root.position);
    destination.quaternion.copy(view.root.quaternion);
    destination.scale.copy(view.root.scale);
    if (view.collisionTree) preparedMapCollision.set(mode, view.collisionTree);
    if (mode === 'old-town') oldTownView.stations = view.stations;
  })());
  return mapLoads.get(mode);
};
const isTown = () => selectedArena === 'old-town';
const currentTown = () => OLD_TOWN;
const currentTownView = () => oldTownView;
let islandEncounter = createIslandEncounter();
const settlementPrompt = document.createElement('div');
settlementPrompt.className = 'settlement-prompt'; settlementPrompt.hidden = true;
arenaScreen.append(settlementPrompt);
const settlementPanel = document.createElement('section');
settlementPanel.className = 'settlement-panel'; settlementPanel.hidden = true;
settlementPanel.innerHTML = '<h2></h2><p></p><button type="button" class="menu-button">Close</button>';
configureMenuClose(settlementPanel.querySelector('button'));
settlementPanel.querySelector('h2').dataset.narrativeDirect = '';
settlementPanel.querySelector('p').dataset.narrativeDirect = '';
const dialogueControls = document.createElement('div');
dialogueControls.className = 'dialogue-controls';
dialogueControls.dataset.narrativeDirect = '';
settlementPanel.append(dialogueControls);
let dialogueRevision = 0;
let dialogueResult = null;
let dialogueStation = null;
arenaScreen.append(settlementPanel);
const settlementTravelControls = document.createElement('div');
settlementTravelControls.hidden = true;
settlementTravelControls.innerHTML = `<div class="camera-settings arena-selection" role="group" aria-labelledby="huntingBoardDestinationTitle">
  <div class="settings-heading"><span class="settings-rule"></span><span id="huntingBoardDestinationTitle">MAP SELECTION</span></div>
  <label class="arena-option"><input type="radio" name="hunting-board-arena" value="island"><span><strong>Cinderwild Isle</strong></span></label>
  <label class="arena-option"><input type="radio" name="hunting-board-arena" value="range"><span><strong>Open Range</strong></span></label>
<label class="arena-option"><input type="radio" name="hunting-board-arena" value="brackenlight"><span><strong>Brackenlight Reach</strong></span></label>
<label class="arena-option"><input type="radio" name="hunting-board-arena" value="thunderstep"><span><strong>Thunderstep Highlands</strong></span></label>
<label class="arena-option"><input type="radio" name="hunting-board-arena" value="rimewatch"><span><strong>Rimewatch Expanse</strong></span></label>
<label class="arena-option"><input type="radio" name="hunting-board-arena" value="cinderfall"><span><strong>Cinderfall Crucible</strong></span></label>
</div><button type="button" class="primary-button">Go to selected location</button>`;
settlementPanel.append(settlementTravelControls);
const huntingBoardModes = document.createElement('div');
huntingBoardModes.className = 'hunting-board-modes';
huntingBoardModes.setAttribute('role', 'tablist');
huntingBoardModes.setAttribute('aria-label', 'Game mode');
settlementTravelControls.prepend(huntingBoardModes);
const boardMaps = settlementTravelControls.querySelector('.arena-selection');
boardMaps.id = 'huntingBoardMaps';
boardMaps.setAttribute('role', 'tabpanel');
let huntingBoardMode = 'hunting-grounds';
const huntingBoardOptions = document.createElement('div');
huntingBoardOptions.className = 'hunting-board-options';
huntingBoardOptions.hidden = true;
settlementTravelControls.append(huntingBoardOptions);
const leaveHuntingBoard = () => {
  settlementPanel.hidden = true;
  altCursorHeld = false;
  clearInput();
  document.activeElement?.blur();
};
const boardButton = (key, parent, action) => {
  const entry = ONLINE_TEXT[key];
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'menu-button';
  button.dataset.textId = entry.id;
  button.textContent = narrative?.text(entry.id) ?? entry.value;
  button.addEventListener('click', action); parent.append(button);
  return button;
};
const modeTabs = ['huntingGrounds', 'training'].map((key, index) => {
  const tab = boardButton(key, huntingBoardModes, () => selectBoardMode(index));
  tab.id = `huntingBoardMode${index}`;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', boardMaps.id);
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    selectBoardMode(next); modeTabs[next].focus();
  });
  return tab;
});
function selectBoardMode(index) {
  huntingBoardMode = index ? 'training' : 'hunting-grounds';
  modeTabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1;
  });
  boardMaps.setAttribute('aria-labelledby', modeTabs[index].id);
  for (const input of boardMaps.querySelectorAll('input')) {
    input.closest('label').hidden = (input.value === 'range') !== !!index;
    input.checked = !!index && input.value === 'range';
  }
  updateHuntingBoardOptions();
}
for (const action of ['privatePlay', 'quickJoin', 'chooseRoom', 'createRoom']) boardButton(action, huntingBoardOptions, () => {
  const map = settlementTravelControls.querySelector('input:checked')?.value;
  if (map !== 'island' && !EXPLORATION_ISLANDS[map]) return;
  leaveHuntingBoard(); onlineMenu.open(map, action, huntingBoardMode);
});
const huntingBoardCode = document.createElement('div');
huntingBoardCode.className = 'hunting-board-code';
settlementTravelControls.append(huntingBoardCode);
boardButton('enterCode', huntingBoardCode, () => { leaveHuntingBoard(); onlineMenu.openCode(); });
const updateHuntingBoardOptions = () => {
  const map = settlementTravelControls.querySelector('input:checked')?.value;
  huntingBoardOptions.hidden = !map || map === 'range';
  settlementTravelControls.querySelector('.primary-button').hidden = map !== 'range';
};
settlementTravelControls.addEventListener('change', updateHuntingBoardOptions);
updateHuntingBoardOptions();
selectBoardMode(0);
settlementTravelControls.querySelector('.primary-button').addEventListener('click', async () => {
  const destination = settlementTravelControls.querySelector('input:checked')?.value;
  if (!['range', 'island', ...Object.keys(EXPLORATION_ISLANDS)].includes(destination)) return;
  settlementPanel.hidden = true;
  altCursorHeld = false;
  clearInput();
  document.activeElement?.blur();
  if (destination === 'island' || EXPLORATION_ISLANDS[destination]) { onlineMenu.open(destination); return; }
  await leaveOnlineHunt();
  await setArenaMode(destination);
  requestCameraPointerLock();
});
function closeSettlementDialogue() {
  dialogueRevision++;
  dialogueStation = null;
  dialogueResult = null;
  dialogueControls.replaceChildren();
  settlementPanel.hidden = true;
  altCursorHeld = false;
  document.activeElement?.blur();
  requestCameraPointerLock();
}
settlementPanel.querySelector('button').addEventListener('click', closeSettlementDialogue);
function nearestSettlementStation() {
  return currentTownView().stations.map(s => ({...s, distance: Math.hypot(s.position[0]-playerState.position[0], s.position[2]-playerState.position[2], s.position[1]-playerState.position[1])})).sort((a,b)=>a.distance-b.distance)[0];
}
function updateSettlementHud() {
  const active = isTown() && !arenaScreen.classList.contains('hidden');
  settlementPrompt.hidden = !active;
  if (!active) { settlementPanel.hidden = true; return; }
  const station = nearestSettlementStation();
  const nearby = station && station.distance < 3.5;
  settlementPrompt.hidden = !nearby || settingsOpen || !settlementPanel.hidden;
  const characterKey = nearby && narrative?.interactions[station.id]?.characterUUID;
  const stationName = characterKey ? narrative.text(characterKey) : narrative?.translate(station?.name || '') ?? station?.name;
  settlementPrompt.textContent = nearby ? `E - ${stationName}` : '';
}
function renderSettlementDialogue() {
  if (!narrative || !dialogueStation) return;
  if (dialogueStation.id === 'arena-travel') {
    settlementPanel.querySelector('h2').textContent = narrative.translate('Hunting Board');
    return;
  }
  const binding = narrative.interactions[dialogueStation.id];
  settlementPanel.querySelector('h2').textContent = binding?.characterUUID
    ? narrative.text(binding.characterUUID) : narrative.translate(dialogueStation.id === 'arena-travel' ? 'Hunting Board' : dialogueStation.name);
  dialogueControls.replaceChildren();
  if (dialogueResult?.type === 'line') {
    settlementPanel.querySelector('p').textContent = narrative.text(dialogueResult.line.text);
    const next = document.createElement('button');
    next.className = 'menu-button';
    next.textContent = narrative.translate('Continue');
    next.addEventListener('click', () => advanceSettlementDialogue(() => narrative.runtime.progressConversation()));
    dialogueControls.append(next);
  } else if (dialogueResult?.type === 'outputs' && dialogueResult.nodeKeys.length) {
    for (const key of dialogueResult.nodeKeys) {
      const choice = document.createElement('button');
      choice.className = 'menu-button';
      choice.textContent = narrative.text(key);
      choice.addEventListener('click', () => advanceSettlementDialogue(() => narrative.runtime.chooseOutput(key)));
      dialogueControls.append(choice);
    }
  } else if (!dialogueActionHandled) closeSettlementDialogue();
}
async function advanceSettlementDialogue(action) {
  const revision = dialogueRevision;
  for (const button of dialogueControls.querySelectorAll('button')) button.disabled = true;
  try {
    const result = await narrative.runtime.followSingleOutputs(await action());
    if (revision !== dialogueRevision) return;
    dialogueResult = result;
    renderSettlementDialogue();
  } catch (error) {
    console.error(`Unable to progress settlement dialogue for ${dialogueStation?.id || 'unknown station'}.`, error);
    if (revision === dialogueRevision) closeSettlementDialogue();
  }
}
narrative?.onLanguageChange(renderSettlementDialogue);
async function interactSettlement() {
  if (settingsOpen) return;
  const station = nearestSettlementStation();
  if (!station || station.distance >= 3.5 || !settlementPanel.hidden) return;
  if (station.id === 'donation') { openMaterials('donate'); return; }
  if (station.id === 'extractor') { openMaterials('extract'); return; }
  const binding = narrative?.interactions[station.id];
  if (station.id === 'arena-travel') {
    dialogueRevision++;
    dialogueStation = station;
    dialogueResult = null;
    dialogueControls.replaceChildren();
    settlementPanel.querySelector('h2').textContent = narrative?.translate('Hunting Board') ?? 'Hunting Board';
    settlementPanel.querySelector('p').textContent = '';
    settlementPanel.querySelector('p').hidden = true;
    settlementTravelControls.hidden = false;
    selectBoardMode(0);
    settlementPanel.hidden = false;
    clearInput();
    altCursorHeld = true;
    if (document.pointerLockElement) document.exitPointerLock();
    return;
  }
  settlementPanel.querySelector('p').hidden = false;
  if (binding) {
    dialogueRevision++;
    dialogueStation = station;
    dialogueResult = null;
    dialogueActionHandled = false;
    settlementTravelControls.hidden = true;
    settlementPanel.querySelector('p').textContent = '';
    dialogueControls.replaceChildren();
    settlementPanel.hidden = false;
    clearInput();
    altCursorHeld = true;
    if (document.pointerLockElement) document.exitPointerLock();
    await advanceSettlementDialogue(() => narrative.runtime.beginConversation(binding.entryNodeUUID, binding.characterUUID ? [binding.characterUUID] : []));
    return;
  }
  // Retain service access if narrative assets could not be loaded.
  if (station.id === 'armorer') { openEquipment('armorer'); return; }
  if (station.id === 'repeaters') { openEquipment(station.id); return; }
  if (station.id === 'cell-researcher') { openCells(); return; }
  settlementTravelControls.hidden = station.id !== 'arena-travel';
  settlementPanel.querySelector('h2').textContent = station.id === 'arena-travel' ? 'Hunting Board' : station.name;
  settlementPanel.querySelector('p').textContent = station.text;
  settlementPanel.hidden = false;
  clearInput();
  altCursorHeld = true;
  if (document.pointerLockElement) document.exitPointerLock();
}

const cameraBlockers = [];
const floorMaterial = new THREE.MeshStandardMaterial({ color: '#526854', roughness: 0.95 });
const floor = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.35, 64), floorMaterial);
floor.position.y = -0.2;
floor.receiveShadow = true;
arena.add(floor);
cameraBlockers.push(floor);

// Low contrast modular floor grid makes scale and orientation legible in the graybox.
const arenaGrid = new THREE.Group();
arena.add(arenaGrid);
arenaGrid.visible = false;
const updateArenaGrid = (scale) => {
  for (const lineGroup of arenaGrid.children) {
    lineGroup.geometry.dispose();
    lineGroup.material.dispose();
  }
  arenaGrid.clear();
  const majorLines = [];
  const minorLines = [];
  const worldLimit = 10 * scale;
  const worldSteps = Math.round(worldLimit * 2);
  for (let step = -worldSteps; step <= worldSteps; step += 1) {
    const worldPosition = step;
    const localPosition = worldPosition / scale;
    const lines = step % 4 === 0 ? majorLines : minorLines;
    lines.push(-10, -0.018, localPosition, 10, -0.018, localPosition);
    lines.push(localPosition, -0.018, -10, localPosition, -0.018, 10);
  }
  const addGridLines = (vertices, color, opacity) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    arenaGrid.add(new THREE.LineSegments(geometry, material));
  };
  addGridLines(majorLines, '#c5cbd0', 0.34);
  addGridLines(minorLines, '#aeb5bb', 0.12);
};
updateArenaGrid(ARENA_SCALE);

const wallMaterial = new THREE.MeshStandardMaterial({ color: '#535e63', roughness: 0.95 });
// Interlocking visible boulders enclose the northern half; the southern rim stays open.
for (let i = 0; i <= 24; i++) {
  const angle = Math.PI / 2 + i * Math.PI / 24;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), wallMaterial);
  rock.position.set(Math.sin(angle) * 9.5, 1.45 + (i % 3) * .18, Math.cos(angle) * 9.5);
  rock.scale.set(.85 + (i % 2) * .12, 2.1 + (i % 3) * .28, .85);
  rock.rotation.y = i * .7;
  rock.userData.climbable = false;
  rock.castShadow = true; rock.receiveShadow = true;
  arena.add(rock); cameraBlockers.push(rock);
}
const thresholdMaterial = new THREE.MeshStandardMaterial({ color: '#9a8b70', roughness: 0.95 });

// Stone practice blocks retain their original climbable dimensions.
const markerMaterial = new THREE.MeshStandardMaterial({ color: '#535e63', roughness: 0.95 });
const markers = [
  { p: [-6.2, 0.7, -4.4], s: [1.4, 1.4, 1.4] },
  { p: [5.8, 0.55, -3.8], s: [1.1, 1.1, 1.1] },
  { p: [1.4, 0.9, 5.3], s: [1.8, 1.8, 1.8] },
];
const markerMeshes = [];
for (const item of markers) {
  const shape = new THREE.Mesh(new THREE.BoxGeometry(...item.s), markerMaterial);
  shape.position.set(...item.p);
  shape.castShadow = true;
  shape.receiveShadow = true;
  arena.add(shape);
  markerMeshes.push(shape);
  cameraBlockers.push(shape);
  const topMarker = new THREE.Mesh(new THREE.BoxGeometry(item.s[0] + 0.1, 0.06, item.s[2] + 0.1), thresholdMaterial);
  topMarker.position.set(item.p[0], item.p[1] + item.s[1] / 2 + 0.04, item.p[2]);
  topMarker.userData.movementCollision = false;
  arena.add(topMarker);
  markerMeshes.push(topMarker);
}

// Optional wireframes show the movement collision volumes, separate from the
// solid graybox marker meshes.
const collisionVisuals = new THREE.Group();
const collisionVisualMaterial = new THREE.LineBasicMaterial({ color: '#d9ff69', transparent: true, opacity: 0.9 });
// Display the actual authored triangles instead of retired rectangular wall volumes.
for (const mesh of cameraBlockers) {
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), collisionVisualMaterial);
  edges.position.copy(mesh.position); edges.rotation.copy(mesh.rotation); edges.scale.copy(mesh.scale);
  collisionVisuals.add(edges);
}
arena.add(collisionVisuals);
try {
collisionVisibilityToggle.checked = localStorage.getItem(collisionVisibilityStorageKey) === 'true';
} catch {
  collisionVisibilityToggle.checked = false;
}
collisionVisuals.visible = selectedArena === 'range' && collisionVisibilityToggle.checked;
collisionVisibilityToggle.addEventListener('change', () => {
  collisionVisuals.visible = selectedArena === 'range' && collisionVisibilityToggle.checked;
  for (const projectile of activeProjectiles) projectile.collisionVolume.visible = collisionVisibilityToggle.checked;
  try {
    localStorage.setItem(collisionVisibilityStorageKey, String(collisionVisibilityToggle.checked));
  } catch {
    // The current session still uses the selected visibility if storage is unavailable.
  }
});

// The visible circular cliff is also the collision surface beneath the grass cap.
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(10, 8.2, 4, 64), wallMaterial);
plinth.position.y = -2.375;
arena.add(plinth); cameraBlockers.push(plinth);
arena.add(createRangeScenery());

// Training target is rendered at arena origin coordinates and included in the
// geometry-backed capsule collision world below.
const trainingView = createTrainingTargetView();
const target = trainingView.root;
target.position.set(0, 0, -4.2);
const targetCore = trainingView.hitbox;
let trainingState = createTrainingState();
const damageTrainingTarget = (damage, { stagger = 0, wound = 0, periodic = false, damageModifiers = [] } = {}) => {
  const multiplier = getEffectiveStat(1, 'coreDamage', [...playerState.statModifiers, ...damageModifiers]);
  damage *= multiplier; stagger *= multiplier; wound *= multiplier;
  hitTrainingTarget(trainingState, { damage, stagger, wound, periodic });
  presentImpact([target.position.x, 1.5, target.position.z + 1.2], damage, { periodic, part: 'head', woundDamage: Math.max(0, wound), staggerDamage: Math.max(0, stagger) });
};
scene.add(target);
let behemothState = createBehemothState();
let BEHEMOTH = definitionFor(behemothState);
let behemothView = createBehemothView(scene);
const encounterViews = new Map([['first-behemoth', behemothView]]);
const summonViews = new Map();
const enemyRecords = () => [{ boss: behemothState, view: behemothView }, ...[...summonViews.values()].filter(r => r.boss === islandEncounter.summon?.boss)];
behemothView.root.visible = false;
const projectileTargets = [];
const registerProjectileTarget = ({ id, mesh, sizeClass = 'small', onDamage }) => {
  if (!id || !mesh || !['small', 'large'].includes(sizeClass)) throw new Error('Projectile targets need an id, mesh, and small/large sizeClass.');
  const record = { id, kind: id, mesh, sizeClass, onDamage };
  projectileTargets.push(record);
  return () => {
    const index = projectileTargets.indexOf(record);
    if (index >= 0) projectileTargets.splice(index, 1);
  };
};
registerProjectileTarget({
  id: 'training-dummy', mesh: targetCore, sizeClass: 'large',
  onDamage: (damage, details) => damageTrainingTarget(damage, details),
});
let cellCombat = createCellCombatState();
let familyCombat = createFamilyAbilityState();
let chestplateCombat = createChestplateAbilityState();
const currentChestplateAbility = () => {
  const item = ARMOR[materialInventory.armor.equipped.chestplate];
  return chestplateAbility(item, materialInventory.armor.owned[item?.id]);
};
const clearChestplateCombat = () => {
  chestplateCombat = createChestplateAbilityState();
  playerState.statModifiers = playerState.statModifiers.filter(m => m.source !== 'embermane-chestplate');
};
const currentFamilyAbility = () => {
  const item = EQUIPMENT[materialInventory.equipment.equipped];
  return familyAbility(item, materialInventory.equipment.owned[item?.id]);
};
const launchFamilyAttack = () => {
  for (const quill of executeFamilyAttack(familyCombat, currentFamilyAbility(), equipment?.state.action, playerState.facingYaw)) launchProjectile(quill);
};
const currentEmbeddedCell = () => {
  const item = EQUIPMENT[materialInventory.equipment.equipped];
  return { id: item?.embeddedCell, level: item?.embeddedCell ? embeddedCellLevel(materialInventory.equipment.owned[item.id]) : 0 };
};
const currentCellLevels = () => {
  return equipmentCellLevels(materialInventory);
};
const clearCellCombat = () => {
  cellCombat = createCellCombatState();
  familyCombat = createFamilyAbilityState();
  playerState.familyAbility = null;
  playerState.cellStatus = null;
  playerState.shields = {};
  playerState.statModifiers = playerState.statModifiers.filter(m => !['evasive-fury', 'wild-frenzy', 'embermane-movement'].includes(m.source));
  syncCellStats(playerState, currentCellLevels());
};
const damageBehemoth = (damage, { part = 'body', stagger = 0, wound = 0, interrupt = false, periodic = false, melee = false, damageModifiers = [], targetBoss = behemothState, targetView = behemothView } = {}) => {
  if (online?.guest) return { outcome: 'pending' };
  const behemothState = targetBoss, behemothView = targetView, BEHEMOTH = definitionFor(targetBoss);
  if (selectedArena !== 'island' || !encounterTouchable(behemothState)) return { outcome: 'ignored' };
  if (selectedArena === 'island' && !inTerritory(islandEncounter.arena, playerState.position, 1)) return { outcome: 'ignored' };
  if (selectedArena === 'island' && !periodic) alertEncounter(islandEncounter, playerState.position);
  const cell = currentEmbeddedCell();
  const modifiers = [...playerState.statModifiers, ...damageModifiers];
  if (damage > 0 && cell.id === 'recycle') {
    const bonus = periodic
      ? (cellCombat.target === behemothState ? cellBonus(cell.level) * cellCombat.stacks / 5 : 0)
      : recordRecycleHit(cellCombat, behemothState, part, cell.level);
    modifiers.push({ source: 'recycle', stat: 'coreDamage', percent: bonus, flat: 0, remaining: 1 });
    playerState.cellStatus = { id: cell.id, level: cell.level, stacks: cellCombat.stacks, bonus };
  }
  const multiplier = getEffectiveStat(1, 'coreDamage', modifiers);
  damage *= multiplier; stagger *= multiplier; wound *= multiplier;
  const healthBefore = behemothState.health;
  const result = hitBehemoth(behemothState, { damage, stagger, wound, part, interrupt, attackerModifiers: periodic ? undefined : playerState.statModifiers });
  recordCellDamage(playerState, currentCellLevels(), { brokenPart: result.brokenPart,
    coreDamage: healthBefore - behemothState.health, melee, periodic, hasPart: Boolean(BEHEMOTH.parts[part]),
    growth: BEHEMOTH.parts[part]?.growth === true || BEHEMOTH.parts[part]?.quills === true });
  if (result.outcome === 'defeated') {
    awardOnlineLoot(targetBoss === islandEncounter.boss ? islandEncounter.id : islandEncounter.summon?.id, behemothState);
  }
  const point = behemothView.hitboxes[part]?.getWorldPosition(new THREE.Vector3())
    ?? new THREE.Vector3(...behemothState.position);
  presentImpact(point.toArray(), damage,
    { outcome: result.outcome, part: result.partDamage > 0 ? part : 'body', periodic, brokenPart: result.brokenPart, wounded: result.wounded, woundDamage: result.woundDamage, staggerDamage: result.staggerDamage });
  return result;
};
const syncEncounterView = () => {
  for (const view of encounterViews.values()) { view.root.visible = false; if (view.projectileRoot) view.projectileRoot.visible = false; }
  const species = behemothState.speciesId ?? 'first-behemoth';
  if (!encounterViews.has(species)) encounterViews.set(species, createBehemothView(scene, species));
  behemothView = encounterViews.get(species);
  BEHEMOTH = definitionFor(behemothState);
  updateBehemothView(behemothView, behemothState, 0, collisionVisibilityToggle.checked);
  for (let i = projectileTargets.length - 1; i >= 0; i--) if (projectileTargets[i].kind === 'first-behemoth') projectileTargets.splice(i, 1);
  for (const [part, mesh] of Object.entries(behemothView.hitboxes)) registerProjectileTarget({
    id: 'first-behemoth', mesh, sizeClass: 'large',
    onDamage: (damage, details) => damageBehemoth(damage, { part, stagger: details?.stagger ?? 22, interrupt: details?.interrupt === true, damageModifiers: details?.damageModifiers }),
  });
  behemothView.root.visible = selectedArena === 'island';
};
const syncSummonView = () => {
  const summon = islandEncounter.summon;
  for (const [id, record] of summonViews) if (id !== summon?.id) {
    disposeBehemothView(record.view);
    for (let i = projectileTargets.length - 1; i >= 0; i--) if (projectileTargets[i].id === id) projectileTargets.splice(i, 1);
    summonViews.delete(id);
    equipment?.definition.onTargetRemoved?.(equipment.state, id);
  }
  if (summon && !summonViews.has(summon.id)) {
    const view = createBehemothView(scene, summon.speciesId);
    summonViews.set(summon.id, { boss: summon.boss, view });
    for (const [part, mesh] of Object.entries(view.hitboxes)) {
      registerProjectileTarget({ id: summon.id, mesh, sizeClass: 'large',
        onDamage: (damage, details) => damageBehemoth(damage, { ...details, part, targetBoss: summon.boss, targetView: view }) });
      const record = projectileTargets.at(-1); record.kind = 'first-behemoth'; record.boss = summon.boss;
    }
  }
  for (const record of summonViews.values()) {
    updateBehemothView(record.view, record.boss, 0, collisionVisibilityToggle.checked);
    record.view.root.visible &&= selectedArena === 'island';
    if (record.view.projectileRoot) record.view.projectileRoot.visible &&= selectedArena === 'island';
  }
};
syncEncounterView();
let projectileObstacleMeshes = [];
let activeProjectiles = [];
const crescentDimensions = STRIKER_SWORD.specials.threeMantra;
const crescentHalfWidth = crescentDimensions.width / 2;
const crescentHalfDepth = crescentDimensions.depth / 2;
const crescentShape = new THREE.Shape();
crescentShape.moveTo(-crescentHalfWidth, -crescentHalfDepth);
crescentShape.quadraticCurveTo(0, crescentHalfDepth * 3, crescentHalfWidth, -crescentHalfDepth);
crescentShape.quadraticCurveTo(0, crescentHalfDepth * 1.7, -crescentHalfWidth, -crescentHalfDepth);
const crescentGeometry = new THREE.ExtrudeGeometry(crescentShape, { depth: 0.12, bevelEnabled: false, steps: 1 });
crescentGeometry.rotateX(Math.PI / 2);
crescentGeometry.translate(0, 0.06, 0);
const crescentMaterial = new THREE.MeshStandardMaterial({ color: '#dbe6ed', metalness: 0.78, roughness: 0.2, emissive: '#256370', emissiveIntensity: 0.35, side: THREE.DoubleSide });
const crescentEdgeMaterial = new THREE.LineBasicMaterial({ color: '#f0fbff', transparent: true, opacity: 0.95 });
const projectileCollisionMaterial = new THREE.LineBasicMaterial({ color: '#d9ff69', transparent: true, opacity: 0.92 });
const weaponQuillGeometry = new THREE.ConeGeometry(.075, .65, 6);
const weaponQuillMaterial = new THREE.MeshStandardMaterial({ color: '#b4e4e8', emissive: '#386b77', emissiveIntensity: .7 });
const attackVolume = new THREE.Group();
const attackVolumeMaterial = new THREE.MeshBasicMaterial({ color: '#d9ff69', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const attackOutlineMaterial = new THREE.LineBasicMaterial({ color: '#f3ffca', transparent: true, opacity: 0.92 });
let attackVolumeMoveId = null;
let attackVolumeArc = null;
let attackVolumeRange = null;
scene.add(attackVolume);

// Geometry-backed collision adapter. Movement consumes capsule overlap and
// ray queries, so its rules do not depend on box dimensions or Three.js types.
arena.updateMatrixWorld(true);
let movementGeometry = new THREE.Group();
const movementRaycaster = new THREE.Raycaster();
let movementMeshes = [];
let movementOctree;
const mapCollisionCache = new Map();
const rebuildArenaCollision = () => {
  const cached = mapCollisionCache.get(selectedArena);
  if (cached) {
    movementGeometry = cached.geometry;
    movementMeshes = cached.meshes;
    movementOctree = cached.octree;
    projectileObstacleMeshes = movementMeshes;
    return;
  }
  const mapRoot = explorationViews.get(selectedArena) ?? (isTown() ? currentTownView().root : selectedArena === 'island' ? islandView : arena);
  mapRoot.updateMatrixWorld(true);
  movementGeometry = new THREE.Group();
  movementMeshes = [];
  mapRoot.traverse((object) => {
    if (!object.isMesh || !object.visible || object.userData.movementCollision === false) return;
    // Collision only needs positions and indices; omit render-only attributes.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', object.geometry.attributes.position);
    if (object.geometry.index) geometry.setIndex(object.geometry.index);
    const proxy = new THREE.Mesh(geometry);
    proxy.matrix.copy(object.matrixWorld);
    proxy.matrixAutoUpdate = false;
    movementGeometry.add(proxy);
    movementMeshes.push(object);
  });
  projectileObstacleMeshes = movementMeshes;
  movementGeometry.updateMatrixWorld(true);
  movementOctree = preparedMapCollision.get(selectedArena) || new Octree().fromGraphNode(movementGeometry);
  mapCollisionCache.set(selectedArena, { geometry: movementGeometry, meshes: movementMeshes, octree: movementOctree });
};
// Analytic footprint (base, wheels and pad) so every side blocks movement equally.
const DUMMY_HALF = { x: 1.32, z: 1.3, height: 2.1 };
const dummyPushOut = (cx, baseY, cz, radius) => {
  if (baseY > DUMMY_HALF.height) return null;
  const lx = cx - target.position.x;
  const lz = cz - target.position.z;
  const dx = lx - Math.max(-DUMMY_HALF.x, Math.min(DUMMY_HALF.x, lx));
  const dz = lz - Math.max(-DUMMY_HALF.z, Math.min(DUMMY_HALF.z, lz));
  if (dx === 0 && dz === 0) {
    const px = DUMMY_HALF.x - Math.abs(lx);
    const pz = DUMMY_HALF.z - Math.abs(lz);
    return px < pz ? [(lx < 0 ? -1 : 1) * (px + radius), 0] : [0, (lz < 0 ? -1 : 1) * (pz + radius)];
  }
  const d = Math.hypot(dx, dz);
  if (d >= radius) return null;
  const k = (radius - d) / d;
  return [dx * k, dz * k];
};
const createMovementCapsule = (position, radius, height) => new Capsule(
  new THREE.Vector3(position[0], position[1] + radius, position[2]),
  new THREE.Vector3(position[0], position[1] + height - radius, position[2]),
  radius,
);
const movementCollisionWorld = {
  moveCapsule(position, displacement, radius, height, { phaseEnemies = false, onTravel } = {}) {
    const capsule = createMovementCapsule(position, radius, height);
    const contacts = [];
    const skin = 0.001;
    const solveContacts = () => {
      let moved = false;
      for (let iteration = 0; iteration < 5; iteration += 1) {
        let corrected = false;
        // Resolve each collision world independently. A floor contact from
        // the arena must not mask a simultaneous overlap with the Dummy.
        for (const octree of [movementOctree]) {
          const hit = octree.capsuleIntersect(capsule);
          if (!hit || hit.depth <= 1e-5) continue;
          const normal = hit.normal.clone().normalize();
          capsule.translate(new THREE.Vector3(...slopeContactCorrection(normal.toArray(), hit.depth, skin)));
          if (!isWalkableSlope(normal.toArray())) contacts.push(normal.toArray());
          corrected = true;
          moved = true;
        }
        const dummyPush = phaseEnemies || selectedArena !== 'range' ? null : dummyPushOut(capsule.start.x, capsule.start.y - radius, capsule.start.z, radius);
        if (dummyPush) {
          const length = Math.hypot(dummyPush[0], dummyPush[1]);
          capsule.translate(new THREE.Vector3(dummyPush[0] + dummyPush[0] / length * skin, 0, dummyPush[1] + dummyPush[1] / length * skin));
          contacts.push([dummyPush[0] / length, 0, dummyPush[1] / length]);
          corrected = true;
          moved = true;
        }
        for (const enemy of selectedArena === 'island' && !phaseEnemies ? encounterEnemies(islandEncounter).filter(encounterTouchable) : []) {
          const push = behemothPushOut(enemy, [capsule.start.x, capsule.start.y - radius, capsule.start.z], radius, height);
          if (push) {
            const length = Math.hypot(...push);
            capsule.translate(new THREE.Vector3(push[0] * (1 + skin / length), 0, push[1] * (1 + skin / length)));
            contacts.push([push[0] / length, 0, push[1] / length]);
            corrected = true;
            moved = true;
          }
        }
        if (!corrected) break;
      }
      return moved;
    };

    // First recover any overlap, so starting beside an edge cannot leave the
    // capsule embedded when the next movement input arrives.
    solveContacts();
    const distance = Math.hypot(...displacement);
    const steps = Math.max(1, Math.ceil(distance / (radius * 0.3)));
    const increment = displacement.map((component) => component / steps);
    for (let step = 0; step < steps; step += 1) {
      const from = [capsule.start.x, capsule.start.y - radius, capsule.start.z];
      capsule.translate(new THREE.Vector3(...increment));
      solveContacts();
      onTravel?.(from, [capsule.start.x, capsule.start.y - radius, capsule.start.z]);
    }
    return {
      position: [capsule.start.x, capsule.start.y - radius, capsule.start.z],
      contacts,
    };
  },
  overlapsCapsule(position, radius, height) {
    const capsule = createMovementCapsule(position, radius, height);
    const dummyBlocked = selectedArena === 'range' && Boolean(dummyPushOut(capsule.start.x, capsule.start.y - radius, capsule.start.z, radius));
    const contact = [movementOctree]
      .map((octree) => octree.capsuleIntersect(capsule))
      .find((hit) => hit && hit.depth > 1e-4 && !isWalkableSlope(hit.normal.toArray()));
    // A capsule resting on a floor or platform is expected to touch it. Treat
    // only penetration into a wall/ceiling as a blocked movement candidate.
    return Boolean(contact) || dummyBlocked || (selectedArena === 'island' && encounterEnemies(islandEncounter).some(enemy => encounterTouchable(enemy) && Boolean(behemothPushOut(enemy, position, radius, height))));
  },
  raycast(origin, direction, distance) {
    movementRaycaster.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize());
    movementRaycaster.far = distance;
    const hit = movementRaycaster.intersectObjects(movementMeshes, false)[0];
    if (!hit) return null;
    const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) ?? new THREE.Vector3(0, 1, 0);
    return { point: hit.point.toArray(), normal: normal.toArray(), distance: hit.distance, climbable: hit.object.userData.climbable !== false };
  },
};

// Gameplay state is plain data; Three.js objects below are presentation only.
let playerState = createPlayerState();
let playerView = createPlayerView();
let player = playerView.root;
let playerBodyMaterial = playerView.armor;
const burningEffect = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.065, 6, 24), new THREE.MeshBasicMaterial({ color: '#ff8b24', transparent: true, opacity: 0.8, depthWrite: false }));
burningEffect.rotation.x = Math.PI / 2; burningEffect.position.y = 0.18; burningEffect.visible = false;
player.add(burningEffect);
const feedback = createCombatFeedback(scene, appShell);
const feedbackControls = document.createElement('div');
feedbackControls.className = 'feedback-controls';
for (const [label, enabled, change] of [
  ['Sound', !feedback.muted, (value) => feedback.setMuted(!value)],
  ['Camera shake', feedback.shakeEnabled, (value) => feedback.setShake(value)],
]) {
  const wrapper = document.createElement('label');
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = enabled;
  checkbox.addEventListener('change', () => change(checkbox.checked));
  wrapper.append(checkbox, document.createTextNode(label)); feedbackControls.append(wrapper);
}
document.querySelector('#feedbackSettings').append(feedbackControls);
window.addEventListener('pointerdown', () => feedback.unlockAudio());
window.addEventListener('keydown', () => feedback.unlockAudio());
const tempestCastMaterial = new THREE.MeshBasicMaterial({ color: '#d9ff69', transparent: true, opacity: 0.9, depthWrite: false });
const tempestCastRing = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.025, 8, 40), tempestCastMaterial);
tempestCastRing.rotation.x = Math.PI / 2;
tempestCastRing.position.y = 0.045;
tempestCastRing.visible = false;
player.add(tempestCastRing);
scene.add(player);
player.visible = false;

const raycaster = new THREE.Raycaster();
const cameraRaycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.025);
const aimPoint = new THREE.Vector3();
let heldKeys = new Set();
let pressedKeys = new Set();
let equipment = { definition: STRIKER_SWORD, state: STRIKER_SWORD.createState() };
let basicFireHeld = false;
let weaponStates = new Map();
let rangedEffects = [];
const buffCollectors = new Set();
window.registerBuffCollector = collector => { buffCollectors.add(collector); return () => buffCollectors.delete(collector); };
const repeatersSettings = document.querySelector('#repeatersSettings');
const updateWeaponSettings = () => { repeatersSettings.hidden = equipment?.definition.id !== 'repeaters'; };
updateWeaponSettings();
const weaponStorageKey = 'doughty-selected-weapon';
const saveWeaponSelection = id => {
  try { localStorage.setItem(weaponStorageKey, id); } catch { /* Selection remains usable without storage. */ }
};
const autoReloadToggle = document.querySelector('#autoReload');
try { autoReloadToggle.checked = localStorage.getItem('repeaters-auto-reload') !== 'false'; } catch {}
autoReloadToggle.addEventListener('change', () => { try { localStorage.setItem('repeaters-auto-reload', autoReloadToggle.checked); } catch {} });
window.availableWeapons = { 'striker-sword': STRIKER_SWORD, repeaters: REPEATERS, chainblades: CHAINBLADES };
let equippedWeapon = STRIKER_SWORD; // Weapon availability is separate from its sheathed state.
const cameraOrbit = { azimuth: Math.PI / 4, polar: 1.15, distance: 13, shoulder: 0 };
const followCameraScale = 2 / 3;
let altCursorHeld = false;
let relockOnFocus = false;
let qHeldSince = null;
let qConsumed = false;

const getCameraYaw = () => remoteHunter ? remoteHunter.input.cameraYaw : cameraOrbit.azimuth;
const getWeaponCamera = () => resolveWeaponMovement(
  equipment?.definition.kind === 'ranged' && equipment.state.sheathed ? null : equippedWeapon,
).camera;
const updateGameplayCamera = (dt = 0) => {
  if (dt > 0) {
    const view = getWeaponCamera();
    const blend = 1 - Math.exp(-12 * dt);
    cameraOrbit.distance += (view.distance * followCameraScale - cameraOrbit.distance) * blend;
    cameraOrbit.shoulder += (view.shoulder - cameraOrbit.shoulder) * blend;
  }
  const target = new THREE.Vector3(playerState.position[0], playerState.position[1] + 1.55 + (equipment?.state.airHeight ?? 0), playerState.position[2]);
  controls.target.copy(target);
  const horizontal = Math.sin(cameraOrbit.polar) * cameraOrbit.distance;
  camera.position.set(
    target.x + Math.sin(cameraOrbit.azimuth) * horizontal + Math.cos(cameraOrbit.azimuth) * cameraOrbit.shoulder,
    target.y + Math.cos(cameraOrbit.polar) * cameraOrbit.distance,
    target.z + Math.cos(cameraOrbit.azimuth) * horizontal - Math.sin(cameraOrbit.azimuth) * cameraOrbit.shoulder,
  );
  // Shift the aim point with the shoulder, keeping the hunter left of the reticle.
  // Looking back at the hunter would cancel the shoulder offset on screen.
  const lookTarget = target.clone();
  lookTarget.x += Math.cos(cameraOrbit.azimuth) * cameraOrbit.shoulder;
  lookTarget.z -= Math.sin(cameraOrbit.azimuth) * cameraOrbit.shoulder;
  camera.lookAt(lookTarget);
};
const applyWeaponCamera = () => {
  if (arenaScreen.classList.contains('hidden')) return;
  const view = getWeaponCamera();
  const offset = camera.position.clone().sub(controls.target);
  if (Number.isFinite(offset.x) && Number.isFinite(offset.z) && offset.lengthSq() > 0.01) {
    cameraOrbit.azimuth = Math.atan2(offset.x, offset.z);
  }
  const distance = view.distance * followCameraScale;
  cameraOrbit.distance = distance;
  cameraOrbit.polar = Math.acos(THREE.MathUtils.clamp((view.height * followCameraScale) / distance, 0.15, 0.92));
  cameraOrbit.shoulder = view.shoulder;
  updateGameplayCamera();
  camera.fov = selectedFov;
  camera.updateProjectionMatrix();
};

const requestCameraPointerLock = () => {
  if (onlineMenu?.openNow || arenaScreen.classList.contains('hidden') || mapTransitionActive || settingsOpen || !settlementPanel.hidden || altCursorHeld || !document.hasFocus()) return;
  try {
    const request = renderer.domElement.requestPointerLock();
    request?.catch(() => syncPointerLockHint());
  } catch {
    // The browser may deny pointer lock; clicking the scene can retry it.
  }
};

const syncPointerLockHint = () => {
  if (!cameraHint) return;
  cameraHint.textContent = altCursorHeld
    ? 'ALT HELD / FREE CURSOR'
    : document.pointerLockElement === renderer.domElement
      ? 'MOUSE LOOK / ALT FOR CURSOR / ESC SETTINGS'
      : 'CLICK TO RESUME CAMERA';
};

renderer.domElement.addEventListener('click', () => {
  if (!arenaScreen.classList.contains('hidden') && document.pointerLockElement !== renderer.domElement) {
    requestCameraPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && !settlementPanel.hidden) { document.exitPointerLock(); return; }
  const released = cameraPointerLocked && !locked;
  cameraPointerLocked = locked;
  appShell.classList.toggle('pointer-locked', locked);
  if (locked) relockOnFocus = false;
  else if (released && !arenaScreen.classList.contains('hidden') && !altCursorHeld && !settingsOpen) {
    // Escape may release pointer lock before or after its keyboard event.
    // Give that event priority; use this fallback when the browser consumes it.
    clearTimeout(pointerUnlockSettingsTimer);
    pointerUnlockSettingsTimer = setTimeout(() => {
      pointerUnlockSettingsTimer = null;
      if (performance.now() - lastSettingsEscape > 150 && !settingsOpen && !onlineMenu?.openNow
        && !arenaScreen.classList.contains('hidden') && !altCursorHeld
        && document.pointerLockElement !== renderer.domElement) setSettingsOpen(true);
    }, 80);
  }
  syncPointerLockHint();
});
document.addEventListener('pointerlockerror', syncPointerLockHint);
window.addEventListener('mousemove', (event) => {
  if (arenaScreen.classList.contains('hidden') || altCursorHeld || document.pointerLockElement !== renderer.domElement) return;
  cameraOrbit.azimuth -= event.movementX * 0.0028;
  cameraOrbit.polar = THREE.MathUtils.clamp(cameraOrbit.polar - event.movementY * 0.0024, 0.22, 2.5);
});

// Future weapon equip code can call this without changing the movement simulation.
window.equipWeapon = (definition = STRIKER_SWORD) => {
  if (!arenaScreen.classList.contains('hidden') && !canChangeEquipment(selectedArena)) return false;
  const selected = materialInventory.equipment.equipped;
  const itemId = selected && EQUIPMENT[selected].type === definition.id ? selected : `starter:${definition.id}`;
  if (!materialInventory.equipment.owned[itemId]) return false;
  materialInventory.equipment.equipped = itemId;
  if (!definition?.createState || !definition?.handleAttack || !definition?.step || !definition?.setSheathed) throw new Error('Weapon must implement createState, handleAttack, step, and setSheathed.');
  clearInput();
  if (equipment) { equipment.definition.cancelAction?.(equipment.state); weaponStates.set(equipment.definition, equipment.state); }
  const nextState = weaponStates.get(definition) ?? definition.createState();
  definition.cancelAction?.(nextState);
  definition.setSheathed(nextState, true);
  equipment = { definition, state: nextState };
  clearCellCombat();
  persistMaterials();
  updateWeaponSettings();
  equippedWeapon = definition;
  saveWeaponSelection(definition.id);
  if (weaponButton) weaponButton.textContent = 'Equipment';
  applyWeaponCamera();
  renderCombatHud();
};
window.unequipWeapon = () => {
  if (!arenaScreen.classList.contains('hidden') && !canChangeEquipment(selectedArena)) return false;
  materialInventory.equipment.equipped = null;
  persistMaterials();
  clearInput();
  if (equipment) { equipment.definition.cancelAction?.(equipment.state); weaponStates.set(equipment.definition, equipment.state); }

  equipment = null;
  clearCellCombat();
  updateWeaponSettings();
  equippedWeapon = null;
  saveWeaponSelection('');
  if (weaponButton) weaponButton.textContent = 'Equipment';
  applyWeaponCamera();
  renderCombatHud();
};
window.setMovementWeapon = (weapon) => weapon ? window.equipWeapon(weapon) : window.unequipWeapon();
window.registerProjectileTarget = registerProjectileTarget;

// Camera aim chooses a point; the muzzle ray enforces range and nearby occlusion.
function repeaterAim(yawOffset = 0, pitchOffset = 0) {
  scene.updateMatrixWorld(true);
  const records = projectileTargets.filter(record => !currentExplorationIsland() && (selectedArena === 'range'
    ? record.kind !== 'first-behemoth' : record.kind !== 'training-dummy' && encounterTouchable(record.boss ?? behemothState)));
  const objects = [...projectileObstacleMeshes, ...records.map(record => record.mesh)];
  const ray = new THREE.Raycaster();
  if (remoteHunter) {
    const { cameraYaw, pitch } = remoteHunter.input;
    ray.set(new THREE.Vector3(...playerState.position).add(new THREE.Vector3(0, 1.3, 0)), new THREE.Vector3(-Math.sin(cameraYaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(cameraYaw) * Math.cos(pitch)));
  } else ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  ray.far = 100;
  const cameraHit = selectRepeaterRayHit(ray.intersectObjects(objects, false), records);
  const aim = cameraHit?.point ?? ray.ray.at(100, new THREE.Vector3());
  const origin = new THREE.Vector3(playerState.position[0], playerState.position[1] + 1.3, playerState.position[2]);
  const direction = aim.clone().sub(origin).normalize();
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawOffset);
  const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
  direction.applyAxisAngle(right, pitchOffset);
  ray.set(origin, direction); ray.far = 25;
  const hit = selectRepeaterRayHit(ray.intersectObjects(objects, false), records);
  return { origin, end: hit?.point ?? origin.clone().addScaledVector(direction, 25),
    distance: hit?.distance ?? Infinity, record: hit && records.find(record => record.mesh === hit.object) };
}
function repeaterReloadSource() {
  if (currentExplorationIsland()) return null;
  scene.updateMatrixWorld(true);
  const origin = new THREE.Vector3(playerState.position[0], playerState.position[1] + 1.3, playerState.position[2]);
  let nearest = null;
  for (const record of projectileTargets) {
    if (selectedArena === 'range' ? record.kind === 'first-behemoth'
      : record.kind === 'training-dummy' || !encounterTouchable(record.boss ?? behemothState)) continue;
    const end = new THREE.Box3().setFromObject(record.mesh).clampPoint(origin, new THREE.Vector3());
    const distance = origin.distanceTo(end);
    if (distance <= REPEATER_TUNING.idealRange && (!nearest || distance < nearest.distance)) nearest = { end, distance };
  }
  return nearest;
}
function fireRepeaters(event) {
  for (let i = 0; i < event.pellets; i++) {
    const columns = event.pellets / 2;
    const yaw = event.pellets === 1 ? 0 : THREE.MathUtils.degToRad((i % columns) / (columns - 1) * event.spread - event.spread / 2);
    const pitch = event.pellets === 1 ? 0 : THREE.MathUtils.degToRad((i < columns ? -1 : 1) * event.verticalSpread / 2);
    const hit = repeaterAim(yaw, pitch);
    hit.record?.onDamage?.(event.damage * repeaterFalloff(hit.distance), { stagger: 0, interrupt: false, source: 'repeaters', damageModifiers: event.damageModifiers });
    const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([hit.origin, hit.end]),
      new THREE.LineBasicMaterial({ color: equipment.state.empowered > 0 ? '#68efff' : '#ffe9a0', transparent: true, opacity: .8 }));
    scene.add(mesh); rangedEffects.push({ mesh, remaining: .07 });
  }
  feedback.sound('swing');
}
function dropBuffMine(definition) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.24, .32, .14, 12),
    new THREE.MeshStandardMaterial({ color: '#58cfe1', emissive: '#187e91', emissiveIntensity: 1.5 }));
  const direction = new THREE.Vector3(-Math.sin(getCameraYaw()), 0, -Math.cos(getCameraYaw()));
  mesh.position.set(...playerState.position).addScaledVector(direction, 1);
  mesh.position.y += .1; scene.add(mesh);
  rangedEffects.push({ mesh, remaining: definition.lifetime, mine: definition, age: 0 });
}
// A tapered stream of the same cyan crystal motes used by Behemoth despawning.
function absorbEmpoweredReload(origin) {
  const count = 48;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const material = new THREE.PointsMaterial({ color: '#8ef5ef', size: .09,
    transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Points(geometry, material); mesh.frustumCulled = false;
  scene.add(mesh);
  rangedEffects.push({ mesh, remaining: .75, age: 0, absorption: origin.clone() });
  feedback.sound('reward');
}
function clearRangedEffects() {
  for (const effect of rangedEffects) { scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); }
  rangedEffects.length = 0;
}
function stepRangedEffects(dt) {
  for (let i = rangedEffects.length - 1; i >= 0; i--) {
    const effect = rangedEffects[i]; effect.remaining -= dt;
    if (effect.absorption && effect.remaining > 0) {
      effect.age += dt;
      player.updateMatrixWorld(true);
      const destinations = playerView.pistols.map(gun => gun.getWorldPosition(new THREE.Vector3()));
      const positions = effect.mesh.geometry.attributes.position;
      for (let j = 0; j < positions.count; j++) {
        const progress = THREE.MathUtils.clamp((effect.age / .75 - (j % 8) * .035) / .755, 0, 1);
        const destination = destinations[j % 2];
        const axis = destination.clone().sub(effect.absorption).normalize();
        const right = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0));
        if (right.lengthSq() < .001) right.set(1, 0, 0); else right.normalize();
        const up = new THREE.Vector3().crossVectors(right, axis).normalize();
        const angle = j * 2.399 + progress * 5;
        const radius = .65 * Math.sqrt((j + 1) / positions.count) * (1 - progress);
        const point = effect.absorption.clone().lerp(destination, progress)
          .addScaledVector(right, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius);
        positions.setXYZ(j, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;
      effect.mesh.material.opacity = .9 * Math.min(1, effect.remaining / .12);
    }
    if (effect.mine && effect.remaining > 0) {
      effect.age += dt;
      for (const collector of [playerState, ...buffCollectors]) {
        if (effect.age < .3 || collector.health <= 0 || !collector.position || !collector.statModifiers) continue;
        if (Math.hypot(collector.position[0] - effect.mesh.position.x, collector.position[2] - effect.mesh.position.z) > .65
          || Math.abs(collector.position[1] - effect.mesh.position.y) > .7) continue;
        addTimedStatModifier(collector.statModifiers, { source: 'repeater-haste', stat: 'attackSpeed',
          percent: effect.mine.attackSpeed, duration: effect.mine.buffDuration });
        effect.remaining = 0; feedback.sound('reward'); break;
      }
    }
    if (effect.remaining <= 0) {
      scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); rangedEffects.splice(i, 1);
    }
  }
}
const renderCombatHud = () => {
  playerState.familyAbility = { ...currentFamilyAbility(), charge: familyCombat.charge };
  playerState.chestplateAbility = { ...currentChestplateAbility(), ...chestplateCombat };
  if (remoteHunter) return;
  const ranged = equipment?.definition.kind === 'ranged';
  combatMantraDots?.parentElement.classList.toggle('hidden', equipment?.definition !== STRIKER_SWORD);
  document.querySelector('#repeaterHelp').classList.toggle('hidden', !ranged);
  const aimingRangedWeapon = ranged && equipment.definition.aimSource === 'camera';
  const aimingRangedSkill = equipment?.state.action?.special?.kind === 'ranged'
    && equipment.state.action.special.aimSource === 'camera'
    && !equipment.state.action.specialLaunched;
  const aiming = !isTown() && equipment && !equipment.state.sheathed && playerState.health > 0
    && !settingsOpen && !arenaScreen.classList.contains('hidden');
  document.querySelector('#repeaterReticle').hidden = !aiming || !aimingRangedWeapon;
  document.querySelector('.crosshair').hidden = !aiming || aimingRangedWeapon || !aimingRangedSkill && equipment?.state.airElapsed == null;

  playerHud.update(playerState, equipment);
  if (staminaFill && staminaBar && staminaValue) {
    const stamina = Math.max(0, Math.min(playerState.maxStamina, playerState.stamina));
    staminaFill.style.width = `${stamina / playerState.maxStamina * 100}%`;
    staminaBar.setAttribute('aria-valuemax', String(playerState.maxStamina));
    staminaBar.setAttribute('aria-valuenow', String(Math.round(stamina)));
    staminaValue.textContent = `${Math.round(stamina)} / ${playerState.maxStamina}`;
    staminaBar.classList.toggle('low', stamina <= playerState.maxStamina * .25);
  }
  if (!combatStatus) return;
  updateSettlementHud();
  islandStatus.classList.toggle('hidden', selectedArena !== 'island');
  if (selectedArena === 'island') {
    const e = islandEncounter;
    const livingBoss = e.boss.mode === 'defeated' && e.summon ? e.summon.boss : e.boss;
    const waiting = e.boss.mode === 'defeated' && !e.summon;
    const destination = waiting ? ISLAND.arenas[(e.index + 1) % ISLAND.arenas.length] : e.arena;
    const distance = Math.round(Math.hypot(playerState.position[0] - destination.center[0], playerState.position[2] - destination.center[2]));
    const activity = waiting ? 'Defeated / a new hunt is forming' : livingBoss.lifecycle === 'spawning' ? 'Behemoth arriving' : e.awareness === 'engaged' ? 'Behemoth alerted' : e.awareness === 'returning' ? 'Returning to its territory' : 'Behemoth roaming / approach to engage';
    islandStatus.textContent = `${definitionFor(livingBoss).name ?? 'Embermane'} / CINDERWILD ISLE\n${destination.name} / ${distance} m\n${activity}`;
    if (livingBoss.states.aetherCharge.active) islandStatus.textContent += `\n${narrative?.text(COMBAT_TEXT.aetherCharge.id) ?? COMBAT_TEXT.aetherCharge.value} ${Math.ceil(livingBoss.states.aetherCharge.remaining)}s`;
  }
  const state = equipment?.state;
  combatStatus.textContent = !state ? 'NO WEAPON EQUIPPED' : state.sheathed ? 'SHEATHED Â· ATTACK TO DRAW' : (state.lastEvent ?? equipment.definition.name).toUpperCase();
  for (const dot of combatMantraDots?.children ?? []) {
    const filled = Boolean(state?.mantras?.some((slot) => slot.source === dot.dataset.mantraSlot));
    dot.classList.toggle('filled', filled);
    dot.setAttribute('aria-pressed', String(filled));
  }
  const tempestRemaining = getStatModifierRemaining(playerState.statModifiers, 'tempest-form');
  combatResources.textContent = !state ? 'TEMPEST OFF Â· SURGE â€”' : `TEMPEST ${tempestRemaining > 0 ? `${tempestRemaining.toFixed(1)}S` : 'OFF'} Â· SURGE ${state.surgeReady ? `${(state.surgeAvailabilityRemaining ?? 0).toFixed(1)}S` : 'â€”'}`;
  if (ranged) combatResources.textContent = `AMMO ${state.ammo}/12 | ${state.action?.type === 'reload' ? 'RELOADING' : 'R RELOAD'} | EMPOWERED ${state.empowered.toFixed(1)}s`;
  if (equipment?.definition === CHAINBLADES) combatResources.textContent = `CHARGE ${state.charge}/100 | RESOURCES ${state.resources}/4`;
  if (!equipment) combatResources.textContent = '';
  const woundBuff = getStatModifierRemaining(playerState.statModifiers, 'wound-haste');
  if (woundBuff > 0) combatResources.textContent += ` | WOUND HASTE +15% ${woundBuff.toFixed(1)}s`;
  combatTargetStatus.textContent = selectedArena !== 'range' ? '' :
    `TRAINING DUMMY / INDESTRUCTIBLE\nCORE ${Math.round(trainingState.core)} / PART ${Math.round(trainingState.part)} / STAGGER ${Math.round(trainingState.stagger)} / WOUND ${Math.round(trainingState.wound)}\nDPS ${trainingDps(trainingState).toFixed(1)} / LAST ${Math.round(trainingState.lastHit)} / HITS ${trainingState.hits}`;
  behemothHud.classList.toggle('hidden', selectedArena !== 'island');
  if (selectedArena === 'island') {
    const health = Math.round(behemothState.health / BEHEMOTH.maxHealth * 100);
    const stagger = Math.round(behemothState.stagger / behemothState.staggerThreshold * 100);
    const parts = Object.entries(BEHEMOTH.parts).map(([id, definition]) => {
      const meter = behemothState.parts[id];
      return `<div>${definition.label.toUpperCase()} ${definition.woundable ? (meter.woundRemaining > 0 ? `WOUNDED ${meter.woundRemaining.toFixed(1)}s / ` : meter.woundSpent ? 'WOUND SPENT / ' : `WOUND HP ${Math.ceil(meter.woundHp)} / `) : ''}${meter.broken ? 'BROKEN' : `${Math.ceil(meter.damage)} / ${definition.health}`}</div><div class="meter part"><span style="width:${meter.damage / definition.health * 100}%"></span></div>`;
    }).join('');
    const enrage = behemothState.states.enrage;
    const enrageLabel = !BEHEMOTH.states.enrage.enabled ? '' : enrage.active ? `ENRAGED ${Math.ceil(enrage.remaining)}s` : enrage.pending ? 'ENRAGE PENDING' : `ENRAGE ${Math.ceil(enrage.buildup)} / ${BEHEMOTH.maxHealth * BEHEMOTH.states.enrage.damageFraction}`;
    const combatText = key => narrative?.text(COMBAT_TEXT[key].id) ?? COMBAT_TEXT[key].value;
    const charge = behemothState.states.aetherCharge;
    const elementalLabel = COMBAT_TEXT[behemothState.move] ? combatText(behemothState.move) : null;
    const statusLabels = `${charge.active ? `<div>${combatText('aetherCharge')} ${Math.ceil(charge.remaining)}s</div>` : ''}${playerState.burning ? `<div>${combatText('burning')} ${Math.ceil(playerState.burning.remaining)}s</div>` : ''}`;
    const stateLabel = behemothState.mode === 'defeated' ? 'BEHEMOTH DEFEATED'
      : playerState.health <= 0 ? 'HUNTER DOWN'
      : behemothState.mode === 'reaction' ? behemothState.move.replaceAll('-', ' ').toUpperCase()
      : isInterruptible(behemothState) ? 'HEAD OPEN â€” INTERRUPT NOW'
      : behemothState.mode === 'run-out-turn' ? 'PREPARING TO RUN OUT'
      : behemothState.mode === 'run-out' ? 'RUNNING TO THE PERIMETER'
      : behemothState.mode === 'turn-back' ? 'TURNING â€” CHARGE INCOMING'
      : elementalLabel && ['windup', 'active', 'recovery'].includes(behemothState.mode) ? elementalLabel
      : behemothState.mode === 'windup' ? `${behemothState.move.toUpperCase()} WINDUP`
      : behemothState.mode === 'observe' ? 'WATCHING THE HUNTER'
      : behemothState.mode === 'circle' ? 'CIRCLING'
      : behemothState.mode === 'retreat' ? 'CREATING SPACE' : '';
    const summon = islandEncounter.summon?.boss;
    const summonLabel = summon ? `<div><span>${definitionFor(summon).name}</span> ${Math.ceil(summon.health)} / ${Math.ceil(definitionFor(summon).maxHealth)}</div>` : '';
    behemothHud.innerHTML = `<div>${BEHEMOTH.name ?? 'Embermane'}</div><div>${selectedArena === 'island' ? islandEncounter.arena.name.toUpperCase() + ' / ' + (behemothState.lifecycle === 'alive' ? islandEncounter.awareness : behemothState.lifecycle).toUpperCase() : 'FIRST BEHEMOTH'}</div><div>${behemothState.mode === 'defeated' ? '' : enrageLabel}</div>${statusLabels}<div class="meter"><span style="width:${health}%"></span></div>${summonLabel}<div>STAGGER ${Math.ceil(behemothState.stagger)} / ${Math.ceil(behemothState.staggerThreshold)}</div><div class="meter stagger"><span style="width:${stagger}%"></span></div>${parts}<div class="player-health">HUNTER ${Math.ceil(playerState.health)} / ${playerState.maxHealth}</div><div class="state">${stateLabel}</div>`;
  }
};
const targetInMove = (move) => {
  if (selectedArena !== 'range') return false;
  const yaw = equipment?.state?.attackYaw ?? playerState.facingYaw;
  return sweptMeleeContact(move, yaw, playerState.position, playerState.position,
    [target.position.x, target.position.y, target.position.z], undefined, TRAINING_TARGET.radius, 1.2);
};
const behemothInMove = (move, interrupt = false, targetBoss = behemothState, targetView = behemothView) => {
  const behemothState = targetBoss;
  if (!encounterTouchable(behemothState)) return null;
  const yaw = equipment?.state?.action && Number.isFinite(equipment.state.attackYaw)
    ? equipment.state.attackYaw : playerState.facingYaw;
  return selectBehemothPart(move, yaw, playerState.position, playerState.position, behemothState.position, interrupt, targetBoss, targetView);
};
// Use the animated target volumes for every attack path. Broken parts stay eligible.
const selectBehemothPart = (move, yaw, from, to, bossFrom = behemothState.position, interrupt = false, targetBoss = behemothState, targetView = behemothView) => {
  const behemothState = targetBoss, behemothView = targetView, BEHEMOTH = definitionFor(targetBoss);
  behemothView.root.position.set(...behemothState.position);
  behemothView.root.rotation.y = behemothState.yaw;
  behemothView.root.updateMatrixWorld(true);
  const candidates = Object.entries(behemothView.hitboxes).filter(([part]) => !BEHEMOTH.parts[part]?.quills || !behemothState.parts[part].broken).map(([part, mesh]) => {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const current = [center.x, center.y - 1.05, center.z];
    const previous = current.map((v, i) => v + bossFrom[i] - behemothState.position[i]);
    const radius = Math.min(size.x, size.z) / 2;
    const touches = sweptMeleeContact(move, yaw, from, to, previous, current, radius, size.y / 2 + 0.45);
    const a = new THREE.Vector3(...previous).sub(new THREE.Vector3(...from));
    const b = new THREE.Vector3(...current).sub(new THREE.Vector3(...to));
    const delta = b.clone().sub(a);
    const t = delta.lengthSq() ? THREE.MathUtils.clamp(-a.dot(delta) / delta.lengthSq(), 0, 1) : 0;
    const distance = a.addScaledVector(delta, t).length() - radius;
    return { part, touches, distance };
  });
  // A broad interrupting swing can touch both a tusk and the head. The nearer
  // tusk must not hide a valid head contact during Quillshot's bombardment.
  if (interrupt && behemothState.speciesId === 'quillshot' && isInterruptible(behemothState)
    && candidates.some(c => c.part === 'head' && c.touches)) return 'head';
  return candidates.filter(c => c.touches).sort((a, b) => a.distance - b.distance)[0]?.part ?? null;
};

const stepEncounter = (dt, resolveContacts = () => {}) => {
  if (selectedArena !== 'island') return;
  if (online?.guest) return; // Incoming damage and AI are confirmed by the host.
  const burningDamage = stepBurning(playerState, dt);
  if (burningDamage) {
    consumeResource(playerState, 'health', burningDamage);
    presentImpact([playerState.position[0], playerState.position[1] + 1.5, playerState.position[2]], burningDamage, { outcome: 'hurt' });
    if (playerState.health <= 0) { playerState.burning = null; equipment?.definition.cancelAction?.(equipment.state); }
  }
  playerState.invulnerability = Math.max(0, playerState.invulnerability - dt);
  if (!online?.room && playerState.health <= 0 && encounterEnemies(islandEncounter).some(enemy => enemy.mode !== 'defeated')) return;
  const previousMode = behemothState.mode;
  const previousPosition = [...behemothState.position];
  const previousEnemyPositions = new Map(enemyRecords().map(r => [r.boss, [...r.boss.position]]));
  const previousId = islandEncounter.id;
  if (!remoteHunter) {
    const hunters = [{ id: online?.id ?? 'local', position: playerState.position, knockedDown: isRecovering(playerState), health: playerState.health },
      ...[...remoteHunters.values()].map(h => ({ id: h.id, position: h.playerState.position, knockedDown: isRecovering(h.playerState), health: h.playerState.health }))].filter(h => h.health > 0);
    // A defeated solo hunter still pauses their local encounter as before.
    islandEncounter = stepIslandEncounter(islandEncounter, hunters, dt);
  }
  behemothState = islandEncounter.boss;
  syncSummonView();
  if (previousId !== islandEncounter.id) {
    clearCellCombat();
    if (online?.host) for (const h of remoteHunters.values()) withHunter(h, clearCellCombat);
    syncEncounterView();
    for (const record of projectileTargets) if (record.kind === 'first-behemoth' && !record.boss) record.id = islandEncounter.id;
    for (const projectile of activeProjectiles) scene.remove(projectile.mesh);
    activeProjectiles.length = 0;
    equipment?.definition.onTargetRemoved?.(equipment.state, previousId);
  }
  // Player contact always resolves before damage from the newly moved enemy.
  resolveContacts(previousPosition, previousEnemyPositions);
  if (behemothState.mode === 'windup' && previousMode !== 'windup') feedback.sound('cue');
  for (const { boss: enemy } of enemyRecords()) {
    if (!encounterTouchable(enemy)) continue;
    const behemothState = enemy, BEHEMOTH = definitionFor(enemy);
    const contactOwner = remoteHunter?.id ?? online?.id ?? 'local';
    if (online?.host) {
      const key = contactKey(behemothState);
      if (behemothState.onlineContactKey !== key) { behemothState.onlineContactKey = key; behemothState.onlineHits = []; }
      behemothState.attackHit = behemothState.onlineHits.includes(contactOwner);
    }
    const meleeHit = behemothAttackTouchesPlayer(behemothState, playerState.position);
    // Stream fireballs stop at arena geometry before player contact is resolved.
    const blocked = new Set();
    for (const q of behemothState.impactEvents ?? []) if (q.kind === 'stream') {
      const delta = q.position.map((v, i) => v - q.previous[i]);
      const length = Math.hypot(...delta);
      if (length && movementCollisionWorld.raycast(q.previous, delta.map(v => v / length), length)) blocked.add(q.id);
    }
    if (blocked.size) {
      behemothState.projectiles = behemothState.projectiles.filter(q => !blocked.has(q.id));
      behemothState.impactEvents = behemothState.impactEvents.filter(q => !blocked.has(q.id));
    }
    const quillHit = behemothState.impactEvents?.find(q => quillImpactTouches(q, playerState.position));
    const contactingStreams = new Set((behemothState.impactEvents ?? []).filter(q => q.kind === 'stream' && quillImpactTouches(q, playerState.position)).map(q => q.id));
    if (contactingStreams.size) behemothState.projectiles = behemothState.projectiles.filter(q => !contactingStreams.has(q.id));
    if (meleeHit || quillHit) {
      if (meleeHit) { behemothState.attackHit = true; if (online?.host) behemothState.onlineHits.push(contactOwner); }
      const contactAttack = meleeHit ? behemothContactAttack(behemothState) : null;
      const incomingDamage = meleeHit ? contactAttack.damage : quillHit.damage;
      const rolling = playerState.movementAction === 'dodge' && playerState.actionTime > 0.08;
      activateEmbermane(playerState.statModifiers, currentFamilyAbility(), {
        contact: true, dodgeProtected: rolling, damage: incomingDamage,
        otherwiseProtected: equipment?.state.airHeight > 0 || isRecoveryProtected(playerState) || playerState.invulnerability > 0,
      });
      const dodgeHit = activateDodgeCells(cellCombat, playerState, currentCellLevels(), {
        contact: true, dodgeProtected: rolling, damage: incomingDamage,
        otherwiseProtected: equipment?.state.airHeight > 0 || isRecoveryProtected(playerState) || playerState.invulnerability > 0,
      }, resolveAttackDamage(equipment?.definition.basicAttack ?? {}, EQUIPMENT[materialInventory.equipment.equipped]?.damage ?? 0).stagger ?? 0);
      if (dodgeHit) damageBehemoth(0, { part: 'head', stagger: dodgeHit.stagger, interrupt: dodgeHit.interrupt, targetBoss: enemy, targetView: enemyRecords().find(r => r.boss === enemy).view });
      if (!rolling && !(equipment?.state.airHeight > 0) && !isRecoveryProtected(playerState) && playerState.invulnerability === 0) {
        const damageTaken = mitigateDamage(incomingDamage, armorDefense(materialInventory.armor));
        consumeResource(playerState, 'health', damageTaken);
        if (playerState.health > 0 && (meleeHit ? contactAttack.burning !== false && behemothState.speciesId === 'first-behemoth' && behemothState.states.aetherCharge.active : quillHit.burning)) applyBurning(playerState);
        chestplateCombat.pendingProjectile = null;
        chestplateCombat.commitment = 0;
        equipment?.definition.cancelAction?.(equipment.state);
        // Keep an unfulfilled Q hold through hit recovery; release/blur still clears it.
        pressedKeys.clear();
        // A hit during vulnerable get-up can start a new reaction.
        playerState.recovery = null;
        startKnockdown(playerState, behemothState.position);
        presentImpact([playerState.position[0], playerState.position[1] + 1.5, playerState.position[2]],
          damageTaken, { outcome: 'hurt' });
        playerBodyMaterial.emissive.set('#a23e36');
        playerBodyMaterial.emissiveIntensity = 0.85;
        if (playerState.health <= 0) equipment?.definition.cancelAction?.(equipment.state);
      }
    }
  }
  // The enemy moved after the player step; separate any new overlap before the next frame.
  const corrected = movementCollisionWorld.moveCapsule(playerState.position, [0, 0, 0], 0.36, 1.72);
  playerState.position = corrected.position;
};
const processWeaponStep = (dt) => {
  if (chestplateCombat.commitment > 0) return { locked: true, movementScale: 0, travelDelta: 0, events: [] };
  if (isTown()) return { locked: false, movementScale: 1, travelDelta: 0, events: [] };
  if (selectedArena === 'island' && playerState.health <= 0) return { locked: true, movementScale: 0, travelDelta: 0 };
  for (const [definition, state] of weaponStates) {
    if (definition !== equipment?.definition && definition.kind === 'ranged') definition.step(state, dt);
  }
  if (!equipment) return { locked: false, movementScale: 1, travelDelta: 0 };
  const state = equipment.state;
  if (equipment.definition.kind === 'ranged') {
    const aim = repeaterAim();
    if (!remoteHunter) {
      const reticle = document.querySelector('#repeaterReticle');
      reticle.dataset.tier = aim.record ? String(repeaterFalloff(aim.distance)) : '0';
      reticle.textContent = aim.record ? (aim.distance <= 8 ? '\u25ce' : '+') : '+';
    }
    if (basicFireHeld && !pressedKeys.has('dodge') && !state.action) handleAttackInput('light');
  }
  const attackSpeedMultiplier = getEffectiveStat(1, 'attackSpeed', playerState.statModifiers);
  launchFamilyAttack();
  const result = equipment.definition.step(state, dt, { attackSpeedMultiplier, spend: (amount) => spendStamina(playerState, amount) });
  launchFamilyAttack();
  result.events = resolveWeaponEvents(result.events, EQUIPMENT[materialInventory.equipment.equipped]?.damage ?? 20);
  for (const event of result.events) {
    if (event.type === 'empowered-reload') { absorbEmpoweredReload(new THREE.Vector3().fromArray(event.origin)); continue; }
    if (event.type === 'ranged-shot') { fireRepeaters(event); continue; }
    if (event.type === 'buff-mine') { dropBuffMine(event.definition); continue; }
    // Continuous attacks are resolved along movement and again after enemy travel.
    if (event.type === 'attack-active') continue;
    if (event.type === 'special-launch') { launchProjectile(event.projectile); feedback.sound('reward'); }
    if (event.type === 'attack-hit') feedback.sound('swing');
    const attackEvent = event.type === 'attack-hit';
    const bossHits = selectedArena === 'island' && attackEvent ? enemyRecords().map(r => ({ ...r, part: behemothInMove(event.move, event.interrupt, r.boss, r.view) })).filter(r => r.part) : [];
    const bossPart = bossHits[0]?.part;
    if (attackEvent && (selectedArena === 'island' ? bossPart : targetInMove(event.move))) {
      if (selectedArena === 'island') for (const hit of bossHits) damageBehemoth(event.move.damage, { part: hit.part, stagger: event.move.stagger, wound: event.move.wound, interrupt: event.interrupt, melee: equipment.definition.kind === 'melee', targetBoss: hit.boss, targetView: hit.view });
      else damageTrainingTarget(event.move.damage, { stagger: event.move.stagger, wound: event.move.wound });
      const confirmedEvent = event;
      if (equipment.definition.onHit?.(state, confirmedEvent) && event.ability === 'karma-breaker') state.lastEvent = 'Karma Breaker Â· damage over time';
    } else if (event.type === 'karma-tick') {
      if (selectedArena === 'island') damageBehemoth(event.damage, { stagger: event.stagger, periodic: true });
      else damageTrainingTarget(event.damage, { stagger: event.stagger, periodic: true });
    }
    else if (event.type === 'combo-complete') state.lastEvent = `${event.combo.name} Â· ${event.combo.mantra} mantra`;
  }
  renderCombatHud();
  return result;
};
const resolveContinuousContacts = (events, from, to, bossFrom = behemothState.position, enemyFrom = new Map()) => {
  if (selectedArena !== 'range' && selectedArena !== 'island') return;
  for (const event of events ?? []) {
    if (event.type !== 'attack-active' || event.action.hitRegistered) continue;
    const touches = (a, b, radius, height) => sweptMeleeContact(event.move, event.yaw, from, to, a, b, radius, height);
    let part = null, selectedEnemy = null;
    if (selectedArena === 'island') {
      for (const record of enemyRecords()) {
        if (!encounterTouchable(record.boss)) continue;
        part = selectBehemothPart(event.move, event.yaw, from, to, enemyFrom.get(record.boss) ?? (record.boss === behemothState ? bossFrom : record.boss.position), event.interrupt, record.boss, record.view);
        if (part) { selectedEnemy = record; break; }
      }
    } else {
      const center = [target.position.x, target.position.y + 0.14, target.position.z];
      if (touches(center, center, TRAINING_TARGET.radius, 1.2)) part = 'body';
    }
    if (!part) continue;
    event.action.hitRegistered = true;
    if (selectedArena === 'island') damageBehemoth(event.move.damage, { part, stagger: event.move.stagger, wound: event.move.wound, interrupt: event.interrupt, melee: equipment.definition.kind === 'melee', targetBoss: selectedEnemy.boss, targetView: selectedEnemy.view });
    else damageTrainingTarget(event.move.damage, { stagger: event.move.stagger, wound: event.move.wound });
    equipment.definition.onHit?.(equipment.state, { ...event, type: 'attack-hit' });
  }
};
const launchProjectile = (definition) => {
  const direction = definition.direction
    ? new THREE.Vector3(...definition.direction).normalize()
    : new THREE.Vector3(-Math.sin(definition.attackYaw), 0, -Math.cos(definition.attackYaw)).normalize();
  const mesh = new THREE.Group();
  const blade = definition.kind === 'quill'
    ? new THREE.Mesh(weaponQuillGeometry, weaponQuillMaterial)
    : new THREE.Mesh(crescentGeometry, crescentMaterial);
  if (definition.kind === 'quill') blade.rotation.x = Math.PI / 2;
  else {
  blade.scale.set(definition.width / crescentDimensions.width, 1, definition.depth / crescentDimensions.depth);
  const cuttingEdgeCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-crescentHalfWidth, 0.071, -crescentHalfDepth),
    new THREE.Vector3(0, 0.071, crescentHalfDepth * 3),
    new THREE.Vector3(crescentHalfWidth, 0.071, -crescentHalfDepth),
  );
  blade.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(cuttingEdgeCurve.getPoints(32)), crescentEdgeMaterial,
  ));
  }
  const collisionVolume = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(definition.width, definition.height, definition.depth)), projectileCollisionMaterial,
  );
  collisionVolume.visible = collisionVisibilityToggle.checked;
  mesh.add(blade, collisionVolume);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  scene.add(mesh);
  const position = new THREE.Vector3(playerState.position[0], playerState.position[1] + definition.centerHeight, playerState.position[2]);
  position.addScaledVector(new THREE.Vector3(-direction.z, 0, direction.x), definition.lateralOffset ?? 0);
  mesh.position.copy(position);
  activeProjectiles.push({ ...definition, direction, position, travelled: 0, hitTargets: new Set(), mesh, collisionVolume });
};
const stepProjectiles = (dt) => {
  const currentTargets = projectileTargets.filter((record) => !currentExplorationIsland() && (selectedArena === 'island'
    ? record.kind !== 'training-dummy' && encounterTouchable(record.boss ?? behemothState) : record.kind !== 'first-behemoth'));
  for (let index = activeProjectiles.length - 1; index >= 0; index -= 1) {
    const projectile = activeProjectiles[index];
    const distance = Math.min(projectile.speed * dt, projectile.range - projectile.travelled);
    let dissipate = distance <= 0;
    if (!dissipate) {
      const right = new THREE.Vector3(-projectile.direction.z, 0, projectile.direction.x).normalize();
      const rayHits = [];
      const widthOffsets = Array.from({ length: 9 }, (_, lane) => -projectile.width / 2 + lane * projectile.width / 8);
      const depthStart = projectile.position.clone().addScaledVector(projectile.direction, -projectile.depth / 2);
      const verticalOffsets = [-projectile.height / 2 + 0.01, 0, projectile.height / 2 - 0.01];
      for (const widthOffset of widthOffsets) {
        for (const heightOffset of verticalOffsets) {
          const origin = depthStart.clone().addScaledVector(right, widthOffset);
          origin.y += heightOffset;
          movementRaycaster.set(origin, projectile.direction);
          movementRaycaster.near = 0;
          movementRaycaster.far = distance + projectile.depth;
          const intersections = movementRaycaster.intersectObjects(
            [...projectileObstacleMeshes, ...currentTargets.map((record) => record.mesh)], false,
          );
          rayHits.push(...intersections.map((hit) => ({
            ...hit,
            dissipatingLane: Math.abs(widthOffset) <= projectile.dissipateWidth / 2,
          })));
        }
      }
      rayHits.sort((a, b) => a.distance - b.distance);
      // Crescent spans several rays; resolve its intersected head before another
      // part consumes the single hit allowed against this large target.
      const obstacleDistance = rayHits.find(hit => !currentTargets.some(r => r.mesh === hit.object))?.distance ?? Infinity;
      const interruptHeads = new Map();
      if (projectile.interrupt) for (const { boss, view } of enemyRecords()) {
        if (boss.speciesId === 'quillshot' && isInterruptible(boss)
          && rayHits.some(hit => hit.object === view.hitboxes.head && hit.distance < obstacleDistance)) {
          const head = currentTargets.find(r => r.mesh === view.hitboxes.head);
          if (head) interruptHeads.set(head.id, head);
        }
      }
      const hitThisStep = new Set();
      for (const hit of rayHits) {
        const record = currentTargets.find((candidate) => candidate.mesh === hit.object);
        if (!record) {
          if (hit.dissipatingLane) { dissipate = true; break; }
          continue;
        }
        if (projectile.hitTargets.has(record.id) || hitThisStep.has(record.id)) {
          if (record.sizeClass === 'large' && hit.dissipatingLane) { dissipate = true; break; }
          continue;
        }
        hitThisStep.add(record.id);
        projectile.hitTargets.add(record.id);
        const damageRecord = interruptHeads.get(record.id) ?? record;
        damageRecord.onDamage?.(projectile.damage, { source: projectile.id, interrupt: projectile.interrupt === true });
        if (projectile.kind === 'quill' || record.sizeClass === 'large' && hit.dissipatingLane) { dissipate = true; break; }
      }
      if (!dissipate) {
        projectile.position.addScaledVector(projectile.direction, distance);
        projectile.travelled += distance;
      }
    }
    if (dissipate || projectile.travelled >= projectile.range) {
      scene.remove(projectile.mesh);
      projectile.collisionVolume.geometry.dispose();
      activeProjectiles.splice(index, 1);
    } else projectile.mesh.position.copy(projectile.position);
  }
};
const getAttackYaw = () => {
  if (remoteHunter) return remoteHunter.input.attackYaw;
  const moveX = Number(heldKeys.has('d') || heldKeys.has('arrowright')) - Number(heldKeys.has('a') || heldKeys.has('arrowleft'));
  const moveY = Number(heldKeys.has('w') || heldKeys.has('arrowup')) - Number(heldKeys.has('s') || heldKeys.has('arrowdown'));
  if (Math.hypot(moveX, moveY) < 0.05) return playerState.immediateFacingYaw;
  const cameraYaw = getCameraYaw();
  const worldX = moveX * Math.cos(cameraYaw) + moveY * -Math.sin(cameraYaw);
  const worldZ = moveX * -Math.sin(cameraYaw) + moveY * -Math.cos(cameraYaw);
  return Math.atan2(-worldX, -worldZ);
};
const updateAttackVolume = () => {
  const state = equipment?.state;
  const action = state?.action;
  const move = action?.move;
  if (!collisionVisibilityToggle.checked || !move || state.sheathed || state.elapsed < move.startup || state.elapsed > move.startup + move.active) {
    attackVolume.visible = false;
    return;
  }
  if (attackVolumeMoveId !== move.id || attackVolumeArc !== move.arc || attackVolumeRange !== move.range) {
    attackVolume.clear();
    const start = Math.PI / 2 - THREE.MathUtils.degToRad(move.arc / 2);
    const sector = new THREE.CircleGeometry(move.range, 40, start, THREE.MathUtils.degToRad(move.arc));
    sector.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(sector, attackVolumeMaterial);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(sector), attackOutlineMaterial);
    attackVolume.add(mesh, edge);
    attackVolumeMoveId = move.id;
    attackVolumeArc = move.arc;
    attackVolumeRange = move.range;
  }
  const yaw = Number.isFinite(state.attackYaw) ? state.attackYaw : playerState.facingYaw;
  attackVolume.position.set(playerState.position[0] - Math.sin(yaw) * (move.originOffset ?? 0), 0.035, playerState.position[2] - Math.cos(yaw) * (move.originOffset ?? 0));
  attackVolume.rotation.y = yaw;
  attackVolume.visible = true;
};
const chainTarget = (yaw = equipment?.state.airElapsed != null ? getCameraYaw() : getAttackYaw()) => {
  if (isTown()) return null;
  if (currentExplorationIsland()) return null;
  const meshes = selectedArena === 'range' ? [targetCore] : enemyRecords().filter(r => encounterTouchable(r.boss)).flatMap(r => Object.entries(r.view.hitboxes).filter(([part]) => !definitionFor(r.boss).parts[part]?.quills || !r.boss.parts[part].broken).map(([, mesh]) => mesh));
  const origin = new THREE.Vector3(...playerState.position);
  return meshes.map(mesh => {
    mesh.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const dx = center.x - origin.x, dz = center.z - origin.z;
    const targetYaw = Math.atan2(-dx, -dz);
    const angle = Math.abs(Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw)));
    const size = box.getSize(new THREE.Vector3());
    return { distance: Math.max(0, Math.hypot(dx, dz) - Math.min(size.x, size.z) / 2), yaw: targetYaw, angle };
  }).filter(t => t.angle < Math.PI / 3).sort((a, b) => a.distance - b.distance)[0] ?? null;
};
const handleAttackInput = (input) => {
  if (chestplateCombat.commitment > 0) return false;
  if (isTown()) return false;
  if (isRecovering(playerState) || playerState.dodgeInputBlock > 0 || !equipment || playerState.movementAction === 'dodge' || playerState.movementAction === 'climb' || (selectedArena === 'island' && playerState.health <= 0)) return false;
  const reloadSource = equipment.definition.kind === 'ranged'
    && (input === 'reload' || input === 'light' && equipment.state.ammo === 0) ? repeaterReloadSource() : null;
  const result = equipment.definition.handleAttack(equipment.state, input, { attackYaw: equipment.state.airElapsed != null ? getCameraYaw() : getAttackYaw(), target: equipment.definition.targetContext ? chainTarget() : null, autoReload: remoteHunter ? remoteHunter.input.autoReload : document.querySelector('#autoReload').checked,
    idealRange: Boolean(reloadSource), reloadOrigin: reloadSource?.end.toArray(), spend: (amount) => spendStamina(playerState, amount) });
  if (result.type === 'unsheathed') basicFireHeld = false;
  launchFamilyAttack();
  if (result.type !== 'input-ignored') renderCombatHud();
  return result.type !== 'input-ignored';
};
weaponButton?.addEventListener('click', () => openEquipment());
renderer.domElement.addEventListener('mousedown', (event) => {
  if (arenaScreen.classList.contains('hidden') || mapTransitionActive || settingsOpen || chestplateCombat.commitment > 0) return;
  if (event.button === 0) { basicFireHeld = true; if (handleAttackInput('light')) sendOnlineAction({ attack: 'light' }); sendOnlineAction({ controls: true }); }
  if (event.button === 2) { event.preventDefault(); if (handleAttackInput('heavy')) sendOnlineAction({ attack: 'heavy' }); }
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

window.addEventListener('mouseup', event => { if (event.button === 0 && basicFireHeld) { basicFireHeld = false; sendOnlineAction({ controls: true }); } });
const clearInput = () => {
  basicFireHeld = false;
  heldKeys.clear();
  pressedKeys.clear();
  qHeldSince = null;
  qConsumed = false;
  if (online?.guest && !remoteHunter) sendOnlineAction({ resetInput: true });
};
const menuTabs = [...document.querySelectorAll('.menu-tab')];
const selectMenuTab = (id) => {
  for (const tab of menuTabs) {
    const selected = tab.id === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
  }
};
menuTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectMenuTab(tab.id));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || menuTabs.some(item => item.hidden)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? menuTabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + menuTabs.length) % menuTabs.length;
    selectMenuTab(menuTabs[next].id);
    menuTabs[next].focus();
  });
});
const syncMenuGameplay = () => {
  const playing = !arenaScreen.classList.contains('hidden');
  const languageSettings = document.querySelector('#settingsLanguageSelection');
  if (languageSettings) languageSettings.hidden = !playing;
  const town = playing && isTown();
  document.querySelector('#inventoryActions').hidden = !playing || (!town && selectedArena !== 'island');
  document.querySelector('#openInventoryButton').hidden = !town;
  document.querySelector('#openLootButton').hidden = !playing || selectedArena !== 'island';
  document.querySelector('#gameplayWeaponSettings').hidden = !playing;
  arenaSettings.hidden = !playing || town;
  document.querySelector('#gameplayTab').hidden = !playing;
  if (!playing) selectMenuTab('preferencesTab');
};
const setSettingsOpen = (open, restoreCamera = true) => {
  if (!open && cellView.open) cellView.close();
  if (!open && equipmentView.open) equipmentView.close();
  if (!open && inventoryView.open) inventoryView.close();
  settingsOpen = open;
  if (open) { pendingArena = selectedArena; syncArenaSelection(); }
  if (open && !settingsMenu.open) settingsMenu.showModal();
  else if (!open && settingsMenu.open) settingsMenu.close();
  syncMenuGameplay();
  if (open) selectMenuTab(arenaScreen.classList.contains('hidden') ? 'preferencesTab' : 'gameplayTab');
  controls.enabled = !open && arenaScreen.classList.contains('hidden');
  controls.autoRotate = controls.enabled;
  settingsToggle.setAttribute('aria-expanded', String(open));
  appShell.classList.toggle('settings-open', open);
  clearInput();
  if (!open && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (open) {
    altCursorHeld = false;
    relockOnFocus = false;
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    settingsClose.focus();
  } else if (restoreCamera && !arenaScreen.classList.contains('hidden')) requestCameraPointerLock();
};
settingsClose.addEventListener('click', () => setSettingsOpen(false));
settingsMenu.addEventListener('cancel', event => {
  event.preventDefault();
  resumeCameraAfterEscape = true;
  setSettingsOpen(false, false);
});
settingsToggle.addEventListener('click', () => setSettingsOpen(!settingsOpen));
const inventoryView = createInventoryView({ state: materialInventory, onExtract: persistMaterials, onBack: () => {
  inventoryView.close();
  setSettingsOpen(true);
  document.querySelector(isTown() ? '#openInventoryButton' : '#openLootButton').focus();
} });
const openMaterials = mode => {
  if (arenaScreen.classList.contains('hidden') || mapTransitionActive || (mode !== 'loot' ? !isTown() : selectedArena !== 'island')) return;
  setSettingsOpen(true);
  settingsMenu.close();
  inventoryView.show(mode);
};
document.querySelector('#openInventoryButton').addEventListener('click', () => openMaterials('player'));
document.querySelector('#openLootButton').addEventListener('click', () => openMaterials('loot'));
const cellView = createCellView({ inventory: materialInventory, area: () => selectedArena, narrative,
  onCreate: (id, rank) => { if (!createCell(materialInventory, id, rank, selectedArena)) return false; persistMaterials(); return true; },
  onBack: () => { cellView.close(); setSettingsOpen(true); },
});
const openCells = () => {
  if (arenaScreen.classList.contains('hidden') || mapTransitionActive || !isTown()) return;
  setSettingsOpen(true); settingsMenu.close(); cellView.show();
};
const equipmentView = createEquipmentView({ inventory: materialInventory, area: () => selectedArena,
  onEquip: id => {
    if (!equipItem(materialInventory.equipment, id, selectedArena)) return false;
    clearCellCombat();
    if (id === null) window.unequipWeapon(); else window.equipWeapon(window.availableWeapons[EQUIPMENT[id].type]);
    return true;
  },
  onEquipCell: (id, index, key) => {
    if (!equipCell(materialInventory, id, index, key, selectedArena)) return false;
    clearCellCombat(); renderCombatHud(); persistMaterials(); return true;
  },
  onEquipArmor: (id, slot) => {
    const previous = materialInventory.armor.equipped[slot];
    if (!equipArmor(materialInventory.armor, id, slot, selectedArena)) return false;
    if (previous !== id) clearCellCombat();
    if (slot === 'chestplate' && previous !== id) clearChestplateCombat();
    renderCombatHud();
    persistMaterials(); return true;
  },
  onUpgradeArmor: id => {
    if (!upgradeArmor(materialInventory, id, selectedArena)) return false;
    syncCellStats(playerState, currentCellLevels());
    renderCombatHud();
    persistMaterials(); return true;
  },
  onCraftArmor: id => {
    if (!craftArmor(materialInventory, id, selectedArena)) return false;
    persistMaterials(); return true;
  },
  onCraft: (id, crafter) => {
    if (!craftWeapon(materialInventory, id, crafter, selectedArena)) return false;
    persistMaterials(); return true;
  },
  onBack: () => { equipmentView.close(); setSettingsOpen(true); document.querySelector('#openEquipmentButton').focus(); },
});
const openEquipment = (crafter = null) => {
  if (arenaScreen.classList.contains('hidden') || mapTransitionActive || crafter && !isTown()) return;
  setSettingsOpen(true); settingsMenu.close(); equipmentView.show(crafter);
};
document.querySelector('#openEquipmentButton').addEventListener('click', () => openEquipment());

const releaseHunterQ = () => {
    if (!qConsumed && equipment && playerState.health > 0 && !isRecovering(playerState) && playerState.dodgeInputBlock <= 0 && !['dodge', 'climb'].includes(playerState.movementAction)) {
      const result = equipment.definition.useTapAbility?.(equipment.state, {
        attackYaw: getAttackYaw(),
        ability: equipment.definition.abilities?.tap,
      });
      if (result?.type !== 'unavailable') renderCombatHud();
    }
    qHeldSince = null;
    qConsumed = false;

};
const keyToAction = (event) => {
  const key = event.key.toLowerCase();
  if (!remoteHunter && !event.repeat && ['f', ' ', 'q', 'r', 'x', 'v'].includes(key)) sendOnlineAction({ key });
  if (chestplateCombat.commitment > 0) return;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'f', ' ', 'q', 'x', 'v'].includes(key)) event.preventDefault();
  if (arenaScreen.classList.contains('hidden') || mapTransitionActive) return;
  if (key === 'alt') {
    altCursorHeld = true;
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    syncPointerLockHint();
    return;
  }
  if (event.repeat || arenaScreen.classList.contains('hidden')) return;
  if (key === 'e' && isTown()) { interactSettlement(); return; }
  if (isTown() && ['q', 'r', 'x', 'v', ' '].includes(key)) return;
  if (key === 'v') {
    if (playerState.health <= 0 || isRecovering(playerState) || playerState.dodgeInputBlock > 0
      || ['dodge', 'climb'].includes(playerState.movementAction)) return;
    if (currentChestplateAbility()?.species === 'quillshot' && equipment?.state.action) return;
    const result = activateChestplateAbility(chestplateCombat, currentChestplateAbility(), playerState.statModifiers, playerState.facingYaw);
    if (result.activated && chestplateCombat.commitment > 0) clearInput();
    if (result.activated) { feedback.sound('reward'); renderCombatHud(); }
    return;
  }
  if (key === 'f') pressedKeys.add('jump');
  if (key === ' ') pressedKeys.add('dodge');
  if (key === 'x' && !isRecovering(playerState) && playerState.dodgeInputBlock <= 0 && equipment && equipment.state.action?.ability !== 'crescent-special') {
    equipment.definition.setSheathed(equipment.state, !equipment.state.sheathed);
    renderCombatHud();
  }
  if (equipment?.definition.kind === 'ranged' && ['q', 'r'].includes(key)) {
    event.preventDefault(); handleAttackInput(key === 'q' ? 'buff' : 'reload'); return;
  }
  if (key === 'q' && equipment?.definition.abilityInput === 'press') {
    if (!isRecovering(playerState) && playerState.grounded && playerState.health > 0
      && playerState.dodgeInputBlock <= 0 && !['dodge', 'climb'].includes(playerState.movementAction)) {
      equipment.definition.useTapAbility?.(equipment.state, { target: chainTarget(), attackYaw: getAttackYaw(), grounded: playerState.grounded });
      renderCombatHud();
    }
    return;
  }
  if (key === 'q') { qHeldSince = performance.now(); qConsumed = false; }
};

let targetRotationY = 0;
const resetEncounter = () => {
  huntEpoch++;
  feedback.clear();
  clearRangedEffects();
  weaponStates.clear();
  trainingState = createTrainingState();
  updateTrainingTargetView(trainingView, trainingState);
  Object.assign(playerState, createPlayerState());
  clearChestplateCombat();
  clearInput();
  const startingSpecies = ISLAND.roster[Math.floor(Math.random() * ISLAND.roster.length)];
  islandEncounter = createIslandEncounter(0, 1, startingSpecies);
  syncSummonView();
  behemothState = selectedArena === 'island' ? islandEncounter.boss : createBehemothState();
  syncEncounterView();
  for (const record of projectileTargets) if (record.kind === 'first-behemoth') record.id = selectedArena === 'island' ? islandEncounter.id : 'first-behemoth';
  clearCellCombat();
  playerState.health = playerState.maxHealth;
  playerState.stamina = playerState.maxStamina;
  playerState.invulnerability = 0;
  playerState.position = currentExplorationIsland() ? [...currentExplorationIsland().arrival] : isTown() ? [...currentTown().arrival] : selectedArena === 'island' ? [...ISLAND.arrival] : [0, -0.025, 1.5];
  playerState.lastGroundedPosition = [...playerState.position];
  playerState.velocity = [0, 0, 0];
  playerBodyMaterial.emissive.set('#000000');
  for (const projectile of activeProjectiles) scene.remove(projectile.mesh);
  activeProjectiles.length = 0;
  if (equipment) equipment.state = equipment.definition.createState();
  updateBehemothView(behemothView, behemothState, 1, collisionVisibilityToggle.checked);
  behemothView.root.visible = selectedArena === 'island';
  renderCombatHud();
};
resetArenaButton.addEventListener('click', () => {
  if (online?.guest) { onlineMenu.notify('resetHostOnly'); return; }
  resetEncounter();
  if (online?.host) resetRemoteHunters();
  setSettingsOpen(false);
});
let arenaLoadRequest = 0;
const applyArenaMode = async (mode, persist = true) => {
  const request = ++arenaLoadRequest;
  const destination = ['island', 'old-town', ...Object.keys(EXPLORATION_ISLANDS)].includes(mode) ? mode : 'range';
  await ensureMapLoaded(destination);
  if (request !== arenaLoadRequest) return;
  selectedArena = ['island', 'old-town', ...Object.keys(EXPLORATION_ISLANDS)].includes(mode) ? mode : 'range';
  if (isTown() && !arenaScreen.classList.contains('hidden')) { bankLoot(materialInventory); persistMaterials(); }
  arenaScreen.classList.toggle('safe-area', isTown());

  arena.visible = selectedArena === 'range';
  oldTownView.root.visible = selectedArena === 'old-town';
  islandView.visible = selectedArena === 'island';
  for (const [id, view] of explorationViews) view.visible = id === selectedArena;
  const scale = ARENA_SCALE;
  arena.scale.set(scale, 1, scale);

  for (const marker of markerMeshes) marker.visible = selectedArena === 'range';
  collisionVisuals.visible = selectedArena === 'range' && collisionVisibilityToggle.checked;
  target.visible = selectedArena === 'range';
  behemothView.root.visible = selectedArena === 'island';
  selectedArenaName.textContent = currentExplorationIsland()?.name ?? (isTown() ? currentTown().name : selectedArena === 'island' ? 'Cinderwild Isle' : 'Open Range');
  settlementPanel.hidden = true;
  arenaModeBadge.textContent = currentExplorationIsland()?.name ?? (isTown() ? currentTown().name.toUpperCase() : selectedArena === 'island' ? 'CINDERWILD ISLE' : 'TRAINING RANGE');
  arenaCaption.innerHTML = currentExplorationIsland() ? 'EXPLORATION ISLAND<br />NO BEHEMOTHS' : isTown() ? 'SURVIVORS AND SHELTER<br />E TO TALK' : selectedArena === 'island' ? 'TWO TERRITORIES<br />FOLLOW THE STONE PATHS' : 'ENCLOSED RANGE<br />OPEN APPROACH';
  controls.maxDistance = selectedArena !== 'range' ? 260 : 24;
  controls.minDistance = selectedArena === 'island' ? 16 : 4;
  controls.target.set(0, 1.2, 0);
  const previewDistance = currentExplorationIsland() ? 235 : selectedArena === 'old-town' ? 145 : selectedArena === 'island' ? 176 : 18;
  // Distant previews need more depth precision for the closely layered paths.
  camera.near = arenaScreen.classList.contains('hidden') ? 2 : 0.1;
  camera.far = selectedArena === 'range' ? 120 : 400;
  camera.updateProjectionMatrix();
  environment.setArena(isTown() || currentExplorationIsland() ? 'island' : selectedArena);
  camera.position.set(previewDistance * 0.67, previewDistance * 0.53, previewDistance * 0.75);
  controls.update();
  controls.saveState();
  rebuildArenaCollision();
  resetEncounter();
  if (!arenaScreen.classList.contains('hidden')) { applyWeaponCamera(); updateGameplayCamera(); }
  try { if (persist) localStorage.setItem(arenaStorageKey, selectedArena); } catch { /* Current selection remains active. */ }
};
// A modal overlay covers the HUD and other dialogs as well as the scene.
const gameplayMapFade = document.createElement('dialog');
gameplayMapFade.className = 'gameplay-map-fade';
gameplayMapFade.setAttribute('aria-label', 'Traveling to another map');
gameplayMapFade.addEventListener('cancel', event => event.preventDefault());
document.body.append(gameplayMapFade);
const fadeGameplayMap = async (from, to) => {
  const animation = gameplayMapFade.animate([{ opacity: from }, { opacity: to }], {
    duration: 800, easing: 'ease-in-out', fill: 'forwards',
  });
  await animation.finished;
  gameplayMapFade.style.opacity = String(to);
  animation.cancel();
};
const withFullscreenMapTransition = async (changeScreen) => {
  if (mapTransitionActive) return;
  mapTransitionActive = true;
  clearInput();
  if (settingsOpen) setSettingsOpen(false, false);
  gameplayMapFade.style.opacity = '0';
  gameplayMapFade.showModal();
  try {
    await fadeGameplayMap(0, 1);
    await changeScreen();
    // Let the destination render behind black before revealing it.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  } finally {
    try { await fadeGameplayMap(1, 0); }
    finally {
      gameplayMapFade.close();
      mapTransitionActive = false;
      clearInput();
    }
  }
};
const setArenaMode = async (mode, persist = true) => {
  if (mapTransitionActive) return;
  const destination = ['island', 'old-town', ...Object.keys(EXPLORATION_ISLANDS)].includes(mode) ? mode : 'range';
  if (arenaScreen.classList.contains('hidden') || destination === selectedArena) {
    return applyArenaMode(destination, persist);
  }
  return withFullscreenMapTransition(() => applyArenaMode(destination, persist));
};
settingsArenaOptions.forEach((option) => option.addEventListener('change', () => {
  pendingArena = option.value;
  syncArenaSelection();
}));
goToArenaButton.addEventListener('click', async () => {
  if (pendingArena === selectedArena) return;
  const destination = pendingArena;
  if (destination === 'island' || EXPLORATION_ISLANDS[destination]) { setSettingsOpen(false, false); onlineMenu.open(destination); return; }
  await leaveOnlineHunt();
  await setArenaMode(destination);
  setSettingsOpen(false);
});
const returnToSettlement = async () => {
  await leaveOnlineHunt();
  if (!isTown()) await setArenaMode('old-town');
  setSettingsOpen(false);
};
document.querySelector('#returnToSettlementButton').addEventListener('click', returnToSettlement);
await setArenaMode(selectedArena);
const savedEquipment = materialInventory.equipment.equipped;
if (savedEquipment === null) window.unequipWeapon();
else window.equipWeapon(window.availableWeapons[EQUIPMENT[savedEquipment].type]);
// Fade only the scene, leaving the start-page controls visible and usable.
const homeMapFade = document.createElement('div');
homeMapFade.className = 'home-map-fade';
homeMapFade.setAttribute('aria-hidden', 'true');
root.append(homeMapFade);
const homeMaps = ['range', 'island', 'old-town', ...Object.keys(EXPLORATION_ISLANDS)];
const homeMapInterval = 20000;
const homeMapFadeDuration = 800;
let homeMapDeadline = performance.now() + homeMapInterval;
let homeMapPhase = 'idle';
let homeMapPhaseStarted = 0;
let homeMapGeneration = 0;
const cancelHomeMapTransition = () => {
  homeMapGeneration++;
  arenaLoadRequest++;
  homeMapPhase = 'idle';
  homeMapFade.style.opacity = '0';
  homeMapDeadline = performance.now() + homeMapInterval;
};
const updateHomeMapPreview = (now) => {
  if (!arenaScreen.classList.contains('hidden') || enterButton.disabled) return;
  if (homeMapPhase === 'idle' && now >= homeMapDeadline) {
    homeMapPhase = 'out';
    homeMapPhaseStarted = now;
    homeMapDeadline = now + homeMapInterval;
  }
  if (homeMapPhase === 'out') {
    const progress = Math.min((now - homeMapPhaseStarted) / homeMapFadeDuration, 1);
    homeMapFade.style.opacity = String(progress);
    if (progress === 1) {
      homeMapPhase = 'loading';
      const generation = homeMapGeneration;
      const next = homeMaps[(homeMaps.indexOf(selectedArena) + 1) % homeMaps.length];
      setArenaMode(next, false).catch(error => {
        console.warn('Start-page map preview could not be loaded.', error);
      }).finally(() => {
        if (generation !== homeMapGeneration) return;
        homeMapPhase = 'in';
        homeMapPhaseStarted = performance.now();
      });
    }
  } else if (homeMapPhase === 'in') {
    const progress = Math.min((now - homeMapPhaseStarted) / homeMapFadeDuration, 1);
    homeMapFade.style.opacity = String(1 - progress);
    if (progress === 1) homeMapPhase = 'idle';
  }
};
const setScreen = (showArena) => {
  cancelHomeMapTransition();
  if (cellView.open) cellView.close();
  if (equipmentView.open) equipmentView.close();
  if (inventoryView.open) inventoryView.close();
  if (settingsMenu.open) settingsMenu.close();
  settingsOpen = false;
  resumeCameraAfterEscape = false;
  clearTimeout(pointerUnlockSettingsTimer);
  pointerUnlockSettingsTimer = null;
  settingsToggle.setAttribute('aria-expanded', 'false');
  appShell.classList.remove('settings-open');
  feedback.clear();
  homeScreen.classList.toggle('hidden', showArena);
  arenaScreen.classList.toggle('hidden', !showArena);
  syncMenuGameplay();
  appShell.classList.toggle('in-range', showArena);
  controls.enabled = !showArena;
  controls.autoRotate = !showArena;
  camera.near = showArena ? 0.1 : 2;
  camera.updateProjectionMatrix();
  if (showArena) {
    if (isTown()) { bankLoot(materialInventory); persistMaterials(); }
    document.activeElement?.blur();
    player.visible = true;
    target.visible = selectedArena === 'range';
    behemothView.root.visible = selectedArena === 'island';
    resetEncounter();
    applyWeaponCamera();
    if (selectedArena !== 'island') { cameraOrbit.azimuth = 0; updateGameplayCamera(); }
    requestCameraPointerLock();
    syncPointerLockHint();
  } else {
    player.visible = false;
    target.visible = selectedArena === 'range';
    behemothView.root.visible = selectedArena === 'island';
    altCursorHeld = false;
    relockOnFocus = false;
    appShell.classList.remove('pointer-locked');
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    controls.reset();
    camera.fov = selectedFov;
    camera.updateProjectionMatrix();
    clearInput();
    qHeldSince = null;
    qConsumed = false;
    movementAccumulator = 0;
    targetRotationY = arena.rotation.y;
  }
};
enterButton.addEventListener('click', async () => {
  enterButton.disabled = true;
  cancelHomeMapTransition();
  try {
    await withFullscreenMapTransition(async () => {
      if (!isTown()) await applyArenaMode('old-town');
      setScreen(true);
    });
    requestCameraPointerLock();
  } finally {
    enterButton.disabled = false;
  }
});
fovSlider.addEventListener('input', () => {
  selectedFov = Number(fovSlider.value);
  fovValue.value = `${selectedFov}Â°`;
  fovValue.textContent = `${selectedFov}Â°`;
  try {
    localStorage.setItem(fovStorageKey, String(selectedFov));
  } catch {
    // The current session still uses the selected value if storage is unavailable.
  }
  camera.fov = selectedFov;
  camera.updateProjectionMatrix();
});
window.addEventListener('keydown', (event) => {
  if (onlineMenu?.openNow) return;
  if (event.key === 'Escape') {
    if (cellView.open) {
      event.preventDefault();
      if (!event.repeat) { cellView.close(); setSettingsOpen(true); }
      return;
    }
    if (equipmentView.open) {
      event.preventDefault();
      if (!event.repeat) { equipmentView.close(); setSettingsOpen(true); }
      return;
    }
    if (inventoryView.open) {
      event.preventDefault();
      if (!event.repeat) { inventoryView.close(); setSettingsOpen(true); }
      return;
    }
    event.preventDefault();
    clearTimeout(pointerUnlockSettingsTimer);
    pointerUnlockSettingsTimer = null;
    lastSettingsEscape = performance.now();
    if (!event.repeat) {
      resumeCameraAfterEscape = settingsOpen;
      setSettingsOpen(!settingsOpen, false);
    }
    return;
  }
  if (arenaScreen.classList.contains('hidden') || mapTransitionActive || settingsOpen) return;
  if (event.target.closest?.('button, input, select, textarea, a')) return;
  if (chestplateCombat.commitment > 0) { event.preventDefault(); return; }
  keyToAction(event);
  heldKeys.add(event.key.toLowerCase());
  if (!event.repeat) sendOnlineAction({ controls: true });
});
window.addEventListener('keyup', (event) => {
  if (event.key === 'Escape' && resumeCameraAfterEscape) {
    resumeCameraAfterEscape = false;
    // Reacquire only after the browser has finished handling Escape's unlock.
    requestAnimationFrame(() => { if (!settingsOpen) requestCameraPointerLock(); });
  }
  const key = event.key.toLowerCase();
  if (heldKeys.delete(key)) sendOnlineAction({ controls: true });
  if (key === 'q' && qHeldSince !== null) {
    sendOnlineAction({ releaseQ: true });
    releaseHunterQ();
  }
  if (key === 'alt' && altCursorHeld) {
    altCursorHeld = false;
    if (!arenaScreen.classList.contains('hidden')) requestCameraPointerLock();
    syncPointerLockHint();
  }
});
window.addEventListener('blur', () => {
  clearInput();
  if (!arenaScreen.classList.contains('hidden')) {
    altCursorHeld = false;
    relockOnFocus = true;
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    syncPointerLockHint();
  }
});
window.addEventListener('focus', () => {
  if (!arenaScreen.classList.contains('hidden') && relockOnFocus && !altCursorHeld) requestCameraPointerLock();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });

const resize = () => {
  const width = root.clientWidth;
  const height = root.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};
window.addEventListener('resize', resize);

// Explicit hunter contexts reuse the existing combat/movement path for every peer.
// The synchronous try/finally boundary prevents a guest from changing local UI state.
const captureHunter = () => ({ playerState, playerView, player, playerBodyMaterial, equipment, equippedWeapon,
  materialInventory, cellCombat, familyCombat, chestplateCombat, heldKeys, pressedKeys,
  weaponStates, rangedEffects, activeProjectiles, basicFireHeld, qHeldSince, qConsumed });
const installHunter = h => {
  ({ playerState, playerView, player, playerBodyMaterial, equipment, equippedWeapon,
    materialInventory, cellCombat, familyCombat, chestplateCombat, heldKeys, pressedKeys,
    weaponStates, rangedEffects, activeProjectiles, basicFireHeld, qHeldSince, qConsumed } = h);
};
const withHunter = (h, action) => {
  const local = captureHunter(); remoteHunter = h;
  try { installHunter(h); return action(); }
  finally { Object.assign(h, captureHunter()); installHunter(local); remoteHunter = null; }
};
const localInventory = materialInventory;
const receivedRewards = new Set();
let rewardSequence = 0;
const rewardHistory = [];
const awardOnlineLoot = (id, boss) => {
  if (boss.lootAwarded) return;
  const reward = { sequence: ++rewardSequence, id, boss: plainState(boss) };
  rewardHistory.push(reward); if (rewardHistory.length > 128) rewardHistory.shift();
  collectDefeatLoot(localInventory, boss);
  // Each hunter owns an independent inventory, with the same confirmed encounter rewards.
  for (const h of remoteHunters.values()) collectDefeatLoot(h.materialInventory, { ...boss, lootAwarded: false });
  if (!remoteHunter) persistMaterials();
  else saveInventory(localInventory, { setItem: (key, value) => localStorage.setItem(key, value) });
};
const newRemoteHunter = (id, loadout) => {
  const inventory = createInventoryState(loadout);
  const definition = window.availableWeapons[EQUIPMENT[inventory.equipment.equipped]?.type];
  const view = createPlayerView(); scene.add(view.root);
  view.armor.color.set('#81d9ec'); view.root.name = `Online hunter ${id}`;
  const state = createPlayerState([...(currentExplorationIsland()?.arrival ?? ISLAND.arrival)]);
  const h = { id, playerState: state, playerView: view, player: view.root, playerBodyMaterial: view.armor,
    materialInventory: inventory, equipment: definition ? { definition, state: definition.createState() } : null,
    equippedWeapon: definition ?? null, cellCombat: createCellCombatState(), familyCombat: createFamilyAbilityState(),
    chestplateCombat: createChestplateAbilityState(), heldKeys: new Set(), pressedKeys: new Set(),
    weaponStates: new Map(), rangedEffects: [], activeProjectiles: [], basicFireHeld: false, qHeldSince: null, qConsumed: false,
    input: { keys: [], cameraYaw: 0, attackYaw: 0, aimYaw: 0, pitch: 0, autoReload: true }, actions: [],
    lastInput: performance.now(), rewardStart: rewardSequence, ackReward: rewardSequence, eventStart: onlineEventSequence, ackEvent: onlineEventSequence };
  syncCellStats(state, equipmentCellLevels(inventory)); state.health = state.maxHealth; state.stamina = state.maxStamina;
  buffCollectors.add(state); remoteHunters.set(id, h); return h;
};
const disposeRemoteHunter = id => {
  const h = remoteHunters.get(id); if (!h) return;
  onlinePresentation.remove(id); onlineMotionKeys.delete(id);
  buffCollectors.delete(h.playerState);
  scene.remove(h.player);
  const geometries = new Set(), materials = new Set();
  h.player.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) for (const m of Array.isArray(node.material) ? node.material : [node.material]) materials.add(m); });
  for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
  for (const p of h.activeProjectiles) scene.remove(p.mesh);
  withHunter(h, clearRangedEffects);
  remoteHunters.delete(id);
};
const clearRemoteHunters = () => { for (const id of [...remoteHunters.keys()]) disposeRemoteHunter(id); };
const resetRemoteHunters = () => {
  for (const h of [...remoteHunters.values()]) {
    const { id, materialInventory: loadout, rewardStart, ackReward } = h;
    disposeRemoteHunter(id); const next = newRemoteHunter(id, loadout);
    next.rewardStart = rewardStart; next.ackReward = ackReward;
  }
};
const onlineInput = () => {
  const direction = new THREE.Vector3(); camera.getWorldDirection(direction);
  const paused = settingsOpen || onlineMenu?.openNow || document.hidden;
  return { time: performance.now(), keys: paused ? [] : [...heldKeys], cameraYaw: getCameraYaw(), attackYaw: getAttackYaw(), aimYaw: lastOnlineAimYaw,
    pitch: Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)), fire: !paused && basicFireHeld, autoReload: autoReloadToggle.checked };
};
const sendOnlineAction = action => {
  if (online?.guest && !remoteHunter) online.send('action', { action, input: onlineInput() });
};
const acceptOnlineInput = (h, input) => {
  const keys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
  if (!input || !Array.isArray(input.keys) || input.keys.length > 16 || !['cameraYaw', 'attackYaw', 'aimYaw', 'pitch'].every(k => Number.isFinite(input[k]) && Math.abs(input[k]) < 100000)) return false;
  if (Number.isFinite(input.time) && input.time < (h.input.time ?? -Infinity)) return true;
  h.input = { ...input, keys: input.keys.filter(k => keys.has(k)), pitch: THREE.MathUtils.clamp(input.pitch, -1.5, 1.5) };
  h.lastInput = performance.now(); return true;
};
const stepRemoteHunters = dt => {
  for (const h of remoteHunters.values()) withHunter(h, () => {
    const active = performance.now() - h.lastInput < 750;
    heldKeys = new Set(active ? h.input.keys : []); basicFireHeld = active && h.input.fire;
    if (!active) { qHeldSince = null; qConsumed = false; }
    for (const action of h.actions.splice(0, 32)) {
      if (action.resetInput) clearInput();
      else if (action.attack === 'light' || action.attack === 'heavy') handleAttackInput(action.attack);
      else if (['f', ' ', 'q', 'r', 'x', 'v'].includes(action.key)) keyToAction({ key: action.key, repeat: false, preventDefault() {} });
      else if (action.releaseQ) releaseHunterQ();
    }
    const x = Number(heldKeys.has('d') || heldKeys.has('arrowright')) - Number(heldKeys.has('a') || heldKeys.has('arrowleft'));
    const y = Number(heldKeys.has('w') || heldKeys.has('arrowup')) - Number(heldKeys.has('s') || heldKeys.has('arrowdown'));
    simulateHunter(dt, x, y, h.input.cameraYaw, h.input.aimYaw);
    pressedKeys.clear(); updatePlayerView(playerView, playerState, equipment, dt);
  });
};
const applyOnlineWorld = data => {
  if (!data?.encounter || !Array.isArray(data.hunters)) return;
  if (!Number.isFinite(data.time) || data.time <= lastWorldTime) return;
  if (lastOnlineEpoch !== data.epoch) {
    lastOnlineEpoch = data.epoch;
    onlinePresentation.clear();
    clearCellCombat(); clearChestplateCombat(); clearInput();
    if (equipment) equipment.state = equipment.definition.createState();
    for (const p of activeProjectiles) scene.remove(p.mesh);
    activeProjectiles.length = 0; clearRangedEffects();
  }
  lastWorldTime = data.time;
  latestConfirmedWorld = plainState(data);
  receiveOnlinePresentation(data, true);
  receiveCombatEvents([...(data.events ?? []), ...pendingCombatEvents.splice(0)], data.eventStart);
  const oldId = islandEncounter.id, oldSpecies = islandEncounter.speciesId;
  islandEncounter = restoreEncounter(data.encounter, islandEncounter); behemothState = islandEncounter.boss;
  if (oldId !== islandEncounter.id || oldSpecies !== islandEncounter.speciesId) {
    if (oldId !== islandEncounter.id) onlinePresentation.remove(oldId);
    syncEncounterView(); clearCellCombat();
    for (const p of activeProjectiles) scene.remove(p.mesh); activeProjectiles.length = 0;
  }
  syncSummonView();
  const ids = new Set();
  for (const hunter of data.hunters) {
    if (!hunter.player?.position || !hunter.player.position.every(Number.isFinite)) continue;
    if (hunter.id === online.id) {
      for (const key of ['health', 'maxHealth', 'maxStamina', 'stamina', 'shields', 'burning', 'recovery', 'invulnerability', 'statModifiers', 'cellStatus']) playerState[key] = hunter.player[key];
      if (equipment && hunter.weapon) for (const key of ['ammo', 'empowered', 'mantras', 'surgeReady', 'surgeAvailabilityRemaining', 'resources', 'charge']) {
        if (Object.hasOwn(hunter.weapon, key)) equipment.state[key] = hunter.weapon[key];
      }
      if (hunter.player.familyAbility) familyCombat.charge = hunter.player.familyAbility.charge;
      // Prediction stays responsive; reconcile substantial divergence against host collision.
      if (Math.hypot(...playerState.position.map((v, i) => v - hunter.player.position[i])) > 1.5) {
        playerState.position = [...hunter.player.position]; playerState.velocity = [...hunter.player.velocity];
      }
      continue;
    }
    ids.add(hunter.id);
    let h = remoteHunters.get(hunter.id);
    if (!h) h = newRemoteHunter(hunter.id, hunter.loadout);
    h.targetPlayer = hunter.player;
    if (hunter.equipped !== h.materialInventory.equipment.equipped) {
      h.materialInventory = createInventoryState(hunter.loadout);
    }
    const definition = window.availableWeapons[EQUIPMENT[hunter.equipped]?.type];
    h.equipment = definition ? { definition, state: hunter.weapon } : null;
  }
  for (const id of remoteHunters.keys()) if (!ids.has(id)) disposeRemoteHunter(id);
  for (const reward of data.rewards ?? []) {
    const key = `${online.room.id}:${reward.sequence}`;
    if (!receivedRewards.has(key)) {
      collectDefeatLoot(localInventory, { ...reward.boss, lootAwarded: false }); persistMaterials(); receivedRewards.add(key);
      confirmedRewardHistory.push(plainState(reward));
      if (confirmedRewardHistory.length > 128) confirmedRewardHistory.shift();
    }
    onlineRewardAck = Math.max(onlineRewardAck, reward.sequence);
  }
  renderCombatHud();
};
let onlineRewardAck = 0;
const receiveCombatEvents = (events, start = null) => {
  if (Number.isSafeInteger(start)) onlineEventAck = Math.max(onlineEventAck, start);
  for (const event of events) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= onlineEventAck || onlineEventSeen.has(event.sequence)) continue;
    if (event.epoch > lastOnlineEpoch) { pendingCombatEvents.push(event); continue; }
    if (!Array.isArray(event.point) || event.point.length !== 3 || !event.point.every(Number.isFinite) || !Number.isFinite(event.damage)) continue;
    onlineEventSeen.add(event.sequence);
    confirmedEventHistory.push(plainState(event));
    if (confirmedEventHistory.length > 256) confirmedEventHistory.shift();
    if (event.epoch === lastOnlineEpoch) feedback.impact(event.point, event.damage, event.details);
  }
  while (onlineEventSeen.has(onlineEventAck + 1)) onlineEventAck++;
  // Retain a bounded window for deduplication, including snapshots arriving after events.
  for (const id of onlineEventSeen) if (id < onlineEventAck - 512) onlineEventSeen.delete(id);
};
const receiveOnlinePresentation = (data, snapshot) => {
  const receiveBoss = (id, boss) => {
    onlinePresentation.receive(id, boss, null, data.time, { snapshot });
    if (data.time >= (latestOnlineBosses.get(id)?.time ?? -Infinity)) latestOnlineBosses.set(id, { time: data.time, boss: plainState(boss) });
  };
  const visit = encounter => {
    if (!encounter) return;
    receiveBoss(encounter.id, encounter.boss);
    visit(encounter.summon);
  };
  visit(data.encounter);
  for (const entry of data.bosses ?? []) receiveBoss(entry.id, entry.boss);
  for (const hunter of data.hunters ?? []) if (hunter.id !== online.id) {
    onlinePresentation.receive(hunter.id, hunter.player, hunter.weapon, data.time, { snapshot });
  }
};
const updateOnlinePresentation = dt => {
  if (!online?.guest) return;
  for (const h of remoteHunters.values()) {
    const pose = onlinePresentation.sample(h.id); if (!pose) continue;
    Object.assign(h.playerState, pose.state);
    const equipment = h.equipment ? { ...h.equipment, state: pose.weapon ?? h.equipment.state } : null;
    updatePlayerView(h.playerView, h.playerState, equipment, dt);
  }
};
const onlineBossPose = (id, boss) => {
  const pose = online?.guest ? onlinePresentation.sample(id)?.state : null;
  return pose && pose.speciesId === boss.speciesId ? { ...pose, definition: boss.definition } : boss;
};
// Observe authoritative action changes every simulation tick, rather than waiting for a snapshot.
const publishOnlineMotion = () => {
  if (!online?.host) return;
  const bosses = [], hunters = [];
  const check = (id, state, weapon = null) => {
    const key = motionKey(state, weapon), elapsed = weapon?.elapsed ?? state.elapsed;
    const old = onlineMotionKeys.get(id);
    const changed = !old || old.key !== key || elapsed < old.elapsed;
    onlineMotionKeys.set(id, { key, elapsed });
    return changed;
  };
  const visit = encounter => { if (encounter) {
    if (check(encounter.id, encounter.boss)) bosses.push({ id: encounter.id, boss: plainState(encounter.boss) });
    visit(encounter.summon);
  } };
  visit(islandEncounter);
  const local = { id: online.id, playerState, equipment, materialInventory: localInventory };
  for (const h of [local, ...remoteHunters.values()]) if (check(h.id, h.playerState, h.equipment?.state)) {
    hunters.push({ id: h.id, player: plainState(h.playerState), weapon: h.equipment ? plainState(h.equipment.state) : null });
  }
  if (bosses.length || hunters.length) online.broadcast('motion', { time: performance.now(), epoch: huntEpoch, bosses, hunters });
};
const onlineHunters = () => [{ id: online.id, player: plainState(playerState), equipped: localInventory.equipment.equipped,
  weapon: equipment ? plainState(equipment.state) : null, loadout: networkLoadout(localInventory) },
  ...[...remoteHunters.values()].map(h => ({ id: h.id, player: plainState(h.playerState), equipped: h.materialInventory.equipment.equipped,
    weapon: h.equipment ? plainState(h.equipment.state) : null, loadout: networkLoadout(h.materialInventory) }))];
const leaveOnlineHunt = async () => { onlinePresentation.clear(); onlineMotionKeys.clear(); if (online?.room) await online.leave(); clearRemoteHunters(); pendingWorld = null; latestConfirmedWorld = null; };
online = new OnlineConnection();
online.addEventListener('packet', ({ detail: { peer, type, data } }) => {
  try {
    if (online.host) {
      if (type === 'loadout' && !remoteHunters.has(peer)) { newRemoteHunter(peer, data); return; }
      const h = remoteHunters.get(peer); if (!h) return;
      if (type === 'input') {
        acceptOnlineInput(h, data);
        if (Number.isSafeInteger(data.ackEvent)) h.ackEvent = Math.min(onlineEventSequence, Math.max(h.ackEvent, data.ackEvent));
        if (Number.isSafeInteger(data.ackReward)) h.ackReward = Math.min(rewardSequence, Math.max(h.ackReward, data.ackReward));
      }
      if (type === 'action' && acceptOnlineInput(h, data.input) && h.actions.length < 32 && data.action && typeof data.action === 'object') h.actions.push(data.action);
    } else if (online.guest && peer === online.room?.host && type === 'combat') {
      if (onlineStarting || lastOnlineEpoch !== data.epoch) pendingCombatEvents.push(data);
      else receiveCombatEvents([data]);
      if (pendingCombatEvents.length > 256) pendingCombatEvents.shift();
    } else if (online.guest && peer === online.room?.host && type === 'motion') {
      if (!onlineStarting && lastOnlineEpoch === data.epoch) receiveOnlinePresentation(data, false);
    } else if (online.guest && peer === online.room?.host && type === 'world') {
      if (onlineStarting || selectedArena !== online.room.map) pendingWorld = data;
      else applyOnlineWorld(data);
    }
  } catch (error) { console.warn('Ignored invalid online packet:', error.message); }
});
online.addEventListener('peer-left', ({ detail }) => disposeRemoteHunter(detail));
online.addEventListener('room', ({ detail }) => { if (!detail) { clearRemoteHunters(); onlinePresentation.clear(); onlineMotionKeys.clear(); } });
online.addEventListener('fallback', () => {
  clearRemoteHunters(); pendingWorld = null;
  // A behavior event can be newer than the last periodic snapshot. Resume that confirmed action.
  const snapshot = plainState(islandEncounter);
  const restoreLatest = encounter => {
    if (!encounter) return;
    if (latestOnlineBosses.has(encounter.id)) encounter.boss = latestOnlineBosses.get(encounter.id).boss;
    restoreLatest(encounter.summon);
  };
  restoreLatest(snapshot);
  islandEncounter = restoreEncounter(snapshot, islandEncounter); behemothState = islandEncounter.boss;
  latestOnlineBosses.clear();
  for (const boss of encounterEnemies(islandEncounter)) boss.attackHit = boss.onlineHits?.includes(online.id) ?? false;
  // No reset: the last confirmed boss action, timers, projectiles and meters continue locally.
});
online.addEventListener('handover', () => {
  lastWorldTime = -Infinity;
  onlinePresentation.clear(); onlineMotionKeys.clear(); latestOnlineBosses.clear();
  online.send('loadout', networkLoadout(localInventory));
});
online.addEventListener('promoted', () => {
  const snapshot = latestConfirmedWorld;
  if (!snapshot?.encounter || !Array.isArray(snapshot.hunters)) return;
  const encounter = plainState(snapshot.encounter);
  const restoreLatest = current => {
    if (!current) return;
    const newer = latestOnlineBosses.get(current.id);
    if (newer?.time >= snapshot.time) current.boss = plainState(newer.boss);
    restoreLatest(current.summon);
  };
  restoreLatest(encounter);
  islandEncounter = restoreEncounter(encounter, islandEncounter); behemothState = islandEncounter.boss;
  huntEpoch = snapshot.epoch;
  onlineEventSequence = Math.max(onlineEventSequence, onlineEventAck, snapshot.eventSequence ?? 0);
  rewardSequence = Math.max(rewardSequence, onlineRewardAck, snapshot.rewardSequence ?? 0);
  onlineEventHistory.splice(0, onlineEventHistory.length, ...confirmedEventHistory);
  rewardHistory.splice(0, rewardHistory.length, ...confirmedRewardHistory);
  for (const hunter of snapshot.hunters) {
    if (hunter.id === online.id) {
      Object.assign(playerState, hunter.player);
      if (equipment && hunter.weapon) Object.assign(equipment.state, hunter.weapon);
      continue;
    }
    if (!online.peers.has(hunter.id) || hunter.id === snapshot.host) { disposeRemoteHunter(hunter.id); continue; }
    const h = remoteHunters.get(hunter.id) ?? newRemoteHunter(hunter.id, hunter.loadout);
    Object.assign(h.playerState, hunter.player);
    h.materialInventory = createInventoryState(hunter.loadout);
    const definition = window.availableWeapons[EQUIPMENT[hunter.equipped]?.type];
    h.equipment = definition ? { definition, state: hunter.weapon ?? definition.createState() } : null;
    h.lastInput = performance.now();
  }
  for (const id of [...remoteHunters.keys()]) if (!online.peers.has(id)) disposeRemoteHunter(id);
  latestOnlineBosses.clear(); onlinePresentation.clear(); onlineMotionKeys.clear();
  syncEncounterView(); syncSummonView(); renderCombatHud();
});
online.addEventListener('directory-offline', () => { if (online.room) onlineMenu.notify('directoryOffline'); });
onlineMenu = createOnlineMenu({ connection: online, narrative,
  settingsParent: document.querySelector('#preferencesPanel'),
  onModal(open) {
    clearInput();
    clearTimeout(pointerUnlockSettingsTimer);
    if (open && settingsOpen) setSettingsOpen(false, false);
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (!open) requestCameraPointerLock();
  },
  async onPrivate(map) { await leaveOnlineHunt(); await setArenaMode(map); setSettingsOpen(false); },
  async onGroup(room, creator) {
    onlineStarting = true; pendingWorld = null; latestConfirmedWorld = null; onlineRewardAck = 0; onlineEventAck = 0; onlineEventSeen.clear(); confirmedEventHistory.length = 0; confirmedRewardHistory.length = 0; pendingCombatEvents = []; lastWorldTime = -Infinity; onlinePresentation.clear(); onlineMotionKeys.clear(); latestOnlineBosses.clear(); lastOnlineEpoch = null; receivedRewards.clear();
    try {
      await setArenaMode(room.map); setSettingsOpen(false, false);
      if (!creator) {
        online.send('loadout', networkLoadout(localInventory));
        const deadline = performance.now() + 7000;
        while (!pendingWorld && performance.now() < deadline && online.room) await new Promise(resolve => setTimeout(resolve, 30));
        if (!pendingWorld || !online.room) throw new Error('peer-unreachable');
        applyOnlineWorld(pendingWorld); pendingWorld = null;
      }
    } finally { onlineStarting = false; }
  },
});
let onlineTick = 0;
setInterval(() => {
  if (!online.room || onlineStarting) return;
  if (online.guest) online.send('input', { ...onlineInput(), ackReward: onlineRewardAck, ackEvent: onlineEventAck });
  else if (online.host && ++onlineTick % 2 === 0) {
    const hunters = onlineHunters();
    const encounter = plainState(islandEncounter);
    for (const h of remoteHunters.values()) online.send('world', { time: performance.now(), encounter, hunters, epoch: huntEpoch,
      eventSequence: onlineEventSequence, rewardSequence,
      eventStart: h.eventStart, events: onlineEventHistory.filter(e => e.sequence > h.eventStart && e.sequence > h.ackEvent),
      rewards: rewardHistory.filter(r => r.sequence > h.rewardStart && r.sequence > h.ackReward) }, h.id);
  }
}, 50);
window.addEventListener('pagehide', () => { online.leave(); });

const timer = new THREE.Timer();
timer.connect(document);
const movementStep = 1 / 60;
let movementAccumulator = 0;

// Both local prediction and host simulation of guests execute this same path.
const simulateHunter = (movementStep, moveX, moveY, cameraYaw, aimYaw) => {
  const chestplateCommitted = chestplateCombat.commitment > 0;
      stepStatModifiers(playerState.statModifiers, movementStep);
      syncCellStats(playerState, currentCellLevels());
      stepShields(playerState, movementStep);
      stepFamilyAbility(familyCombat, currentFamilyAbility(), movementStep);
      const chestplateProjectile = stepChestplateAbility(chestplateCombat, currentChestplateAbility(), movementStep);
      if (chestplateProjectile) for (const projectile of chestplateProjectile) launchProjectile(projectile);
      stepRangedEffects(movementStep);
      if (selectedArena === 'range') stepTrainingTarget(trainingState, movementStep);
      if (!chestplateCommitted && qHeldSince !== null && !qConsumed && performance.now() - qHeldSince >= 300 && equipment && playerState.health > 0 && !isRecovering(playerState) && playerState.dodgeInputBlock <= 0 && !['dodge', 'climb'].includes(playerState.movementAction)) {
        const result = equipment.definition.useTechnique?.(equipment.state, {
          attackYaw: playerState.facingYaw,
          cameraYaw,
          groundNormal: movementCollisionWorld.raycast(
            [playerState.position[0], playerState.position[1] + 0.5, playerState.position[2]],
            [0, -1, 0], 1,
          )?.normal ?? [0, 1, 0],
          spend: (amount) => spendStamina(playerState, amount),
          addStatModifier: (modifier) => addTimedStatModifier(playerState.statModifiers, modifier),
          special: equipment.definition.specials?.threeMantra,
        });
        // A busy weapon must not consume the hold: retry until it can activate.
        if (result && result.type !== 'unavailable') {
          qConsumed = true;
          renderCombatHud();
        }
      }
      const wasPhasingEnemies = equipment?.state?.action?.move?.phaseEnemies === true;
      const weaponTick = processWeaponStep(movementStep);
      const resolveTravel = (from, to) => resolveContinuousContacts(weaponTick.events, from, to);
      resolveTravel(playerState.position, playerState.position);
      const attackYaw = equipment?.state?.action && Number.isFinite(equipment.state.attackYaw)
        ? equipment.state.attackYaw
        : aimYaw;
      const previousMovementAction = playerState.movementAction;
      stepPlayer(playerState, {
        moveX: chestplateCommitted ? 0 : moveX * weaponTick.movementScale,
        moveY: chestplateCommitted ? 0 : moveY * weaponTick.movementScale,
        attackLocked: chestplateCommitted || weaponTick.locked && !weaponTick.allowMove,
        sprintHeld: !chestplateCommitted && heldKeys.has('shift') && !weaponTick.locked,
        sprintCostsStamina: Boolean(equipment && !equipment.state.sheathed),
        cameraYaw,
        aimYaw: attackYaw,
        facingMode: equipment?.state?.sheathed ? 'travel' : undefined,
        facingYaw: chestplateCommitted ? chestplateCombat.yaw : equipment?.state?.action && Number.isFinite(equipment.state.attackYaw) ? equipment.state.attackYaw : undefined,
        jumpPressed: !chestplateCommitted && !weaponTick.locked && pressedKeys.has('jump'),
        dodgePressed: !isTown() && !chestplateCommitted && !weaponTick.locked && pressedKeys.has('dodge'),
      }, movementStep, {
        colliders: ARENA_COLLIDERS,
        collisionWorld: movementCollisionWorld,
        fallResetPosition: currentExplorationIsland()?.arrival ?? (isTown() ? currentTown().arrival : null),
        floorBounds: selectedArena !== 'range'
          ? { minX: -75, maxX: 75, minZ: -75, maxZ: 75, y: -0.025 }
          : undefined,
        weapon: equippedWeapon,
        staminaState: playerState,
      });
      if (playerState.movementAction !== previousMovementAction && ['dodge', 'climb'].includes(playerState.movementAction)) {
        equipment?.definition.cancelAction?.(equipment.state);
        if (playerState.movementAction === 'dodge') { dodgeBurning(playerState); beginCellDodge(cellCombat); feedback.sound('swing'); }
      }
      if (weaponTick.travelDelta > 0) {
        const directionYaw = weaponTick.travelYaw ?? equipment?.state?.attackYaw ?? playerState.facingYaw;
        const dx = -Math.sin(directionYaw) * weaponTick.travelDelta;
        const dz = -Math.cos(directionYaw) * weaponTick.travelDelta;
        const moved = movementCollisionWorld.moveCapsule(playerState.position, [dx, 0, dz], 0.36, 1.72, {
          phaseEnemies: equipment?.state?.action?.move?.phaseEnemies === true,
          onTravel: resolveTravel,
        });
        playerState.position = moved.position;
      }
      // Keep enemy collision disabled across the whole Surge travel, then
      // restore it and depenetrate immediately when the action ends.
      if (wasPhasingEnemies && equipment?.state?.action?.move?.phaseEnemies !== true) {
        const resolved = movementCollisionWorld.moveCapsule(playerState.position, [0, 0, 0], 0.36, 1.72);
        playerState.position = resolved.position;
      }
      resolveTravel(playerState.position, playerState.position);
      stepEncounter(movementStep, (bossFrom, enemyFrom) => resolveContinuousContacts(
        weaponTick.events, playerState.position, playerState.position, bossFrom, enemyFrom,
      ));
      if (selectedArena === 'island' && equipment?.state?.action?.move?.phaseEnemies !== true) {
        playerState.position = movementCollisionWorld.moveCapsule(playerState.position, [0, 0, 0], 0.36, 1.72).position;
      }
      behemothView.root.position.set(...behemothState.position);
      behemothView.root.rotation.y = behemothState.yaw;
      behemothView.root.updateMatrixWorld(true);
      stepProjectiles(movementStep);
      renderCombatHud();

};

const animate = () => {
  requestAnimationFrame(animate);
  timer.update();
  updateHomeMapPreview(performance.now());
  updateOnlinePresentation(Math.min(timer.getDelta(), 0.05));
  const delta = Math.min(timer.getDelta(), 0.05);
  arena.rotation.y += (targetRotationY - arena.rotation.y) * delta * 0.3;

  if (!arenaScreen.classList.contains('hidden') && !mapTransitionActive) {
    const moveX = Number(heldKeys.has('d') || heldKeys.has('arrowright')) - Number(heldKeys.has('a') || heldKeys.has('arrowleft'));
    const moveY = Number(heldKeys.has('w') || heldKeys.has('arrowup')) - Number(heldKeys.has('s') || heldKeys.has('arrowdown'));
    const cameraYaw = getCameraYaw();
    raycaster.setFromCamera(screenCenter, camera);
    const rayHitsFloor = raycaster.ray.intersectPlane(floorPlane, aimPoint);
    const aimYaw = rayHitsFloor
      ? Math.atan2(-(aimPoint.x - playerState.position[0]), -(aimPoint.z - playerState.position[2]))
      : cameraYaw;
    lastOnlineAimYaw = aimYaw;
    const pauseLocal = settingsOpen || !settlementPanel.hidden || onlineMenu?.openNow;
    movementAccumulator += online?.room ? delta : pauseLocal ? 0 : delta;
    let consumedActionPress = false;
    while (movementAccumulator >= movementStep) {
      simulateHunter(movementStep, pauseLocal ? 0 : moveX, pauseLocal ? 0 : moveY, cameraYaw, aimYaw);
      if (online?.host) { stepRemoteHunters(movementStep); publishOnlineMotion(); }
      pressedKeys.clear();
      movementAccumulator -= movementStep;
      consumedActionPress = true;
    }
    if (consumedActionPress) pressedKeys.clear();

    updatePlayerView(playerView, playerState, equipment, delta);
    burningEffect.visible = Boolean(playerState.burning && playerState.health > 0);
    burningEffect.scale.setScalar(1 + Math.sin(performance.now() / 90) * 0.12);
    const tempestAction = equipment?.state?.action?.ability === 'tempest-form' ? equipment.state.action : null;
    const castProgress = tempestAction ? THREE.MathUtils.clamp(equipment.state.elapsed / tempestAction.move.recovery, 0, 1) : 0;
    tempestCastRing.visible = Boolean(tempestAction);
    if (tempestAction) {
      tempestCastRing.scale.setScalar(0.72 + castProgress * 0.9);
      tempestCastMaterial.opacity = 0.9 * (1 - castProgress * 0.78);
      tempestCastRing.rotation.z = castProgress * Math.PI * 1.5;
    } else tempestCastMaterial.opacity = 0.9;
    updateAttackVolume();
    if (selectedArena === 'island') updateBehemothView(behemothView, onlineBossPose(islandEncounter.id, behemothState), delta, collisionVisibilityToggle.checked);
    for (const record of summonViews.values()) {
      updateBehemothView(record.view, onlineBossPose(islandEncounter.summon?.id, record.boss), delta, collisionVisibilityToggle.checked);
      record.view.root.visible &&= selectedArena === 'island';
      if (record.view.projectileRoot) record.view.projectileRoot.visible &&= selectedArena === 'island';
    }
    if (playerState.invulnerability < 0.48 && playerBodyMaterial.emissiveIntensity > 0) {
      playerBodyMaterial.emissiveIntensity = Math.max(0, playerBodyMaterial.emissiveIntensity - delta * 2);
    }

    updateTrainingTargetView(trainingView, trainingState);

    updateGameplayCamera(delta);
  } else {
    controls.update();
  }

  if (!arenaScreen.classList.contains('hidden')) {
    const cameraOffset = camera.position.clone().sub(controls.target);
    const cameraDistance = cameraOffset.length();
    const cameraDirection = cameraOffset.normalize();
    cameraRaycaster.set(controls.target, cameraDirection);
    const obstructions = cameraRaycaster.intersectObjects(selectedArena !== 'range' ? movementMeshes : cameraBlockers, false);
    if (obstructions.length && obstructions[0].distance < cameraDistance) {
      camera.position.copy(controls.target).addScaledVector(cameraDirection, Math.max(0.7, obstructions[0].distance - 0.35));
    }
  }
  if (!arenaScreen.classList.contains('hidden')) {
    feedback.applyCamera(camera);
    camera.updateMatrixWorld();
    feedback.update(delta, camera);
  }
  environment.update(delta);
  sunShadows.update(controls.target);
  if (!equipmentView.open) renderer.render(scene, camera);
};
animate();
requestAnimationFrame(() => loading.classList.add('done'));
