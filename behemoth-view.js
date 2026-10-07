import * as THREE from 'three';
import { BEHEMOTH, isInterruptible } from './behemoth.js';

const material = (color, emissive = '#000000') => new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.72, metalness: 0.06, flatShading: true });
const fur = material('#a95d37');
const dark = material('#3b3030');
const pale = material('#d5aa74');
const mark = material('#685047');
const eye = material('#f1e9c6', '#665d29');
const warning = new THREE.MeshBasicMaterial({ color: '#ffde70', transparent: true, opacity: 0.9, depthWrite: false });
const staggerColor = new THREE.MeshBasicMaterial({ color: '#93d8ff', transparent: true, opacity: 0.82, depthWrite: false });
const breakColor = new THREE.MeshBasicMaterial({ color: '#ffa0ab', transparent: true, opacity: 0.75, depthWrite: false });

function ellipsoid(parent, name, size, position, mat) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat);
  mesh.name = name;
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function cone(parent, name, radius, height, position, mat, rotation = 0) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5), mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.x = rotation;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function ring(parent, radius, mat) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.045, 5, 36), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.visible = false;
  parent.add(mesh);
  return mesh;
}

/** Original mechanics-lab creature assembled from simple geometry. */
export function createBehemothView(scene) {
  const root = new THREE.Group();
  root.name = 'Behemoth prototype';
  const bodyRig = new THREE.Group();
  bodyRig.scale.setScalar(BEHEMOTH.sizeScale);
  root.add(bodyRig);
  ellipsoid(bodyRig, 'barrel', [1.06, 0.74, 1.62], [0, 1.63, 0], fur);
  ellipsoid(bodyRig, 'chest', [1.08, 0.9, 0.85], [0, 1.68, -0.77], fur);
  ellipsoid(bodyRig, 'rump', [0.91, 0.72, 0.79], [0, 1.55, 0.98], dark);
  for (const side of [-1, 1]) {
    const fore = new THREE.Group();
    fore.position.set(side * 0.79, 1.5, -0.88);
    bodyRig.add(fore);
    ellipsoid(fore, `front leg ${side}`, [0.31, 0.73, 0.31], [0, -0.6, 0.03], dark);
    ellipsoid(fore, `front paw ${side}`, [0.35, 0.18, 0.49], [0, -1.22, -0.23], pale);
    const hind = new THREE.Group();
    hind.position.set(side * 0.72, 1.36, 1.0);
    bodyRig.add(hind);
    ellipsoid(hind, `hind leg ${side}`, [0.34, 0.65, 0.35], [0, -0.48, 0.1], dark);
    ellipsoid(hind, `hind paw ${side}`, [0.34, 0.17, 0.48], [0, -1.04, -0.24], pale);
    bodyRig.userData[side < 0 ? 'leftFore' : 'rightFore'] = fore;
    bodyRig.userData[side < 0 ? 'leftHind' : 'rightHind'] = hind;
  }
  const neck = new THREE.Group();
  neck.position.set(0, 1.91, -1.12);
  bodyRig.add(neck);
  ellipsoid(neck, 'neck', [0.68, 0.62, 0.74], [0, -0.08, -0.32], fur);
  const head = new THREE.Group();
  head.position.set(0, 0.05, -0.85);
  neck.add(head);
  ellipsoid(head, 'head', [0.63, 0.45, 0.73], [0, 0, -0.19], pale);
  ellipsoid(head, 'muzzle', [0.47, 0.28, 0.55], [0, -0.18, -0.75], dark);
  for (const side of [-1, 1]) {
    cone(head, `ear ${side}`, 0.22, 0.58, [side * 0.43, 0.44, 0.02], dark, side * 0.3);
    ellipsoid(head, `eye ${side}`, [0.09, 0.09, 0.07], [side * 0.55, 0.12, -0.43], eye);
    cone(head, `crest ${side}`, 0.18, 0.64, [side * 0.32, 0.48, -0.29], mark, side * 0.25);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.73, 1.46);
  bodyRig.add(tail);
  ellipsoid(tail, 'tail base', [0.29, 0.28, 0.88], [0, 0.03, 0.58], dark);
  cone(tail, 'tail tip', 0.34, 1.0, [0, 0.11, 1.28], pale, Math.PI / 2);
  const horn = cone(head, 'snout horn', 0.23, 0.85, [0, 0.52, -0.82], pale, -0.35);
  const partMeshes = { head, horn, tail, ...bodyRig.userData };
  const hitboxes = {};
  const outlines = [];
  const addHitbox = (id, parent, size, position) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    box.position.set(...position); box.name = `${id} hitbox`; box.userData.part = id; parent.add(box);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: '#ffe487' }));
    box.add(outline); outlines.push(outline); hitboxes[id] = box;
  };
  addHitbox('head', head, [1.15, 0.7, 1.3], [0, -0.12, -0.4]);
  addHitbox('horn', head, [0.48, 0.82, 0.5], [0, 0.55, -0.82]);
  addHitbox('tail', tail, [0.6, 0.6, 1.8], [0, 0.08, 0.8]);
  for (const id of ['leftFore', 'rightFore', 'leftHind', 'rightHind'])
    addHitbox(id, partMeshes[id], [0.7, 1.25, 0.8], [0, -0.55, 0]);
  addHitbox('body', bodyRig, [1.9, 1.4, 2.8], [0, 1.6, 0]);
  const headHitbox = hitboxes.head;
  const headMarker = ring(root, 0.55, warning);
  const staggerRing = ring(root, 1.5, staggerColor);
  const breakRing = ring(root, 1.32, breakColor);
  const staggerCrown = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), staggerColor);
    spark.position.set(Math.cos(i * Math.PI * 2 / 3) * 0.7, 0, Math.sin(i * Math.PI * 2 / 3) * 0.7);
    staggerCrown.add(spark);
  }
  staggerCrown.position.y = 3.05;
  root.add(staggerCrown);
  const attackZone = new THREE.Group();
  const attackMaterial = new THREE.MeshBasicMaterial({ color: '#ffcf75', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  for (const move of ['claw', 'sweep', 'enrageBurst']) {
    const definition = BEHEMOTH.moves[move];
    const arc = THREE.MathUtils.degToRad(definition.arc);
    const geometry = new THREE.CircleGeometry(definition.reach, 36, Math.PI / 2 - arc / 2, arc);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, attackMaterial);
    mesh.name = move;
    mesh.position.y = 0.09;
    attackZone.add(mesh);
  }
  const chargeVolume = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.025, 3.3), attackMaterial);
  chargeVolume.scale.setScalar(BEHEMOTH.sizeScale);
  chargeVolume.name = 'charge';
  chargeVolume.position.set(0, 0.09, -1.25);
  chargeVolume.position.z *= BEHEMOTH.sizeScale;
  attackZone.add(chargeVolume);
  root.add(attackZone);
  const tellZone = attackZone.clone();
  tellZone.name = 'Attack warning';
  const tellMaterial = new THREE.MeshBasicMaterial({ color: '#ffba65', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  for (const child of tellZone.children) child.material = tellMaterial;
  root.add(tellZone);
  const burstMaterial = new THREE.MeshBasicMaterial({ color: '#ff334d', transparent: true, opacity: 0.22, depthWrite: false, wireframe: true });
  const burstSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), burstMaterial);
  burstSphere.visible = false;
  root.add(burstSphere);
  const headOutline = outlines[0];
  headMarker.rotation.x = 0;
  headMarker.rotation.y = 0;
  const arrivalMotes = new THREE.Group();
  const moteMaterial = new THREE.MeshBasicMaterial({color:'#8ef5ef', transparent:true, depthWrite:false});
  for (let i=0;i<40;i++) arrivalMotes.add(new THREE.Mesh(new THREE.OctahedronGeometry(.07 + (i%3)*.025), moteMaterial));
  root.add(arrivalMotes);
  root.userData.arrivalMotes = arrivalMotes;
  scene.add(root);
  return { burstSphere, hitboxes, outlines, partMeshes, horn, root, bodyRig, neck, head, tail, headHitbox, headOutline, headMarker, staggerRing, staggerCrown, breakRing, attackZone, tellZone, tellMaterial };
}

const poseFor = (state) => {
  if (state.mode === 'run-out') return { bodyY: 1.02, bodyX: -0.13, neckX: -0.32, headX: -0.25, tailX: -0.15, foreX: 0.42, hindX: -0.38 };
  if (['run-out-turn', 'turn-back'].includes(state.mode)) return { bodyY: 0.9, bodyX: 0.08, neckX: 0.2, headX: -0.1, tailX: 0.3, foreX: -0.2, hindX: 0.2 };
  if (state.mode === 'defeated') return { bodyY: 0.78, bodyX: 0.23, neckX: 0.42, headX: 0.2, tailX: -0.35, foreX: 0.6, hindX: -0.55 };
  if (state.mode === 'reaction') {
    if (state.move === 'true-stagger') return { bodyY: 0.74, bodyX: -0.08, neckX: -0.42, headX: 0.1, tailX: -0.35, foreX: 0.35, hindX: -0.3 };
    if (state.move === 'interrupt') return { bodyY: 0.86, bodyX: -0.06, neckX: -0.3, headX: 0.1, tailX: -0.2, foreX: 0.45, hindX: -0.3 };
    return { bodyY: 1.05, bodyX: -0.16, neckX: -0.3, headX: -0.24, tailX: 0.36, foreX: -0.35, hindX: 0.15 };
  }
  if (state.move === 'enrageBurst' && ['windup', 'active', 'recovery'].includes(state.mode)) return { bodyY: 1.1, bodyX: 0.03, neckX: -0.4, headX: -0.3, tailX: 0.2, foreX: 0.08, hindX: -0.1 };
  if (state.mode === 'windup') {
    if (state.move === 'charge') return { bodyY: 0.88, bodyX: 0.09, neckX: 0.28, headX: -0.1, tailX: 0.24, foreX: -0.32, hindX: 0.25 };
    if (state.move === 'claw') return { bodyY: 1.03, bodyX: -0.05, neckX: -0.18, headX: -0.14, tailX: 0.08, foreX: -0.8, hindX: 0.1 };
    return { bodyY: 0.95, bodyX: 0.04, neckX: 0.2, headX: 0.1, tailX: 0.72, foreX: 0.1, hindX: -0.12 };
  }
  if (state.mode === 'active') {
    if (state.move === 'charge') return { bodyY: 1.02, bodyX: -0.13, neckX: -0.32, headX: -0.25, tailX: -0.15, foreX: 0.42, hindX: -0.38 };
    if (state.move === 'claw') return { bodyY: 1.02, bodyX: -0.08, neckX: -0.16, headX: -0.08, tailX: -0.1, foreX: 0.95, hindX: -0.1 };
    return { bodyY: 1, bodyX: -0.02, neckX: -0.15, headX: -0.1, tailX: -0.85, foreX: 0.25, hindX: 0.12 };
  }
  if (state.mode === 'recovery') return { bodyY: 0.94, bodyX: 0.12, neckX: 0.3, headX: 0.22, tailX: -0.28, foreX: 0.35, hindX: -0.12 };
  if (state.mode === 'observe') return { bodyY: 1 + Math.sin(state.elapsed * 4) * 0.025, bodyX: 0.015, neckX: -0.08, headX: 0.09, tailX: Math.sin(state.elapsed * 3) * 0.12, foreX: 0, hindX: 0 };
  if (state.mode === 'circle') return { bodyY: 1, bodyX: 0, neckX: -0.1, headX: 0.06, tailX: 0.2, foreX: Math.sin(state.elapsed * 9) * 0.35, hindX: -Math.sin(state.elapsed * 9) * 0.25 };
  if (state.mode === 'retreat') return { bodyY: 0.97, bodyX: 0.08, neckX: 0.14, headX: 0.08, tailX: -0.15, foreX: Math.sin(state.elapsed * 9) * 0.3, hindX: -Math.sin(state.elapsed * 9) * 0.3 };
  return { bodyY: 1, bodyX: 0, neckX: 0, headX: 0, tailX: 0, foreX: 0, hindX: 0 };
};

export function updateBehemothView(view, state, dt, visibleCollision = false) {
  const spawning = state.lifecycle === 'spawning';
  const death = state.mode === 'defeated' ? (state.lifecycleTime ?? state.deathTime ?? 0) : 0;
  const opacity = spawning ? Math.min(1, state.lifecycleTime / 2.4) : Math.max(0, 1 - Math.max(0, death - .8) / 2.4);
  view.root.visible = opacity > 0 || spawning;
  const motes = view.root.userData.arrivalMotes;
  motes.visible = spawning || (death > .8 && death < 3.2);
  motes.children.forEach((mote,i) => {
    const phase = 1-opacity;
    const angle = i*2.399 + phase*3;
    const radius = .5 + (i%7)*.23 + phase*1.8;
    mote.position.set(Math.cos(angle)*radius, (i%9)*.3 + phase*2, Math.sin(angle)*radius);
    mote.material.opacity = Math.sin(Math.PI*Math.max(.01,Math.min(.99,opacity)));
  });
  view.bodyRig.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.part) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) { material.transparent = true; material.opacity = opacity; material.depthWrite = opacity > .95; }
  });
  view.root.position.set(...state.position);
  view.root.position.y += spawning ? (1 - opacity) * 2 : death > .8 ? (1 - opacity) * .8 : 0;

  view.root.rotation.y = state.yaw;
  const p = poseFor(state);
  const blend = 1 - Math.exp(-dt * 16);
  const unconscious = state.mode === 'reaction' && ['true-stagger', 'interrupt'].includes(state.move);
  const getUp = unconscious ? Math.min(1, Math.max(0, (state.pause - state.elapsed) / 0.3)) : 0;
  const roll = state.mode === 'defeated' ? 0.72 : unconscious ? (state.move === 'true-stagger' ? 0.55 : 0.28) * getUp : 0;
  view.bodyRig.rotation.z = THREE.MathUtils.lerp(view.bodyRig.rotation.z, roll, blend);
  const sweepTurn = state.move === 'sweep' ? state.mode === 'windup' ? -0.28 : state.mode === 'active' ? 0.45 : 0 : 0;
  view.bodyRig.rotation.y = THREE.MathUtils.lerp(view.bodyRig.rotation.y, sweepTurn, blend);
  view.bodyRig.scale.y = THREE.MathUtils.lerp(view.bodyRig.scale.y, p.bodyY * BEHEMOTH.sizeScale, blend);
  view.bodyRig.rotation.x = THREE.MathUtils.lerp(view.bodyRig.rotation.x, p.bodyX, blend);
  view.neck.rotation.x = THREE.MathUtils.lerp(view.neck.rotation.x, p.neckX, blend);
  view.head.rotation.x = THREE.MathUtils.lerp(view.head.rotation.x, p.headX, blend);
  view.tail.rotation.x = THREE.MathUtils.lerp(view.tail.rotation.x, p.tailX, blend);
  view.horn.scale.y = state.parts.horn.broken ? 0.25 : 1;
  view.horn.position.y = state.parts.horn.broken ? 0.2 : 0.52;
  view.hitboxes.horn.scale.y = state.parts.horn.broken ? 0.25 : 1;
  view.hitboxes.horn.position.y = state.parts.horn.broken ? 0.2 : 0.55;
  view.tail.getObjectByName('tail tip').visible = !state.parts.tail.broken;
  view.tail.getObjectByName('tail base').scale.z = state.parts.tail.broken ? 0.32 : 0.88;
  for (const id of ['head', 'leftFore', 'rightFore', 'leftHind', 'rightHind']) {
    const group = view.partMeshes[id];
    for (const mesh of group.children.filter(child => child.isMesh && !child.userData.part && child !== view.horn)) {
      if (!mesh.userData.originalMaterial) { mesh.userData.originalMaterial = mesh.material; mesh.material = mesh.material.clone(); }
      mesh.material.color.copy(state.parts[id].broken ? new THREE.Color('#734456') : mesh.userData.originalMaterial.color);
    }
  }
  // The tail stump remains a core-only target after severing.
  view.hitboxes.tail.scale.z = state.parts.tail.broken ? 0.3 : 1;
  view.hitboxes.tail.position.z = state.parts.tail.broken ? 0.15 : 0.8;
  for (const key of ['leftFore', 'rightFore']) view.bodyRig.userData[key].rotation.x = THREE.MathUtils.lerp(view.bodyRig.userData[key].rotation.x, p.foreX, blend);
  for (const key of ['leftHind', 'rightHind']) view.bodyRig.userData[key].rotation.x = THREE.MathUtils.lerp(view.bodyRig.userData[key].rotation.x, p.hindX, blend);
  const moving = ['chase', 'circle', 'retreat', 'patrol', 'run-out'].includes(state.mode) || (state.mode === 'active' && state.move === 'charge');
  if (moving) {
    const gait = Math.sin(state.elapsed * (state.move === 'charge' || state.mode === 'run-out' ? 22 : 10)) * 0.45;
    view.bodyRig.userData.leftFore.rotation.x = gait;
    view.bodyRig.userData.rightFore.rotation.x = -gait;
    view.bodyRig.userData.leftHind.rotation.x = -gait;
    view.bodyRig.userData.rightHind.rotation.x = gait;
  } else if (state.move === 'claw' && ['windup', 'active'].includes(state.mode)) {
    view.bodyRig.userData.leftFore.rotation.x = 0.08;
  }
  view.tellZone.visible = state.mode === 'windup';
  for (const child of view.tellZone.children) child.visible = child.name === state.move;
  if (view.tellZone.visible) view.tellMaterial.opacity = 0.08 + Math.min(1, state.elapsed / BEHEMOTH.moves[state.move].tell) * 0.17;
  const interrupt = isInterruptible(state);
  view.headMarker.visible = interrupt;
  view.headMarker.position.set(0, 2.7 + Math.sin(state.elapsed * 22) * 0.08, -2.3);
  view.headMarker.position.multiplyScalar(BEHEMOTH.sizeScale);
  view.headMarker.scale.setScalar(0.9 + Math.sin(state.elapsed * 18) * 0.12);
  view.staggerRing.visible = state.mode === 'reaction' && ['interrupt', 'true-stagger'].includes(state.move);
  view.staggerRing.position.set(0, 0.1, 0);
  view.staggerRing.scale.setScalar(state.move === 'true-stagger' ? 1.15 + Math.sin(state.elapsed * 8) * 0.08 : 0.8);
  staggerColor.opacity = state.move === 'true-stagger' ? 0.95 : 0.5;
  view.staggerCrown.visible = state.mode === 'reaction' && state.move === 'true-stagger';
  view.staggerCrown.rotation.y += dt * 2.2;
  view.staggerCrown.position.y = 2.75 + Math.sin(state.elapsed * 6) * 0.08;
  view.breakRing.visible = state.mode === 'reaction' && state.move === 'part-break';
  view.breakRing.position.set(0, 0.11, 0);
  view.burstSphere.visible = state.move === 'enrageBurst' && state.mode === 'active';
  if (view.burstSphere.visible) {
    view.burstSphere.scale.setScalar(BEHEMOTH.moves.enrageBurst.reach);
    view.burstSphere.material.opacity = 0.3 * (1 - state.elapsed / BEHEMOTH.moves.enrageBurst.active);
  }
  view.tellMaterial.color.set(state.move === 'enrageBurst' ? '#ff334d' : '#ffba65');
  view.attackZone.visible = visibleCollision && state.mode === 'active';
  for (const child of view.attackZone.children) child.visible = child.name === state.move;
  for (const outline of view.outlines) outline.visible = visibleCollision;
  fur.emissive.set(state.flash > 0 ? '#7d333c' : interrupt ? '#574214' : state.mode === 'reaction' && state.move === 'true-stagger' ? '#264c65' : state.states.enrage.active ? '#a51b28' : '#000000');
  fur.emissiveIntensity = state.flash > 0 ? 0.8 : interrupt ? 0.5 : 0.32;
}
