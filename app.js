import { createEnvironment } from './environment.js';
import { createSunShadows } from './sun-shadows.js';
import { ISLAND, createIslandEncounter, stepIslandEncounter, alertEncounter, inTerritory, encounterTouchable } from './island-encounters.js';
import { createIslandView } from './island-view.js';
import { createRangeScenery } from './range-scenery.js';
import { createArenaHud } from './arena-hud.js';
import { isRecovering, isRecoveryProtected, startKnockdown } from './player-recovery.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { ARENA_COLLIDERS, ARENA_SCALE, createPlayerState, resolveWeaponMovement, stepPlayer } from './player-movement.js';
import { STRIKER_SWORD } from './striker-weapon.js';
import { sweptMeleeContact } from './swept-melee.js';
import { spendStamina } from './stamina.js';
import { addTimedStatModifier, getEffectiveStat, getStatModifierRemaining, stepStatModifiers } from './stat-modifiers.js';
import { BEHEMOTH, behemothAttackTouchesPlayer, createBehemothState, hitBehemoth, isInterruptible, stepBehemoth } from './behemoth.js';
import { createBehemothView, updateBehemothView } from './behemoth-view.js';
import { createPlayerView, updatePlayerView } from './player-view.js';
import { createCombatFeedback } from './combat-feedback.js';
import { TRAINING_TARGET, createTrainingState, hitTrainingTarget, stepTrainingTarget, trainingDps } from './training-target.js';
import { createTrainingTargetView, updateTrainingTargetView } from './training-target-view.js';

const root = document.querySelector('#scene');
const appShell = document.querySelector('.app-shell');
const loading = document.querySelector('#loading');
const fallback = document.querySelector('#webglFallback');
const homeScreen = document.querySelector('#homeScreen');
const arenaScreen = document.querySelector('#arenaScreen');
const playerHud = createArenaHud(arenaScreen);
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
const arenaOptions = [...document.querySelectorAll('input[name="arena"]')];
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
  else if (['range', 'island'].includes(savedArena)) selectedArena = savedArena;
} catch { /* Use the current range when storage is unavailable. */ }
let pendingArena = selectedArena;
const syncArenaSelection = () => {
  for (const option of settingsArenaOptions) option.checked = option.value === pendingArena;
  goToArenaButton.disabled = pendingArena === selectedArena;
};
for (const option of arenaOptions) option.checked = option.value === selectedArena;
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
fovValue.value = `${selectedFov}°`;
fovValue.textContent = `${selectedFov}°`;

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
const islandView = createIslandView();
scene.add(islandView);
let islandEncounter = createIslandEncounter();
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
const damageTrainingTarget = (damage, { stagger = 0, periodic = false } = {}) => {
  hitTrainingTarget(trainingState, { damage, stagger, periodic });
  feedback.impact([target.position.x, 1.5, target.position.z + 1.2], damage, { periodic, part: 'head' });
};
scene.add(target);
let behemothState = createBehemothState();
const behemothView = createBehemothView(scene);
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
  onDamage: (damage) => damageTrainingTarget(damage),
});
const damageBehemoth = (damage, { part = 'body', stagger = 0, interrupt = false, periodic = false } = {}) => {
  if (selectedArena === 'range' || !encounterTouchable(behemothState)) return { outcome: 'ignored' };
  if (selectedArena === 'island' && !inTerritory(islandEncounter.arena, playerState.position, 1)) return { outcome: 'ignored' };
  if (selectedArena === 'island' && !periodic) alertEncounter(islandEncounter, playerState.position);
  const result = hitBehemoth(behemothState, { damage, stagger, part, interrupt });
  const point = behemothView.hitboxes[part]?.getWorldPosition(new THREE.Vector3())
    ?? new THREE.Vector3(...behemothState.position);
  feedback.impact(point.toArray(), damage,
    { outcome: result.outcome, part: result.partDamage > 0 ? part : 'body', periodic, brokenPart: result.brokenPart });
  return result;
};
for (const [part, mesh] of Object.entries(behemothView.hitboxes)) registerProjectileTarget({
  id: 'first-behemoth', mesh, sizeClass: 'large',
  onDamage: (damage, details) => damageBehemoth(damage, { part, stagger: 22, interrupt: details?.interrupt === true }),
});
let projectileObstacleMeshes = [];
const activeProjectiles = [];
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
target.updateMatrixWorld(true);
const targetProxy = targetCore.clone(false);
targetProxy.matrix.copy(targetCore.matrixWorld);
targetProxy.matrixAutoUpdate = false;
targetProxy.matrixWorldNeedsUpdate = true;
const enemyCollisionGeometry = new THREE.Group();
enemyCollisionGeometry.add(targetProxy);
let movementOctree;
let enemyCollisionOctree;
const rebuildArenaCollision = () => {
  arena.updateMatrixWorld(true);
  movementGeometry = new THREE.Group();
  movementMeshes = [];
  (selectedArena === 'island' ? islandView : arena).updateMatrixWorld(true);
  (selectedArena === 'island' ? islandView : arena).traverse((object) => {
    if (!object.isMesh || !object.visible || object.userData.movementCollision === false) return;
    const proxy = object.clone(false);
    proxy.matrix.copy(object.matrixWorld);
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorldNeedsUpdate = true;
    movementGeometry.add(proxy);
    movementMeshes.push(object);
  });
  projectileObstacleMeshes = movementMeshes;
  movementGeometry.updateMatrixWorld(true);
  movementOctree = new Octree().fromGraphNode(movementGeometry);
  target.updateMatrixWorld(true);
  targetProxy.matrix.copy(targetCore.matrixWorld);
  targetProxy.matrixWorldNeedsUpdate = true;
  enemyCollisionGeometry.updateMatrixWorld(true);
  enemyCollisionOctree = new Octree().fromGraphNode(enemyCollisionGeometry);
};
rebuildArenaCollision();
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
          capsule.translate(normal.clone().multiplyScalar(hit.depth + skin));
          if (Math.abs(normal.y) < 0.65) contacts.push(normal.toArray());
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
        if (!phaseEnemies && selectedArena !== 'range' && encounterTouchable(behemothState)) {
          const dx = capsule.start.x - behemothState.position[0];
          const dz = capsule.start.z - behemothState.position[2];
          const distance = Math.hypot(dx, dz);
          const minimum = radius + BEHEMOTH.bodyRadius;
          if (distance < minimum && capsule.start.y < 2.2) {
            const nx = distance > 0.001 ? dx / distance : 1;
            const nz = distance > 0.001 ? dz / distance : 0;
            capsule.translate(new THREE.Vector3(nx * (minimum - distance + skin), 0, nz * (minimum - distance + skin)));
            contacts.push([nx, 0, nz]);
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
      .find((hit) => hit && hit.depth > 1e-4 && hit.normal.y < 0.65);
    // A capsule resting on a floor or platform is expected to touch it. Treat
    // only penetration into a wall/ceiling as a blocked movement candidate.
    const bossDistance = Math.hypot(capsule.start.x - behemothState.position[0], capsule.start.z - behemothState.position[2]);
    return Boolean(contact) || dummyBlocked || (selectedArena !== 'range' && encounterTouchable(behemothState)
      && capsule.start.y < 2.2 && bossDistance < radius + BEHEMOTH.bodyRadius);
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
const playerState = createPlayerState();
const playerView = createPlayerView();
const player = playerView.root;
const playerBodyMaterial = playerView.armor;
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
const heldKeys = new Set();
const pressedKeys = new Set();
let equipment = { definition: STRIKER_SWORD, state: STRIKER_SWORD.createState() };
let equippedWeapon = STRIKER_SWORD; // Weapon availability is separate from its sheathed state.
const cameraOrbit = { azimuth: Math.PI / 4, polar: 1.15, distance: 13, shoulder: 0 };
const followCameraScale = 2 / 3;
let altCursorHeld = false;
let relockOnFocus = false;
let qHeldSince = null;
let qConsumed = false;

const getCameraYaw = () => cameraOrbit.azimuth;
const updateGameplayCamera = () => {
  const target = new THREE.Vector3(playerState.position[0], playerState.position[1] + 1.55, playerState.position[2]);
  controls.target.copy(target);
  const horizontal = Math.sin(cameraOrbit.polar) * cameraOrbit.distance;
  camera.position.set(
    target.x + Math.sin(cameraOrbit.azimuth) * horizontal + Math.cos(cameraOrbit.azimuth) * cameraOrbit.shoulder,
    target.y + Math.cos(cameraOrbit.polar) * cameraOrbit.distance,
    target.z + Math.cos(cameraOrbit.azimuth) * horizontal - Math.sin(cameraOrbit.azimuth) * cameraOrbit.shoulder,
  );
  camera.lookAt(target);
};
const applyWeaponCamera = () => {
  const view = resolveWeaponMovement(equippedWeapon).camera;
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
  if (arenaScreen.classList.contains('hidden') || settingsOpen || altCursorHeld || !document.hasFocus()) return;
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
      if (performance.now() - lastSettingsEscape > 150 && !settingsOpen
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
  if (!definition?.createState || !definition?.handleAttack || !definition?.step || !definition?.setSheathed) throw new Error('Weapon must implement createState, handleAttack, step, and setSheathed.');
  equipment = { definition, state: definition.createState() };
  equippedWeapon = definition;
  if (weaponButton) weaponButton.textContent = `UNEQUIP ${definition.name.toUpperCase()}`;
  applyWeaponCamera();
  renderCombatHud();
};
window.unequipWeapon = () => {
  equipment = null;
  equippedWeapon = null;
  if (weaponButton) weaponButton.textContent = 'EQUIP STRIKER SWORD';
  applyWeaponCamera();
  renderCombatHud();
};
window.setMovementWeapon = (weapon) => weapon ? window.equipWeapon(weapon) : window.unequipWeapon();
window.registerProjectileTarget = registerProjectileTarget;

const renderCombatHud = () => {
  playerHud.update(playerState, equipment);
  if (staminaFill && staminaBar && staminaValue) {
    const stamina = Math.max(0, Math.min(100, playerState.stamina));
    staminaFill.style.width = `${stamina}%`;
    staminaBar.setAttribute('aria-valuenow', String(Math.round(stamina)));
    staminaValue.textContent = `${Math.round(stamina)} / 100`;
    staminaBar.classList.toggle('low', stamina <= 25);
  }
  if (!combatStatus) return;
  islandStatus.classList.toggle('hidden', selectedArena !== 'island');
  if (selectedArena === 'island') {
    const e = islandEncounter;
    const waiting = e.boss.mode === 'defeated';
    const destination = waiting ? ISLAND.arenas[(e.index + 1) % ISLAND.arenas.length] : e.arena;
    const distance = Math.round(Math.hypot(playerState.position[0] - destination.center[0], playerState.position[2] - destination.center[2]));
    const activity = waiting ? 'Defeated / a new hunt is forming' : e.boss.lifecycle === 'spawning' ? 'Behemoth arriving' : e.awareness === 'engaged' ? 'Behemoth alerted' : e.awareness === 'returning' ? 'Returning to its territory' : 'Behemoth roaming / approach to engage';
    islandStatus.textContent = `CINDERWILD ISLE\n${destination.name} / ${distance} m\n${activity}`;
  }
  const state = equipment?.state;
  combatStatus.textContent = !state ? 'NO WEAPON EQUIPPED' : state.sheathed ? 'SHEATHED · ATTACK TO DRAW' : (state.lastEvent ?? equipment.definition.name).toUpperCase();
  for (const dot of combatMantraDots?.children ?? []) {
    const filled = Boolean(state?.mantras?.some((slot) => slot.source === dot.dataset.mantraSlot));
    dot.classList.toggle('filled', filled);
    dot.setAttribute('aria-pressed', String(filled));
  }
  const tempestRemaining = getStatModifierRemaining(playerState.statModifiers, 'tempest-form');
  combatResources.textContent = !state ? 'TEMPEST OFF · SURGE —' : `TEMPEST ${tempestRemaining > 0 ? `${tempestRemaining.toFixed(1)}S` : 'OFF'} · SURGE ${state.surgeReady ? `${(state.surgeAvailabilityRemaining ?? 0).toFixed(1)}S` : '—'}`;
  combatTargetStatus.textContent = selectedArena !== 'range' ? '' :
    `TRAINING DUMMY / INDESTRUCTIBLE\nCORE ${Math.round(trainingState.core)} / PART ${Math.round(trainingState.part)} / STAGGER ${Math.round(trainingState.stagger)}\nDPS ${trainingDps(trainingState).toFixed(1)} / LAST ${Math.round(trainingState.lastHit)} / HITS ${trainingState.hits}`;
  behemothHud.classList.toggle('hidden', selectedArena === 'range');
  if (selectedArena !== 'range') {
    const health = Math.round(behemothState.health / BEHEMOTH.maxHealth * 100);
    const stagger = Math.round(behemothState.stagger / behemothState.staggerThreshold * 100);
    const parts = Object.entries(BEHEMOTH.parts).map(([id, definition]) => {
      const meter = behemothState.parts[id];
      return `<div>${definition.label.toUpperCase()} ${meter.broken ? 'BROKEN' : `${Math.ceil(meter.damage)} / ${definition.health}`}</div><div class="meter part"><span style="width:${meter.damage / definition.health * 100}%"></span></div>`;
    }).join('');
    const enrage = behemothState.states.enrage;
    const enrageLabel = enrage.active ? `ENRAGED ${Math.ceil(enrage.remaining)}s` : enrage.pending ? 'ENRAGE PENDING' : `ENRAGE ${Math.ceil(enrage.buildup)} / ${BEHEMOTH.maxHealth * BEHEMOTH.states.enrage.damageFraction}`;
    const stateLabel = behemothState.mode === 'defeated' ? 'BEHEMOTH DEFEATED'
      : playerState.health <= 0 ? 'HUNTER DOWN'
      : behemothState.mode === 'reaction' ? behemothState.move.replaceAll('-', ' ').toUpperCase()
      : isInterruptible(behemothState) ? 'HEAD OPEN — INTERRUPT NOW'
      : behemothState.mode === 'windup' ? `${behemothState.move.toUpperCase()} WINDUP`
      : behemothState.mode === 'observe' ? 'WATCHING THE HUNTER'
      : behemothState.mode === 'circle' ? 'CIRCLING'
      : behemothState.mode === 'retreat' ? 'CREATING SPACE' : '';
    behemothHud.innerHTML = `<div>${selectedArena === 'island' ? islandEncounter.arena.name.toUpperCase() + ' / ' + (behemothState.lifecycle === 'alive' ? islandEncounter.awareness : behemothState.lifecycle).toUpperCase() : 'FIRST BEHEMOTH'}</div><div>${behemothState.mode === 'defeated' ? '' : enrageLabel}</div><div class="meter"><span style="width:${health}%"></span></div><div>STAGGER ${Math.ceil(behemothState.stagger)} / ${Math.ceil(behemothState.staggerThreshold)}</div><div class="meter stagger"><span style="width:${stagger}%"></span></div>${parts}<div class="player-health">HUNTER ${Math.ceil(playerState.health)} / 100</div><div class="state">${stateLabel}</div>`;
  }
};
const targetInMove = (move) => {
  const dx = target.position.x - playerState.position[0];
  const dz = target.position.z - playerState.position[2];
  const distance = Math.hypot(dx, dz);
  if (distance > move.range + TRAINING_TARGET.radius || Math.abs(target.position.y + 1.0 - playerState.position[1] - 0.86) > 1.2) return false;
  const facingYaw = equipment?.state?.action && Number.isFinite(equipment.state.attackYaw)
    ? equipment.state.attackYaw
    : playerState.facingYaw;
  const forwardX = -Math.sin(facingYaw);
  const forwardZ = -Math.cos(facingYaw);
  const facingDot = (dx * forwardX + dz * forwardZ) / Math.max(distance, 0.001);
  return facingDot >= Math.cos((move.arc * Math.PI / 180) / 2);
};
const behemothInMove = (move) => {
  if (!encounterTouchable(behemothState)) return null;
  const yaw = equipment?.state?.action && Number.isFinite(equipment.state.attackYaw)
    ? equipment.state.attackYaw : playerState.facingYaw;
  return selectBehemothPart(move, yaw, playerState.position, playerState.position);
};
// Use the animated target volumes for every attack path. Broken parts stay eligible.
const selectBehemothPart = (move, yaw, from, to, bossFrom = behemothState.position) => {
  behemothView.root.position.set(...behemothState.position);
  behemothView.root.rotation.y = behemothState.yaw;
  behemothView.root.updateMatrixWorld(true);
  const candidates = Object.entries(behemothView.hitboxes).map(([part, mesh]) => {
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
  return candidates.filter(c => c.touches).sort((a, b) => a.distance - b.distance)[0]?.part ?? null;
};

const stepEncounter = (dt, resolveContacts = () => {}) => {
  if (selectedArena === 'range') return;
  playerState.invulnerability = Math.max(0, playerState.invulnerability - dt);
  if (playerState.health <= 0 && behemothState.mode !== 'defeated') return;
  const previousMode = behemothState.mode;
  const previousPosition = [...behemothState.position];
  if (selectedArena === 'island') {
    const previousId = islandEncounter.id;
    islandEncounter = stepIslandEncounter(islandEncounter, [{ position: playerState.position, knockedDown: isRecovering(playerState) }], dt);
    behemothState = islandEncounter.boss;
    if (previousId !== islandEncounter.id) {
      for (const record of projectileTargets) if (record.kind === 'first-behemoth') record.id = islandEncounter.id;
      for (const projectile of activeProjectiles) scene.remove(projectile.mesh);
      activeProjectiles.length = 0;
      equipment?.definition.onTargetRemoved?.(equipment.state, previousId);
    }
  } else {
    if (behemothState.lifecycle === 'spawning') {
      behemothState.lifecycleTime += dt;
      if (behemothState.lifecycleTime >= ISLAND.spawnDuration) { behemothState.lifecycle = 'alive'; behemothState.lifecycleTime = 0; }
      return;
    }
    if (behemothState.mode === 'defeated') behemothState.lifecycleTime = (behemothState.lifecycleTime ?? 0) + dt;
    stepBehemoth(behemothState, playerState.position, dt, 68, { targetKnockedDown: isRecovering(playerState) });
  }
  // Player contact always resolves before damage from the newly moved enemy.
  resolveContacts(previousPosition);
  if (behemothState.mode === 'windup' && previousMode !== 'windup') feedback.sound('cue');
  if (behemothAttackTouchesPlayer(behemothState, playerState.position)) {
    behemothState.attackHit = true;
    const rolling = playerState.movementAction === 'dodge' && playerState.actionTime > 0.08;
    if (!rolling && !isRecoveryProtected(playerState) && playerState.invulnerability === 0) {
      playerState.health = Math.max(0, playerState.health - BEHEMOTH.moves[behemothState.move].damage);
      equipment?.definition.cancelAction?.(equipment.state);
      // Keep an unfulfilled Q hold through hit recovery; release/blur still clears it.
      pressedKeys.clear();
      // A hit during vulnerable get-up can start a new reaction.
      playerState.recovery = null;
      startKnockdown(playerState, behemothState.position);
      feedback.impact([playerState.position[0], playerState.position[1] + 1.5, playerState.position[2]],
        BEHEMOTH.moves[behemothState.move].damage, { outcome: 'hurt' });
      playerBodyMaterial.emissive.set('#a23e36');
      playerBodyMaterial.emissiveIntensity = 0.85;
      if (playerState.health <= 0) equipment?.definition.cancelAction?.(equipment.state);
    }
  }
  // The enemy moved after the player step; separate any new overlap before the next frame.
  const corrected = movementCollisionWorld.moveCapsule(playerState.position, [0, 0, 0], 0.36, 1.72);
  playerState.position = corrected.position;
};
const processWeaponStep = (dt) => {
  if (selectedArena !== 'range' && playerState.health <= 0) return { locked: true, movementScale: 0, travelDelta: 0 };
  if (!equipment) return { locked: false, movementScale: 1, travelDelta: 0 };
  const state = equipment.state;
  const attackSpeedMultiplier = getEffectiveStat(1, 'attackSpeed', playerState.statModifiers);
  const result = equipment.definition.step(state, dt, { attackSpeedMultiplier, spend: (amount) => spendStamina(playerState, amount) });
  for (const event of result.events) {
    // Continuous attacks are resolved along movement and again after enemy travel.
    if (event.type === 'attack-active') continue;
    if (event.type === 'special-launch') { launchProjectile(event.projectile); feedback.sound('reward'); }
    if (event.type === 'attack-hit') feedback.sound('swing');
    const attackEvent = event.type === 'attack-hit';
    const bossPart = selectedArena !== 'range' && attackEvent ? behemothInMove(event.move) : null;
    if (attackEvent && (selectedArena !== 'range' ? bossPart : targetInMove(event.move))) {
      if (selectedArena !== 'range') damageBehemoth(event.move.damage, { part: bossPart, stagger: event.move.stagger, interrupt: event.interrupt });
      else damageTrainingTarget(event.move.damage, { stagger: event.move.stagger });
      const confirmedEvent = event;
      if (equipment.definition.onHit?.(state, confirmedEvent) && event.ability === 'karma-breaker') state.lastEvent = 'Karma Breaker · damage over time';
    } else if (event.type === 'karma-tick') {
      if (selectedArena !== 'range') damageBehemoth(event.damage, { stagger: event.stagger, periodic: true });
      else damageTrainingTarget(event.damage, { stagger: event.stagger, periodic: true });
    }
    else if (event.type === 'combo-complete') state.lastEvent = `${event.combo.name} · ${event.combo.mantra} mantra`;
  }
  renderCombatHud();
  return result;
};
const resolveContinuousContacts = (events, from, to, bossFrom = behemothState.position) => {
  for (const event of events ?? []) {
    if (event.type !== 'attack-active' || event.action.hitRegistered) continue;
    const touches = (a, b, radius, height) => sweptMeleeContact(event.move, event.yaw, from, to, a, b, radius, height);
    let part = null;
    if (selectedArena !== 'range') {
      if (!encounterTouchable(behemothState)) continue;
      part = selectBehemothPart(event.move, event.yaw, from, to, bossFrom);
    } else {
      const center = [target.position.x, target.position.y + 0.14, target.position.z];
      if (touches(center, center, TRAINING_TARGET.radius, 1.2)) part = 'body';
    }
    if (!part) continue;
    event.action.hitRegistered = true;
    if (selectedArena !== 'range') damageBehemoth(event.move.damage, { part, stagger: event.move.stagger, interrupt: event.interrupt });
    else damageTrainingTarget(event.move.damage, { stagger: event.move.stagger });
    equipment.definition.onHit?.(equipment.state, { ...event, type: 'attack-hit' });
  }
};
const launchProjectile = (definition) => {
  const direction = definition.direction
    ? new THREE.Vector3(...definition.direction).normalize()
    : new THREE.Vector3(-Math.sin(definition.attackYaw), 0, -Math.cos(definition.attackYaw)).normalize();
  const mesh = new THREE.Group();
  const blade = new THREE.Mesh(crescentGeometry, crescentMaterial);
  blade.scale.set(definition.width / crescentDimensions.width, 1, definition.depth / crescentDimensions.depth);
  const cuttingEdgeCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-crescentHalfWidth, 0.071, -crescentHalfDepth),
    new THREE.Vector3(0, 0.071, crescentHalfDepth * 3),
    new THREE.Vector3(crescentHalfWidth, 0.071, -crescentHalfDepth),
  );
  blade.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(cuttingEdgeCurve.getPoints(32)), crescentEdgeMaterial,
  ));
  const collisionVolume = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(definition.width, definition.height, definition.depth)), projectileCollisionMaterial,
  );
  collisionVolume.visible = collisionVisibilityToggle.checked;
  mesh.add(blade, collisionVolume);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  scene.add(mesh);
  const position = new THREE.Vector3(playerState.position[0], playerState.position[1] + definition.centerHeight, playerState.position[2]);
  activeProjectiles.push({ ...definition, direction, position, travelled: 0, hitTargets: new Set(), mesh, collisionVolume });
};
const stepProjectiles = (dt) => {
  const currentTargets = projectileTargets.filter((record) => selectedArena !== 'range'
    ? record.kind !== 'training-dummy' && encounterTouchable(behemothState) : record.kind !== 'first-behemoth');
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
        record.onDamage?.(projectile.damage, { source: projectile.id, interrupt: projectile.interrupt === true });
        if (record.sizeClass === 'large' && hit.dissipatingLane) { dissipate = true; break; }
      }
      if (!dissipate) {
        projectile.position.addScaledVector(projectile.direction, distance);
        projectile.travelled += distance;
      }
    }
    if (dissipate || projectile.travelled >= projectile.range) {
      scene.remove(projectile.mesh);
      activeProjectiles.splice(index, 1);
    } else projectile.mesh.position.copy(projectile.position);
  }
};
const getAttackYaw = () => {
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
  attackVolume.position.set(playerState.position[0], 0.035, playerState.position[2]);
  attackVolume.rotation.y = yaw;
  attackVolume.visible = true;
};
const handleAttackInput = (input) => {
  if (isRecovering(playerState) || playerState.dodgeInputBlock > 0 || !equipment || playerState.movementAction === 'dodge' || playerState.movementAction === 'climb' || (selectedArena !== 'range' && playerState.health <= 0)) return;
  const result = equipment.definition.handleAttack(equipment.state, input, { attackYaw: getAttackYaw(), spend: (amount) => spendStamina(playerState, amount) });
  if (result.type !== 'input-ignored') renderCombatHud();
};
weaponButton?.addEventListener('click', () => equipment ? window.unequipWeapon() : window.equipWeapon());
renderer.domElement.addEventListener('mousedown', (event) => {
  if (arenaScreen.classList.contains('hidden') || settingsOpen) return;
  if (event.button === 0) handleAttackInput('light');
  if (event.button === 2) { event.preventDefault(); handleAttackInput('heavy'); }
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

const clearInput = () => {
  heldKeys.clear();
  pressedKeys.clear();
  qHeldSince = null;
  qConsumed = false;
};
const setSettingsOpen = (open, restoreCamera = true) => {
  settingsOpen = open;
  if (open) { pendingArena = selectedArena; syncArenaSelection(); }
  if (open && !settingsMenu.open) settingsMenu.showModal();
  else if (!open && settingsMenu.open) settingsMenu.close();
  arenaSettings.hidden = arenaScreen.classList.contains('hidden');
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
const keyToAction = (event) => {
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'f', ' ', 'q', 'x'].includes(key)) event.preventDefault();
  if (arenaScreen.classList.contains('hidden')) return;
  if (key === 'alt') {
    altCursorHeld = true;
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    syncPointerLockHint();
    return;
  }
  if (event.repeat || arenaScreen.classList.contains('hidden')) return;
  if (key === 'f') pressedKeys.add('jump');
  if (key === ' ') pressedKeys.add('dodge');
  if (key === 'x' && !isRecovering(playerState) && playerState.dodgeInputBlock <= 0 && equipment && equipment.state.action?.ability !== 'crescent-special') {
    equipment.definition.setSheathed(equipment.state, !equipment.state.sheathed);
    renderCombatHud();
  }
  if (key === 'q') { qHeldSince = performance.now(); qConsumed = false; }
};

let targetRotationY = 0;
const resetEncounter = () => {
  feedback.clear();
  trainingState = createTrainingState();
  updateTrainingTargetView(trainingView, trainingState);
  Object.assign(playerState, createPlayerState());
  clearInput();
  islandEncounter = createIslandEncounter();
  behemothState = selectedArena === 'island' ? islandEncounter.boss : createBehemothState();
  for (const record of projectileTargets) if (record.kind === 'first-behemoth') record.id = selectedArena === 'island' ? islandEncounter.id : 'first-behemoth';
  playerState.health = 100;
  playerState.invulnerability = 0;
  playerState.position = selectedArena === 'island' ? [...ISLAND.arrival] : [0, -0.025, 1.5];
  playerState.lastGroundedPosition = [...playerState.position];
  playerState.velocity = [0, 0, 0];
  playerBodyMaterial.emissive.set('#000000');
  for (const projectile of activeProjectiles) scene.remove(projectile.mesh);
  activeProjectiles.length = 0;
  if (equipment) equipment.state = equipment.definition.createState();
  updateBehemothView(behemothView, behemothState, 1, collisionVisibilityToggle.checked);
  behemothView.root.visible = selectedArena !== 'range';
  renderCombatHud();
};
resetArenaButton.addEventListener('click', () => {
  resetEncounter();
  setSettingsOpen(false);
});
const setArenaMode = (mode) => {
  selectedArena = mode === 'island' ? 'island' : 'range';

  camera.far = 900;
  camera.updateProjectionMatrix();
  arena.visible = selectedArena !== 'island';
  islandView.visible = selectedArena === 'island';
  const scale = ARENA_SCALE;
  arena.scale.set(scale, 1, scale);
  updateArenaGrid(scale);
  for (const marker of markerMeshes) marker.visible = selectedArena === 'range';
  collisionVisuals.visible = selectedArena === 'range' && collisionVisibilityToggle.checked;
  target.visible = selectedArena === 'range';
  behemothView.root.visible = selectedArena !== 'range';
  selectedArenaName.textContent = selectedArena === 'island' ? 'Cinderwild Isle' : 'Open Range';
  arenaModeBadge.textContent = selectedArena === 'island' ? 'CINDERWILD ISLE' : 'TRAINING RANGE';
  arenaCaption.innerHTML = selectedArena === 'island' ? 'TWO TERRITORIES<br />FOLLOW THE STONE PATHS' : 'ENCLOSED RANGE<br />OPEN APPROACH';
  for (const option of arenaOptions) option.checked = option.value === selectedArena;
  controls.maxDistance = selectedArena !== 'range' ? 130 : 24;
  controls.minDistance = selectedArena !== 'range' ? 16 : 4;
  controls.target.set(0, 1.2, 0);
  const previewDistance = selectedArena !== 'range' ? 88 : 18;
  environment.setArena(selectedArena);
  camera.position.set(previewDistance * 0.67, previewDistance * 0.53, previewDistance * 0.75);
  controls.update();
  controls.saveState();
  if (!arenaScreen.classList.contains('hidden')) {
    playerState.position = selectedArena === 'island' ? [...ISLAND.arrival] : [0, -0.025, 1.5];
    playerState.lastGroundedPosition = [...playerState.position];
  }
  rebuildArenaCollision();
  resetEncounter();
  if (!arenaScreen.classList.contains('hidden')) { applyWeaponCamera(); updateGameplayCamera(); }
  try { localStorage.setItem(arenaStorageKey, selectedArena); } catch { /* Current selection remains active. */ }
};
arenaOptions.forEach((option) => option.addEventListener('change', () => setArenaMode(option.value)));
settingsArenaOptions.forEach((option) => option.addEventListener('change', () => {
  pendingArena = option.value;
  syncArenaSelection();
}));
goToArenaButton.addEventListener('click', () => {
  if (pendingArena === selectedArena) return;
  setArenaMode(pendingArena);
  setSettingsOpen(false);
});
setArenaMode(selectedArena);
const setScreen = (showArena) => {
  if (settingsMenu.open) settingsMenu.close();
  settingsOpen = false;
  settingsToggle.setAttribute('aria-expanded', 'false');
  appShell.classList.remove('settings-open');
  feedback.clear();
  homeScreen.classList.toggle('hidden', showArena);
  arenaScreen.classList.toggle('hidden', !showArena);
  appShell.classList.toggle('in-range', showArena);
  controls.enabled = !showArena;
  controls.autoRotate = !showArena;
  if (showArena) {
    player.visible = true;
    target.visible = selectedArena === 'range';
    behemothView.root.visible = selectedArena !== 'range';
    resetEncounter();
    applyWeaponCamera();
    if (selectedArena === 'range') { cameraOrbit.azimuth = 0; updateGameplayCamera(); }
    requestCameraPointerLock();
    syncPointerLockHint();
  } else {
    player.visible = false;
    target.visible = selectedArena === 'range';
    behemothView.root.visible = selectedArena !== 'range';
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
enterButton.addEventListener('click', () => setScreen(true));
fovSlider.addEventListener('input', () => {
  selectedFov = Number(fovSlider.value);
  fovValue.value = `${selectedFov}°`;
  fovValue.textContent = `${selectedFov}°`;
  try {
    localStorage.setItem(fovStorageKey, String(selectedFov));
  } catch {
    // The current session still uses the selected value if storage is unavailable.
  }
  camera.fov = selectedFov;
  camera.updateProjectionMatrix();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
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
  if (arenaScreen.classList.contains('hidden') || settingsOpen) return;
  if (event.target.closest?.('button, input, select, textarea, a')) return;
  keyToAction(event);
  heldKeys.add(event.key.toLowerCase());
});
window.addEventListener('keyup', (event) => {
  if (event.key === 'Escape' && resumeCameraAfterEscape) {
    resumeCameraAfterEscape = false;
    // Reacquire only after the browser has finished handling Escape's unlock.
    requestAnimationFrame(() => { if (!settingsOpen) requestCameraPointerLock(); });
  }
  const key = event.key.toLowerCase();
  heldKeys.delete(key);
  if (key === 'q' && qHeldSince !== null) {
    if (!qConsumed && equipment && playerState.health > 0 && !isRecovering(playerState) && playerState.dodgeInputBlock <= 0 && !['dodge', 'climb'].includes(playerState.movementAction)) {
      const result = equipment.definition.useTapAbility?.(equipment.state, {
        attackYaw: getAttackYaw(),
        ability: equipment.definition.abilities?.tap,
      });
      if (result?.type !== 'unavailable') renderCombatHud();
    }
    qHeldSince = null;
    qConsumed = false;
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

const timer = new THREE.Timer();
timer.connect(document);
const movementStep = 1 / 60;
let movementAccumulator = 0;
const animate = () => {
  requestAnimationFrame(animate);
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  arena.rotation.y += (targetRotationY - arena.rotation.y) * delta * 0.3;

  if (!arenaScreen.classList.contains('hidden')) {
    const moveX = Number(heldKeys.has('d') || heldKeys.has('arrowright')) - Number(heldKeys.has('a') || heldKeys.has('arrowleft'));
    const moveY = Number(heldKeys.has('w') || heldKeys.has('arrowup')) - Number(heldKeys.has('s') || heldKeys.has('arrowdown'));
    const cameraYaw = getCameraYaw();
    raycaster.setFromCamera(screenCenter, camera);
    const rayHitsFloor = raycaster.ray.intersectPlane(floorPlane, aimPoint);
    const aimYaw = rayHitsFloor
      ? Math.atan2(-(aimPoint.x - playerState.position[0]), -(aimPoint.z - playerState.position[2]))
      : cameraYaw;
    movementAccumulator += settingsOpen ? 0 : delta;
    let consumedActionPress = false;
    while (movementAccumulator >= movementStep) {
      stepStatModifiers(playerState.statModifiers, movementStep);
      if (selectedArena === 'range') stepTrainingTarget(trainingState, movementStep);
      if (qHeldSince !== null && !qConsumed && performance.now() - qHeldSince >= 300 && equipment && playerState.health > 0 && !isRecovering(playerState) && playerState.dodgeInputBlock <= 0 && !['dodge', 'climb'].includes(playerState.movementAction)) {
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
        moveX: moveX * weaponTick.movementScale,
        moveY: moveY * weaponTick.movementScale,
        attackLocked: weaponTick.locked,
        sprintHeld: heldKeys.has('shift'),
        sprintCostsStamina: Boolean(equipment && !equipment.state.sheathed),
        cameraYaw,
        aimYaw: attackYaw,
        facingYaw: equipment?.state?.action && Number.isFinite(equipment.state.attackYaw) ? equipment.state.attackYaw : undefined,
        jumpPressed: !consumedActionPress && !weaponTick.locked && pressedKeys.has('jump'),
        dodgePressed: !consumedActionPress && !weaponTick.locked && pressedKeys.has('dodge'),
      }, movementStep, {
        colliders: ARENA_COLLIDERS,
        collisionWorld: movementCollisionWorld,
        floorBounds: selectedArena !== 'range'
          ? { minX: -75, maxX: 75, minZ: -75, maxZ: 75, y: -0.025 }
          : undefined,
        weapon: equippedWeapon,
        staminaState: playerState,
      });
      if (playerState.movementAction !== previousMovementAction && ['dodge', 'climb'].includes(playerState.movementAction)) {
        equipment?.definition.cancelAction?.(equipment.state);
        if (playerState.movementAction === 'dodge') feedback.sound('swing');
      }
      if (weaponTick.travelDelta > 0) {
        const directionYaw = equipment?.state?.attackYaw ?? playerState.facingYaw;
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
      stepEncounter(movementStep, (bossFrom) => resolveContinuousContacts(
        weaponTick.events, playerState.position, playerState.position, bossFrom,
      ));
      behemothView.root.position.set(...behemothState.position);
      behemothView.root.rotation.y = behemothState.yaw;
      behemothView.root.updateMatrixWorld(true);
      stepProjectiles(movementStep);
      renderCombatHud();
      movementAccumulator -= movementStep;
      consumedActionPress = true;
    }
    if (consumedActionPress) pressedKeys.clear();

    updatePlayerView(playerView, playerState, equipment, delta);
    const tempestAction = equipment?.state?.action?.ability === 'tempest-form' ? equipment.state.action : null;
    const castProgress = tempestAction ? THREE.MathUtils.clamp(equipment.state.elapsed / tempestAction.move.recovery, 0, 1) : 0;
    tempestCastRing.visible = Boolean(tempestAction);
    if (tempestAction) {
      tempestCastRing.scale.setScalar(0.72 + castProgress * 0.9);
      tempestCastMaterial.opacity = 0.9 * (1 - castProgress * 0.78);
      tempestCastRing.rotation.z = castProgress * Math.PI * 1.5;
    } else tempestCastMaterial.opacity = 0.9;
    updateAttackVolume();
    if (selectedArena !== 'range') updateBehemothView(behemothView, behemothState, delta, collisionVisibilityToggle.checked);
    if (playerState.invulnerability < 0.48 && playerBodyMaterial.emissiveIntensity > 0) {
      playerBodyMaterial.emissiveIntensity = Math.max(0, playerBodyMaterial.emissiveIntensity - delta * 2);
    }

    updateTrainingTargetView(trainingView, trainingState);

    updateGameplayCamera();
  } else {
    controls.update();
  }

  if (!arenaScreen.classList.contains('hidden')) {
    const cameraOffset = camera.position.clone().sub(controls.target);
    const cameraDistance = cameraOffset.length();
    const cameraDirection = cameraOffset.normalize();
    cameraRaycaster.set(controls.target, cameraDirection);
    const obstructions = cameraRaycaster.intersectObjects(selectedArena === 'island' ? movementMeshes : cameraBlockers, false);
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
  renderer.render(scene, camera);
};
animate();
requestAnimationFrame(() => loading.classList.add('done'));
