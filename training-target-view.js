import * as THREE from 'three';

/** Original timber-and-canvas practice rig, inspired by the reference's broad stationary target. */
export function createTrainingTargetView() {
  const root = new THREE.Group(); root.name = 'Open Range training dummy';
  const rig = new THREE.Group(); rig.name = 'Padded target'; root.add(rig);
  const canvas = new THREE.MeshStandardMaterial({ color: '#e6b96a', roughness: 0.92, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: '#583e30', roughness: 0.92 });
  const straps = new THREE.MeshStandardMaterial({ color: '#2c686c', roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: '#43515a', metalness: 0.45, roughness: 0.55 });
  const light = new THREE.MeshStandardMaterial({ color: '#fff1cd', roughness: 0.85 });
  const add = (parent, name, geometry, material, position) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  add(root, 'Timber base', new THREE.BoxGeometry(2.15, 0.22, 2.25), wood, [0, 0.27, 0]);
  for (const x of [-1, 1]) for (const z of [-0.8, 0.8]) {
    const foot = add(root, 'Round support', new THREE.CylinderGeometry(0.29, 0.29, 0.21, 10), metal, [x, 0.3, z]);
    foot.rotation.z = Math.PI / 2;
    add(root, 'Axle cap', new THREE.BoxGeometry(0.07, 0.12, 0.12), light, [x * 1.13, 0.3, z]);
  }
  for (const x of [-0.72, 0.72]) add(rig, 'Wood brace', new THREE.BoxGeometry(0.17, 1.1, 1.9), wood, [x, 0.92, -0.05]);
  const bolster = add(rig, 'Canvas bolster', new THREE.CylinderGeometry(0.86, 0.86, 1.8, 8), canvas, [0, 1.22, -0.05]);
  bolster.rotation.x = Math.PI / 2;
  for (const z of [-0.65, 0.5]) {
    const belt = add(rig, 'Binding', new THREE.TorusGeometry(0.87, 0.07, 4, 8), straps, [0, 1.22, z]);
    belt.scale.x = 1.01;
  }
  const front = add(rig, 'Angled strike pad', new THREE.BoxGeometry(1.35, 1.14, 0.4), canvas, [0, 1.04, 1]);
  front.rotation.x = -0.16;
  for (const [radius, color, depth] of [[0.43, straps, 0.205], [0.3, light, 0.211], [0.16, straps, 0.217]]) {
    add(front, 'Front bullseye', new THREE.CircleGeometry(radius, 24), color, [0, 0.04, depth]);
  }
  for (const side of [-1, 1]) {
    for (const [radius, color, x] of [[0.36, straps, 0.87], [0.23, light, 0.875], [0.1, straps, 0.88]]) {
      const disc = add(rig, 'Side bullseye', new THREE.CircleGeometry(radius, 24), color, [side * x, 1.22, 0]);
      disc.rotation.y = side * Math.PI / 2;
    }
  }
  const ring = add(root, 'Practice boundary', new THREE.RingGeometry(1.6, 1.64, 48), new THREE.MeshBasicMaterial({ color: '#e6b96a', side: THREE.DoubleSide }), [0, 0.02, 0]);
  ring.rotation.x = -Math.PI / 2;
  // A stable, invisible gameplay shape; recoil never changes movement/projectile collision.
  const hitbox = add(root, 'Training collision', new THREE.BoxGeometry(2.2, 2.1, 2.5), new THREE.MeshBasicMaterial({ visible: false }), [0, 1.05, 0]);
  hitbox.userData.climbable = false;
  return { root, rig, canvas, hitbox };
}

export function updateTrainingTargetView(view, state) {
  view.rig.rotation.x = -Math.sin(state.recoil * Math.PI) * 0.07;
  view.canvas.emissive.set('#8b4420');
  view.canvas.emissiveIntensity = state.recoil * 0.28;
}
