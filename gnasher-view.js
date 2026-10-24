import * as THREE from 'three';
import { GNASHER, GNASHER_TUNING, isGnasherInterruptible } from './gnasher.js';
import { createEnrageEffect, updateEnrageEffect } from './behemoth-enrage-view.js';
const BROKEN_COLOR = new THREE.Color('#734456');

/** Procedural reference-informed silhouette with a high spine crest, powerful haunches and segmented tail. */
export function createGnasherView(scene) {
  const root = new THREE.Group(), rig = new THREE.Group(); root.name = 'Gnasher'; root.add(rig); scene.add(root);
  const skin = new THREE.MeshStandardMaterial({ color: '#a08052', roughness: .94, flatShading: true });
  const belly = new THREE.MeshStandardMaterial({ color: '#554337', roughness: .95, flatShading: true });
  const plate = new THREE.MeshStandardMaterial({ color: '#579a90', roughness: .7, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#302b3b', roughness: .8, flatShading: true });
  const ivory = new THREE.MeshStandardMaterial({ color: '#dfc58b', roughness: .7 });
  const mane = new THREE.MeshStandardMaterial({ color: '#ae7746', roughness: .9, flatShading: true });
  const maneTip = new THREE.MeshStandardMaterial({ color: '#d7ad70', roughness: .86, flatShading: true });
  const eye = new THREE.MeshStandardMaterial({ color: '#efba66', emissive: '#773711', emissiveIntensity: .6 });
  const mouth = new THREE.MeshStandardMaterial({ color: '#281725', roughness: .9 });
  const tongue = new THREE.MeshStandardMaterial({ color: '#9f5261', roughness: .8 });
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const scaleGeometry = new THREE.IcosahedronGeometry(1, 0);
  // A curved, tapered leaf rather than a straight cone gives the crest a fur-like silhouette.
  const thorn = new THREE.BufferGeometry(), vertices = [], indices = [];
  const rings = 6, sides = 6;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings, radius = Math.pow(1 - t, .78);
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2;
      vertices.push(Math.cos(angle) * radius, t, Math.sin(angle) * radius * .48 + t * t * .22);
    }
  }
  for (let r = 0; r < rings; r++) for (let j = 0; j < sides; j++) {
    const a = r * sides + j, b = r * sides + (j + 1) % sides;
    indices.push(a, a + sides, b, b, a + sides, b + sides);
  }
  thorn.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); thorn.setIndex(indices); thorn.computeVertexNormals();
  const parts = {}, hitboxes = {}, outlines = [];
  const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  function blob(parent, position, scale, material = skin, geometry = sphere) {
    const m = new THREE.Mesh(geometry, material); m.position.set(...position); m.scale.set(...scale); m.castShadow = true; parent.add(m); return m;
  }
  function spike(parent, base, tip, width, material = mane) {
    const direction = new THREE.Vector3(...tip).sub(new THREE.Vector3(...base));
    const m = blob(parent, base, [width, direction.length(), width], material, thorn);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return m;
  }
  function hitbox(parent, id, position, scale) {
    const m = blob(parent, position, scale, invisible, box); m.userData.part = id; hitboxes[id] = m;
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: '#ffe487' })); m.add(line); outlines.push(line);
  }
  blob(rig, [0, 1.9, .25], [1.03, 1.13, 1.5]);
  blob(rig, [0, 1.64, -.85], [.91, .9, .93]);
  blob(rig, [0, 1.35, -.48], [.84, .65, 1.3], belly);
  hitbox(rig, 'body', [0, 1.8, .1], [2.1, 2.3, 3.05]);
  // Dense central crest and two swept-back outer rows, tallest over the shoulders.
  for (let row = -1; row <= 1; row++) for (let i = 0; i < 11; i++) {
    const z = -1.18 + i * .265;
    const arch = Math.sin(i / 10 * Math.PI);
    const y = 2.2 + arch * .52;
    const length = (.8 + Math.sin((i + 1) / 12 * Math.PI) * .85) * (row ? .72 : 1);
    spike(rig, [row * .32, y, z], [row * (.5 + arch * .3), y + length, z + .45], .17 + arch * .06, i % 3 ? mane : maneTip);
  }
  // Overlapping scales follow the barrel instead of forming a rectangular shell.
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
    const z = -1.18 + i * .3 + row * .08, arch = Math.sin(i / 8 * Math.PI);
    const m = blob(rig, [side * (.45 + row * .2), 2.28 + arch * .39 - row * .21, z], [.28, .10, .34], plate, scaleGeometry);
    m.rotation.z = -side * (.35 + row * .2); m.rotation.x = -.25;
  }
  for (const [id, side, hind] of [['leftFore', -1, false], ['rightFore', 1, false], ['leftHind', -1, true], ['rightHind', 1, true]]) {
    const leg = new THREE.Group(); leg.position.set(side * (hind ? .98 : .88), hind ? 1.3 : 1.35, hind ? .95 : -1.05); rig.add(leg); parts[id] = leg;
    if (hind) {
      blob(leg, [side * .12, -.05, -.05], [.65, .77, .72]);
      blob(leg, [side * .19, -.62, .12], [.27, .5, .31], belly);
      blob(leg, [side * .18, -1.06, -.16], [.4, .2, .69], dark);
      for (let row = 0; row < 3; row++) for (let n = 0; n < 3; n++) {
        const m = blob(leg, [side * (.33 + n * .10), .3 - row * .27, -.48 + n * .25], [.18, .25, .18], ivory);
        m.rotation.z = side * .45;
      }
      for (const toe of [-.25, 0, .25]) spike(leg, [side * .18 + toe, -1.05, -.52], [side * .18 + toe, -1.15, -.98], .11, ivory);
      hitbox(leg, id, [side * .12, -.35, -.03], [1.25, 1.95, 1.5]);
    } else {
      blob(leg, [side * .08, -.15, .02], [.26, .42, .3], belly);
      blob(leg, [side * .14, -.52, -.18], [.24, .3, .26], skin);
      for (const toe of [-.15, 0, .15]) spike(leg, [side * .14 + toe, -.66, -.25], [side * .14 + toe, -.9, -.46], .075, ivory);
      hitbox(leg, id, [side * .1, -.35, -.08], [.65, 1.2, .8]);
    }
  }
  const head = new THREE.Group(); head.position.set(0, 1.28, -1.75); rig.add(head); parts.head = head;
  blob(head, [0, .08, -.08], [.62, .54, .75], skin);
  blob(head, [0, -.12, -.72], [.45, .31, .53], skin);
  blob(head, [0, -.24, -1.02], [.42, .14, .2], dark);
  blob(head, [0, -.45, -.83], [.41, .28, .35], mouth);
  blob(head, [0, -.57, -.84], [.26, .09, .26], tongue);
  blob(head, [0, -.65, -.62], [.4, .14, .43], belly);
  for (const side of [-1, 1]) {
    const socket = blob(head, [side * .49, .13, -.54], [.17, .14, .14], dark); socket.rotation.z = side * .3;
    blob(head, [side * .54, .13, -.59], [.065, .065, .08], eye);
    const tooth = blob(head, [side * .14, -.43, -1.19], [.12, .27, .13], ivory, box); tooth.rotation.x = -.16;
    spike(head, [side * .4, .27, -.62], [side * .78, .45, -.32], .18, maneTip);
    // Layered cheek ruff sweeps outward/back, without round teddy-bear ears.
    for (let i = 0; i < 7; i++) {
      const a = i / 6 * Math.PI * .85;
      spike(head, [side * .46, .1 + Math.cos(a) * .24, -.13], [side * (.82 + Math.sin(a) * .3), .12 + Math.cos(a) * .57, .15 + i * .06], .15, i % 2 ? mane : maneTip);
    }
  }
  for (let i = -2; i <= 2; i++) spike(head, [i * .12, .43, -.3], [i * .2, .82 - Math.abs(i) * .08, .02], .15, maneTip);
  hitbox(head, 'head', [0, -.05, -.35], [1.7, 1.65, 2.05]);
  const tail = new THREE.Group(); tail.position.set(0, 1.25, 1.45); rig.add(tail); parts.tail = tail;
  const tailBase = blob(tail, [0, -.03, .43], [.42, .34, .8], belly);
  const paddle = new THREE.Group(); tail.add(paddle);
  // Six broad shingled segments flare toward a heavy, slightly notched tip.
  for (let i = 0; i < 6; i++) {
    const z = .42 + i * .53, width = .42 + i * .145;
    const shape = new THREE.Shape();
    shape.moveTo(-width * .8, z); shape.lineTo(-width, z + .58);
    shape.quadraticCurveTo(-width * .45, z + .64, 0, z + .55);
    shape.quadraticCurveTo(width * .45, z + .64, width, z + .58);
    shape.lineTo(width * .8, z); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: .22, bevelEnabled: true, bevelSize: .07, bevelThickness: .055, bevelSegments: 1, steps: 1 });
    geo.rotateX(Math.PI / 2);
    const segment = new THREE.Mesh(geo, dark); segment.position.y = .08 - i * .014; segment.castShadow = true; paddle.add(segment);
    // Narrow curved seams emphasize the ridges, rather than detached crossbars.
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-width * .8, .095 - i * .014, z + .02), new THREE.Vector3(0, .15 - i * .014, z - .04), new THREE.Vector3(width * .8, .095 - i * .014, z + .02)]);
    const seam = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, .035, 5, false), plate); paddle.add(seam);
  }
  hitbox(tail, 'tail', [0, -.05, 2], [2.4, .7, 3.75]);
  // Per-part copies keep break discoloration local to the injured body part.
  const partMaterials = [];
  for (const [id, group] of Object.entries(parts)) {
    if (id === 'tail') continue;
    const copies = new Map();
    group.traverse(mesh => {
      if (!mesh.isMesh || mesh.userData.part) return;
      const source = mesh.material;
      if (!copies.has(source)) {
        const material = source.clone(); copies.set(source, material);
        partMaterials.push({ id, source, material });
      }
      mesh.material = copies.get(source);
    });
  }
  const warningMaterial = new THREE.MeshBasicMaterial({ color: '#ffbb65', transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide });
  const tellZone = new THREE.Group(); root.add(tellZone);
  const disc = (radius, x, z) => { const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), warningMaterial); m.rotation.x = -Math.PI / 2; m.position.set(x, .06, z); return m; };
  const foot = disc(1.9, 1.65, -.7); tellZone.add(foot);
  // Only the striking half is shown, matching the strict center-line collision clip.
  foot.geometry.dispose(); foot.geometry = new THREE.CircleGeometry(1.9, 48, -Math.acos(-1.65 / 1.9), 2 * Math.acos(-1.65 / 1.9));
  const tailWarning = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.5), warningMaterial); tailWarning.rotation.x = -Math.PI / 2; tailWarning.position.set(0, .06, 3.25); tellZone.add(tailWarning);
  const sweep = new THREE.Mesh(new THREE.CircleGeometry(5, 48, Math.PI / 2 - 110 * Math.PI / 180, 220 * Math.PI / 180), warningMaterial);
  sweep.geometry.rotateX(-Math.PI / 2); sweep.position.y = .06; sweep.rotation.y = Math.PI; tellZone.add(sweep);
  const charge = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 8), warningMaterial); charge.rotation.x = -Math.PI / 2; charge.position.set(0, .06, -3); tellZone.add(charge);
  const marker = new THREE.Mesh(new THREE.TorusGeometry(.5, .05, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffdc65' })); marker.position.set(0, 1.5, -2.8); root.add(marker);
  const enrageEffect = createEnrageEffect(root, GNASHER.moves.enrageBurst.reach);
  const arrivalMotes = new THREE.Group();
  const moteMaterial = new THREE.MeshBasicMaterial({ color: '#8ef5ef', transparent: true, depthWrite: false });
  const moteGeometry = new THREE.OctahedronGeometry(1);
  for (let i = 0; i < 40; i++) {
    const mote = new THREE.Mesh(moteGeometry, moteMaterial); mote.scale.setScalar(.07 + (i % 3) * .025); arrivalMotes.add(mote);
  }
  root.add(arrivalMotes);
  const projectileRoot = new THREE.Group(); scene.add(projectileRoot);
  const blastGeometry = new THREE.SphereGeometry(1, 16, 8);
  const blastMaterial = new THREE.MeshBasicMaterial({ color: '#ee9b54', wireframe: true });
  return { root, rig, skin, belly, plate, dark, ivory, mane, maneTip, eye, mouth, tongue,
    parts, partMaterials, hitboxes, outlines, paddle, tailBase, arrivalMotes, marker, tellZone, foot, tailWarning, sweep, charge,
    enrageEffect, projectileRoot, projectileMeshes: new Map(), blastGeometry, blastMaterial };
}

export function updateGnasherView(v, s, dt, collision = false) {
  const scale = s.definition.sizeScale;
  v.root.position.set(...s.position); v.root.rotation.y = s.yaw; v.root.scale.setScalar(scale);
  const spawning = s.lifecycle === 'spawning', dead = s.mode === 'defeated';
  const arrival = spawning ? Math.min(1, (s.lifecycleTime ?? 0) / 2.4) : 1;
  const death = dead ? (s.lifecycleTime ?? s.deathTime ?? 0) : 0;
  const opacity = Math.max(0, 1 - Math.max(0, death - .8) / 2.4);
  v.root.visible = s.lifecycle !== 'absent' && opacity > 0;
  v.root.position.y += spawning ? -(1 - arrival) * 3 : death > .8 ? (1 - opacity) * .8 : 0;
  v.arrivalMotes.visible = death > .8 && death < 3.2;
  v.arrivalMotes.children.forEach((mote, i) => {
    const phase = 1 - opacity, angle = i * 2.399 + phase * 3;
    const radius = .5 + (i % 7) * .23 + phase * 1.8;
    mote.position.set(Math.cos(angle) * radius, (i % 9) * .3 + phase * 2, Math.sin(angle) * radius);
    mote.material.opacity = Math.sin(Math.PI * Math.max(.01, Math.min(.99, opacity)));
  });
  v.rig.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.part) return;
    mesh.material.transparent = true; mesh.material.opacity = opacity; mesh.material.depthWrite = opacity > .95;
  });
  v.projectileRoot.visible = v.root.visible;
  v.rig.rotation.set(0, 0, 0); v.rig.position.set(0, 0, 0);
  v.parts.tail.rotation.set(0, 0, 0); v.parts.head.rotation.set(0, 0, 0);
  const m = s.definition.moves[s.move];
  const windup = s.mode === 'windup' && m ? Math.min(1, s.elapsed / m.tell) : 0;
  const active = s.mode === 'active' && m ? Math.min(1, s.elapsed / m.active) : 0;
  const recovery = s.mode === 'recovery' && m ? Math.max(0, 1 - s.elapsed / m.recovery) : 0;
  if (s.mode === 'reaction' || dead) {
    v.rig.rotation.z = dead ? .72 : s.move === 'part-break' ? Math.sin(s.elapsed * 12) * .18 : 1.15;
    v.rig.position.y = -.35;
  } else if (s.move === 'charge') {
    v.rig.rotation.x = s.mode === 'active' ? -active * Math.PI * 2 : windup * .25;
    v.rig.position.y = s.mode === 'active' ? Math.sin(active * Math.PI) * .7 : 0;
    // Rotate about the torso, keeping the roll above the ground plane.
    v.rig.position.y += 1.4 * (1 - Math.cos(v.rig.rotation.x));
    v.rig.position.z = -1.4 * Math.sin(v.rig.rotation.x);
  } else if (s.move === 'tailSlam') {
    v.parts.tail.rotation.x = s.mode === 'windup' ? -windup * 1.5 : s.mode === 'active' ? -1.5 + active * 1.7 : .2 * recovery;
    v.rig.position.y = s.mode === 'active' ? -.15 * Math.sin(active * Math.PI) : 0;
    if (s.mode === 'windup' && s.slamStep?.distance > 0) {
      v.rig.position.y += .1 * Math.sin(Math.PI * Math.min(1, s.elapsed / GNASHER_TUNING.tailChaseWindow));
    }
  } else if (s.move === 'tailSweep') v.parts.tail.rotation.y = s.mode === 'windup' ? -.8 * windup : s.mode === 'active' ? -.8 + active * 2.8 : 2 * recovery;
  else if (s.move === 'footSlam') v.rig.rotation.z = s.side * (windup * .18 + recovery * .04);
  else if (s.move === 'enrageBurst') { v.rig.rotation.x = -.12; v.rig.position.y = Math.sin(s.elapsed * 18) * .08; }
  for (const [id, part] of Object.entries(v.parts)) {
    if (id.includes('Fore') || id.includes('Hind')) {
      part.rotation.x = ['chase', 'patrol', 'run-out'].includes(s.mode) ? Math.sin(s.elapsed * (s.mode === 'run-out' ? 18 : 10) + part.position.x * 2) * (s.mode === 'run-out' ? .45 : .3) : 0;
      if (s.move === 'footSlam' && Math.sign(part.position.x) === s.side) part.rotation.x += windup * .7;
      if (s.move === 'tailSlam' && s.mode === 'windup' && s.slamStep?.distance > 0 && s.elapsed < GNASHER_TUNING.tailChaseWindow) {
        part.rotation.x += .2 * Math.sin(Math.PI * s.elapsed / GNASHER_TUNING.tailChaseWindow) * Math.sign(part.position.x);
      }
    }
  }
  // Match Embermane's severed-tail convention: remove the tip, retain a core-only stump.
  const severed = s.parts.tail.broken;
  v.paddle.visible = !severed;
  v.tailBase.scale.z = severed ? .28 : .8; v.tailBase.position.z = severed ? .15 : .43;
  v.hitboxes.tail.scale.set(severed ? .84 : 2.4, .7, severed ? .85 : 3.75);
  v.hitboxes.tail.position.z = severed ? .14 : 2;
  v.skin.emissive.set(s.flash > 0 ? '#86453a' : s.states.enrage.active ? '#6c1923' : '#000000');
  v.plate.color.set(s.states.enrage.active ? '#b84e48' : '#579a90');
  for (const { id, source, material } of v.partMaterials) {
    material.color.copy(s.parts[id]?.broken ? BROKEN_COLOR : source.color);
    material.emissive.copy(source.emissive);
  }
  v.marker.visible = isGnasherInterruptible(s);
  for (const line of v.outlines) line.visible = collision;
  v.tellZone.visible = s.mode === 'windup' || collision && s.mode === 'active';
  v.foot.visible = s.move === 'footSlam'; v.foot.position.x = s.side * 1.65; v.foot.rotation.z = s.side < 0 ? Math.PI : 0;
  v.tailWarning.visible = !severed && s.move === 'tailSlam';
  v.sweep.visible = !severed && s.move === 'tailSweep';
  v.charge.visible = s.move === 'charge';
  updateEnrageEffect(v.enrageEffect, s, m);
  v.enrageEffect.burst.scale.setScalar(s.definition.moves.enrageBurst.reach);
  const live = new Set(s.projectiles.map(q => q.id));
  for (const [id, mesh] of v.projectileMeshes) if (!live.has(id)) { mesh.removeFromParent(); v.projectileMeshes.delete(id); }
  for (const q of s.projectiles) {
    let mesh = v.projectileMeshes.get(q.id);
    if (!mesh) { mesh = new THREE.Mesh(v.blastGeometry, v.blastMaterial); v.projectileRoot.add(mesh); v.projectileMeshes.set(q.id, mesh); }
    const t = Math.max(0, Math.min(1, (q.age - q.delay) / q.life));
    mesh.visible = q.emitted;
    mesh.position.set(...q.position); mesh.position.y += .08;
    mesh.scale.set(q.radius, q.age < q.delay ? .035 : .15 + Math.sin(t * Math.PI) * q.radius, q.radius);
  }
  v.root.updateMatrixWorld(true);
}
