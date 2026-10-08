import * as THREE from 'three';
import { createEnrageEffect, updateEnrageEffect } from './behemoth-enrage-view.js';
import { QUARTERS, QUILLSHOT, isQuillshotInterruptible } from './quillshot.js';

export function createQuillshotView(scene) {
  const root = new THREE.Group(); root.name = 'Quillshot prototype'; scene.add(root);
  const rig = new THREE.Group(); root.add(rig);
  const skin = new THREE.MeshStandardMaterial({ color: '#695c73', roughness: 0.86, flatShading: true });
  const armor = new THREE.MeshStandardMaterial({ color: '#aa8c7e', roughness: 0.8, flatShading: true });
  const ivory = new THREE.MeshStandardMaterial({ color: '#f2d9ab', roughness: 0.5 });
  const quillMaterial = new THREE.MeshStandardMaterial({ color: '#9be8df', emissive: '#185b59', roughness: 0.42, flatShading: true });
  const sphere = new THREE.SphereGeometry(1, 10, 8), spike = new THREE.ConeGeometry(0.17, 1, 5);
  function blob(parent, name, at, scale, mat = skin) {
    const m = new THREE.Mesh(sphere, mat); m.name = name; m.position.set(...at); m.scale.set(...scale); m.castShadow = true; parent.add(m); return m;
  }
  blob(rig, 'Heavy barrel', [0, 1.45, 0], [1.5, 1.1, 2.05]);
  blob(rig, 'Shoulder armor', [0, 1.6, -1], [1.55, 1.05, 1.15], armor);
  const parts = {}, hitboxes = {}, outlines = [];
  const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  function hitbox(id, at, size) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), invisible); m.position.set(...at); m.userData.part = id; rig.add(m); hitboxes[id] = m;
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: '#ffe487' })); m.add(line); outlines.push(line);
  }
  for (const [id, x, z] of [['leftFore', -1.15, -1.1], ['rightFore', 1.15, -1.1], ['leftHind', -1.05, 1.2], ['rightHind', 1.05, 1.2]]) {
    parts[id] = blob(rig, id, [x, 0.65, z], [0.46, 0.72, 0.55], armor);
    blob(rig, 'Cloven paw', [x, 0.17, z - 0.12], [0.5, 0.2, 0.65]); hitbox(id, [x, 0.65, z], [0.9, 1.25, 1.05]);
  }
  parts.head = blob(rig, 'Head', [0, 1.1, -2.05], [0.94, 0.72, 0.95], armor);
  blob(rig, 'Snout', [0, 0.88, -2.72], [0.63, 0.38, 0.43]);
  const eye = new THREE.MeshStandardMaterial({ color: '#fff1ac', emissive: '#b97713' });
  for (const side of [-1, 1]) {
    blob(rig, 'Eye', [side * 0.77, 1.38, -2.47], [0.12, 0.12, 0.12], eye);
    const id = side < 0 ? 'leftTusk' : 'rightTusk';
    const tusk = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.14, 6, 12, Math.PI * 1.2), ivory);
    tusk.position.set(side * 0.8, 0.98, -2.9); tusk.rotation.y = Math.PI / 2; tusk.rotation.z = -0.7; rig.add(tusk); parts[id] = tusk;
    hitbox(id, [side * 0.8, 1, -2.9], [0.42, 1.15, 0.85]);
  }
  parts.tail = blob(rig, 'Tail', [0, 1.08, 2.35], [0.33, 0.3, 1]);
  // Include the projecting snout: the former box ended behind its visible tip,
  // allowing the tusks to consume frontal Crescent hits before the head registered.
  hitbox('head', [0, 1.1, -2.35], [1.6, 1.25, 2.0]); hitbox('tail', [0, 1.08, 2.6], [0.7, 0.65, 1.6]);
  hitbox('body', [0, 1.5, 0], [2.6, 1.8, 3.7]);
  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group(); rig.add(group); parts[QUARTERS[i]] = group;
    const side = i % 2 ? 1 : -1, front = i < 2 ? -1 : 1;
    for (let j = 0; j < 9; j++) {
      const m = new THREE.Mesh(spike, quillMaterial); m.castShadow = true;
      m.position.set(side * (0.3 + (j % 3) * 0.42), 2.4 + (1 - j % 3) * 0.1, front * (0.25 + Math.floor(j / 3) * 0.5));
      m.scale.y = 1.35 + (j % 3) * 0.35; m.rotation.z = -side * (0.22 + (j % 3) * 0.18); m.rotation.x = front * 0.3; group.add(m);
    }
    hitbox(QUARTERS[i], [side * 0.8, 2.95, front * 0.9], [1.5, 1.3, 1.65]);
  }
  const marker = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: '#ffdb59' })); marker.position.set(0, 1.35, -3.1); rig.add(marker);
  // Same orange ground warnings and collision overlay as Embermane.
  const attackZone = new THREE.Group();
  const attackMaterial = new THREE.MeshBasicMaterial({ color: '#ffcf75', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  for (const move of ['charge', 'swipe', 'slam', 'sideDrop']) {
    const definition = QUILLSHOT.moves[move];
    const arc = THREE.MathUtils.degToRad(definition.arc);
    const geometry = new THREE.CircleGeometry(definition.reach, 36, Math.PI / 2 - arc / 2, arc);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, attackMaterial);
    mesh.name = move; mesh.position.y = 0.09; attackZone.add(mesh);
  }
  root.add(attackZone);
  const tellZone = attackZone.clone();
  tellZone.name = 'Attack warning';
  const tellMaterial = new THREE.MeshBasicMaterial({ color: '#ffba65', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  for (const child of tellZone.children) child.material = tellMaterial;
  root.add(tellZone);
  const enrageEffect = createEnrageEffect(root, 4);
  const arrivalMotes = new THREE.Group();
  const moteMaterial = new THREE.MeshBasicMaterial({ color: '#8ef5ef', transparent: true, depthWrite: false });
  for (let i = 0; i < 40; i++) arrivalMotes.add(new THREE.Mesh(new THREE.OctahedronGeometry(.07 + (i % 3) * .025), moteMaterial));
  root.add(arrivalMotes);
  const projectileRoot = new THREE.Group(); projectileRoot.name = 'Quill projectiles'; scene.add(projectileRoot);
  const projectileMeshes = new Map();
  const landingGeo = new THREE.RingGeometry(0.45, QUILLSHOT.quills.radius, 24);
  const landingMat = new THREE.MeshBasicMaterial({ color: '#ff674f', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  return { enrageEffect, arrivalMotes, attackZone, tellZone, tellMaterial, root, rig, hitboxes, outlines, parts, skin, quillMaterial, marker, projectileRoot, projectileMeshes, spike, landingGeo, landingMat };
}
export function updateQuillshotView(v, s, dt, collision = false) {
  v.root.position.set(...s.position); v.root.rotation.y = s.yaw;
  v.projectileRoot.visible = v.root.visible && s.lifecycle !== 'absent';
  const spawning = s.lifecycle === 'spawning';
  const death = s.mode === 'defeated' ? (s.lifecycleTime ?? s.deathTime ?? 0) : 0;
  const opacity = spawning ? Math.min(1, s.lifecycleTime / 2.4) : Math.max(0, 1 - Math.max(0, death - .8) / 2.4);
  v.root.visible = s.lifecycle !== 'absent' && (opacity > 0 || spawning);
  v.projectileRoot.visible = v.root.visible;
  v.root.scale.setScalar(QUILLSHOT.sizeScale);
  v.root.position.y += spawning ? (1 - opacity) * 2 : death > .8 ? (1 - opacity) * .8 : 0;
  v.arrivalMotes.visible = spawning || (death > .8 && death < 3.2);
  v.arrivalMotes.children.forEach((mote, i) => {
    const phase = 1 - opacity, angle = i * 2.399 + phase * 3;
    const radius = .5 + (i % 7) * .23 + phase * 1.8;
    mote.position.set(Math.cos(angle) * radius, (i % 9) * .3 + phase * 2, Math.sin(angle) * radius);
    mote.material.opacity = Math.sin(Math.PI * Math.max(.01, Math.min(.99, opacity)));
  });
  v.rig.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.part || mesh === v.marker) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) { material.transparent = true; material.opacity = opacity; material.depthWrite = opacity > .95; }
  });
  let roll = 0, dip = 0;
  if (s.mode === 'defeated') { roll = 0.72; dip = -0.35; }
  else if (s.move === 'sideDrop') {
    const t = s.mode === 'windup' ? Math.min(1, s.elapsed) : s.mode === 'recovery' ? Math.max(0, 1 - s.elapsed / 1.2) : 1;
    roll = s.side * t * 1.15; dip = -0.4 * t;
  } else if (s.mode === 'reaction') { roll = s.move === 'part-break' ? 0.18 * Math.sin(s.elapsed * 9) : 1.15; dip = -0.35; }
  else if (['bombardment', 'intermittent'].includes(s.move)) dip = -0.25 + Math.sin(s.elapsed * 13) * 0.04;
  else if (s.mode === 'windup') dip = -0.2 * Math.min(1, s.elapsed / QUILLSHOT.moves[s.move].tell);
  v.rig.rotation.z = THREE.MathUtils.lerp(v.rig.rotation.z, roll, 1 - Math.exp(-dt * 16)); v.rig.position.y = dip;
  v.rig.rotation.x = s.move === 'slam' && s.mode === 'windup' ? -0.35 * Math.sin(s.elapsed * Math.PI) : 0;
  v.rig.rotation.y = s.move === 'swipe' ? (s.mode === 'windup' ? -0.32 * Math.min(1, s.elapsed / 0.8)
    : s.mode === 'active' ? -0.32 + 0.9 * Math.min(1, s.elapsed / 0.3)
    : s.mode === 'recovery' ? 0.58 * Math.max(0, 1 - s.elapsed) : 0) : 0;
  if (s.move === 'slam' && s.mode === 'active') v.rig.position.y = -0.35 * Math.sin(Math.PI * Math.min(1, s.elapsed / 0.3));
  if (s.move === 'enrage') { v.rig.position.y = 0.12 * Math.sin(s.elapsed * 18); v.rig.rotation.x = -0.15; }
  for (const [id, mesh] of Object.entries(v.parts)) {
    const broken = s.parts[id]?.broken;
    if (QUARTERS.includes(id) || id.includes('Tusk') || id === 'tail') mesh.visible = !broken;
    if (id.includes('Fore') || id.includes('Hind')) mesh.rotation.x = ['chase', 'charge', 'retreat', 'patrol'].includes(s.move ?? s.mode) ? Math.sin(s.elapsed * 12 + mesh.position.x * 2) * 0.24 : 0;
  }
  // Disable destroyed quill collision while leaving broken body parts hittable for core damage.
  for (const id of QUARTERS) v.hitboxes[id].layers.set(s.parts[id].broken ? 31 : 0);
  for (const line of v.outlines) line.visible = collision;
  v.marker.visible = isQuillshotInterruptible(s);
  v.quillMaterial.color.set(s.states.enrage.active ? '#ff4056' : '#9be8df');
  v.quillMaterial.emissive.set(s.states.enrage.active ? '#751323' : s.regrowthFlash > 0 ? '#55ccaa' : '#185b59');
  v.skin.emissive.set(s.flash > 0 ? '#7d3545' : s.states.enrage.active ? '#a51b28' : '#000000');
  v.skin.emissiveIntensity = s.flash > 0 ? 0.8 : 0.32;
  updateEnrageEffect(v.enrageEffect, s, QUILLSHOT.moves[s.move]);
  const live = new Set(s.projectiles.map(q => q.id));
  for (const [id, group] of v.projectileMeshes) if (!live.has(id)) { v.projectileRoot.remove(group); v.projectileMeshes.delete(id); }
  for (const q of s.projectiles) {
    let group = v.projectileMeshes.get(q.id);
    if (!group) {
      group = new THREE.Group();
      const mesh = new THREE.Mesh(v.spike, v.quillMaterial); mesh.scale.set(0.9, 1.7, 0.9); group.add(mesh);
      const landing = new THREE.Mesh(v.landingGeo, v.landingMat); landing.rotation.x = -Math.PI / 2; group.add(landing);
      v.projectileRoot.add(group); v.projectileMeshes.set(q.id, group);
    }
    group.position.set(...q.position);
    const mesh = group.children[0], landing = group.children[1];
    if (q.kind === 'fall') { mesh.rotation.z = Math.PI; landing.visible = true; landing.position.y = q.destination[1] + 0.05 - q.position[1]; landing.scale.setScalar(q.age < QUILLSHOT.quills.tracking ? 0.7 : 1); }
    else { landing.visible = false; mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...q.direction)); }
  }
  v.tellZone.visible = s.mode === 'windup';
  v.attackZone.visible = collision && s.mode === 'active' && (s.move !== 'sideDrop' || s.elapsed <= 0.2);
  for (const zone of [v.tellZone, v.attackZone]) {
    zone.rotation.y = s.move === 'sideDrop' ? -s.side * Math.PI / 2 : 0;
    for (const child of zone.children) child.visible = child.name === s.move;
  }
  if (v.tellZone.visible) v.tellMaterial.opacity = 0.08 + Math.min(1, s.elapsed / QUILLSHOT.moves[s.move].tell) * 0.17;
  v.root.updateMatrixWorld(true);
}
