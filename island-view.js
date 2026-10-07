import * as THREE from 'three';
import { ISLAND } from './island-encounters.js';

/** Authored collision geometry: flat territories joined by broad walkable routes. */
export function createIslandView() {
  const root = new THREE.Group(); root.name = 'Cinderwild Isle';
  const scale = ISLAND.layoutScale;
  const mat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const grass = mat('#526854'), stone = mat('#535e63'), trail = mat('#9a8b70'), bark = mat('#4d4740'), leaves = mat('#365849');
  const add = (geometry, material, position, collision = true) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(position[0] * scale, position[1], position[2] * scale);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.movementCollision = collision; root.add(mesh); return mesh;
  };
  const land = (x, z, radius, material = grass) => {
    radius *= scale;
    // Flat ground layers receive object shadows but must not shadow each
    // other: their small height separation produces striped self-shadowing.
    add(new THREE.CylinderGeometry(radius, radius * .82, 6, 14), stone, [x, -3.125, z]).castShadow = false;
    add(new THREE.CylinderGeometry(radius, radius, .2, 48), material, [x, -.125, z]).castShadow = false;
  };
  land(0, 32, 16); land(-12, 12, 13); land(1, -19, 14); land(15, 8, 12);
  const routes = [[[0,39],[-24,-9]],[[-24,-9],[24,-32]],[[0,32],[24,-32]]];
  const nearRoute = (x,z) => routes.some(([a,b]) => {
    const dx=b[0]-a[0], dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<9;
  });
  for (const [i, arena] of ISLAND.arenas.entries()) {
    const x = arena.center[0] / scale, z = arena.center[2] / scale;
    land(x, z, arena.radius / scale + 4);
    add(new THREE.CylinderGeometry(arena.radius, arena.radius, .03, 64), trail, [x, -.008, z], false).castShadow = false;
    // Broken stone perimeter keeps entrances open while communicating territory.
    for (let j = 0; j < 40; j++) {
      const a = j * Math.PI / 20;
      const px = x + Math.sin(a) * 22, pz = z + Math.cos(a) * 22;
      if (nearRoute(px,pz)) continue;
      const rock = add(new THREE.DodecahedronGeometry(1.8 + j % 3), stone, [px, .5, pz]); rock.scale.y = 1.2 + (j % 3) * .4;
    }
    add(new THREE.ConeGeometry(3, i ? 13 : 9, 5), stone, [x + (i ? 18 : -18), i ? 5 : 3, z - 15]);
  }
  const path = (a, b, width = 9) => {
    const length = Math.hypot(b[0]-a[0], b[1]-a[1]);
    // Keep paths above grass but below the arena surface to avoid distant z-fighting.
    const mesh = add(new THREE.BoxGeometry(width * scale, 1, (length + 3) * scale), trail, [(a[0]+b[0])/2, -.515, (a[1]+b[1])/2]);
    mesh.rotation.y = Math.atan2(b[0]-a[0], b[1]-a[1]);
    mesh.castShadow = false;
  };
  path([0,39],[-24,-9]); path([-24,-9],[24,-32]); path([0,32],[24,-32]);
  // Optional low ledge shortcut beside the eastern route; broad paths remain accessible.
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(5 * scale, .5 + i*.4, 4 * scale), stone, [18, (.5+i*.4)/2-.025, 19-i*4]);
  const ramp = add(new THREE.BoxGeometry(5 * scale, .4, 9 * scale), stone, [18, .75, 23]);
  ramp.rotation.x = Math.atan2(1.5, 9 * scale);
  // Small optional jump to an overlook, safely alongside the main route.
  add(new THREE.BoxGeometry(5 * scale, 1.7, 4 * scale), stone, [18, .825, 2]);
  for (const [x,z] of [[-10,39],[11,38],[-22,15],[27,7],[-44,-17],[42,-43],[8,-42]]) {
    add(new THREE.CylinderGeometry(.35,.6,5,7), bark, [x,2.4,z]);
    add(new THREE.ConeGeometry(3,7,7), leaves, [x,6,z], false);
  }
  const beacon = mat('#86dbd1'); beacon.emissive.set('#275b57');
  add(new THREE.CylinderGeometry(2.5,3,.3,16), stone, [0,.1,39]);
  add(new THREE.OctahedronGeometry(.7), beacon, [0,2.8,43], false);
  root.visible = false;
  return root;
}
