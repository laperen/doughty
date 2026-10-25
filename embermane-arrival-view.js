import * as THREE from 'three';

// The existing encounter lifecycle owns the clock and keeps arrival non-damaging.
// Local +Z is behind the hunter-facing creature; the leap ends at its spawn point.
export function createEmbermaneArrival(root) {
  const effect = new THREE.Group(); effect.name = 'Embermane arrival'; root.add(effect);
  const fire = new THREE.Group(); fire.position.set(0, 3, 7); effect.add(fire);
  const glow = new THREE.MeshBasicMaterial({ color: '#ffb94f', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, .22, 5, 36), glow);
  ring.scale.y = 1.35; fire.add(ring);
  const shards = [];
  const geometry = new THREE.ConeGeometry(.28, 1.4, 3);
  for (let i = 0; i < 22; i++) {
    const shard = new THREE.Mesh(geometry, glow); fire.add(shard); shards.push(shard);
  }
  const dustMaterial = new THREE.MeshBasicMaterial({ color: '#c9aa82', transparent: true, depthWrite: false });
  const dust = new THREE.Group(); effect.add(dust);
  for (let i = 0; i < 18; i++) dust.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 0), dustMaterial));
  effect.visible = false;
  return { effect, fire, ring, shards, glow, dust, dustMaterial };
}

export function updateEmbermaneArrival(view, state, size) {
  const a = view.root.userData.embermaneArrival;
  const spawning = state.lifecycle === 'spawning';
  a.effect.visible = spawning;
  view.bodyRig.visible = !spawning || (state.lifecycleTime ?? 0) >= .22;
  view.bodyRig.position.set(0, 0, 0);
  if (!spawning) return;
  const t = Math.max(0, Math.min(2.4, state.lifecycleTime ?? 0));
  const flight = THREE.MathUtils.clamp((t - .22) / 1.18, 0, 1);
  const settle = THREE.MathUtils.clamp((t - 1.4) / 1, 0, 1);
  const crouch = Math.sin(Math.PI * Math.min(1, settle * 2)) * (1 - settle);
  view.bodyRig.position.set(0, flight < 1 ? 1.5 * (1 - flight) + Math.sin(flight * Math.PI) * 1.4 : -.32 * crouch, 7 * (1 - flight));
  view.bodyRig.rotation.set(flight < 1 ? -.18 + flight * .42 : .18 * crouch, 0, 0);
  view.bodyRig.scale.y = size * (1 - .18 * crouch);
  view.neck.rotation.x = flight < 1 ? -.25 : .2 * crouch;
  view.head.rotation.x = flight < 1 ? -.12 : .12 * crouch;
  view.tail.rotation.x = flight < 1 ? -.25 : .2 * crouch;
  for (const key of ['leftFore', 'rightFore']) view.bodyRig.userData[key].rotation.x = flight < 1 ? -.7 + flight * 1.1 : .35 * crouch;
  for (const key of ['leftHind', 'rightHind']) view.bodyRig.userData[key].rotation.x = flight < 1 ? .65 - flight * 1.15 : -.3 * crouch;
  const opening = Math.min(1, t / .22) * Math.max(0, 1 - Math.max(0, t - .8) / .6);
  a.fire.visible = opening > 0;
  a.fire.scale.setScalar(opening); a.glow.opacity = opening * .85;
  a.ring.rotation.z = t * .8;
  a.shards.forEach((shard, i) => {
    const angle = i * Math.PI * 2 / a.shards.length + .12 * Math.sin(t * 12 + i);
    shard.position.set(Math.cos(angle) * 2.5, Math.sin(angle) * 3.1, Math.sin(i * 7) * .25);
    shard.rotation.z = angle - Math.PI / 2;
    shard.scale.setScalar(.7 + .35 * Math.sin(t * 18 + i));
  });
  const plume = THREE.MathUtils.clamp((t - 1.4) / .85, 0, 1);
  a.dust.visible = t >= 1.4 && plume < 1; a.dustMaterial.opacity = (1 - plume) * .5;
  a.dust.children.forEach((m, i) => {
    const angle = i * 2.399, radius = .8 + plume * (2 + i % 3);
    m.position.set(Math.cos(angle) * radius, .15 + Math.sin(plume * Math.PI) * .4, Math.sin(angle) * radius);
    m.scale.setScalar(1 + plume * 2);
  });
}
