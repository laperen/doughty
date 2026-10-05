import * as THREE from 'three';

/** Cinderwild-style dressing in range-local coordinates; all gameplay stays in app.js. */
export function createRangeScenery() {
  const root = new THREE.Group(); root.name = 'Open Range scenery';
  const mat = color => new THREE.MeshStandardMaterial({ color, roughness: .95 });
  const trail = mat('#9a8b70');
  const add = (geometry, material, position) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.receiveShadow = true;
    mesh.userData.movementCollision = false;
    root.add(mesh); return mesh;
  };
  // Thin dirt patches sit above the unchanged floor, away from block ledges.
  const patch = (x, z, radius, sx, sz) => {
    const mesh = add(new THREE.CircleGeometry(radius, 24), trail, [x, -.023, z]);
    mesh.rotation.x = -Math.PI / 2; mesh.scale.set(sx, sz, 1);
  };
  patch(0, -2.8, 2.8, 1, 1.7);
  patch(0, 3.8, 2.2, 1.2, 2.2);
  return root;
}
