import * as THREE from 'three';

/** One local sun shadow, independent of arena and gameplay simulation. */
export function createSunShadows(renderer, scene, sun, environmentState, input) {
  const storageKey = 'doughty-shadow-quality';
  const sizes = [0, 512, 1024, 2048];
  let quality = 2;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null && sizes.includes(Number(saved))) quality = sizes.indexOf(Number(saved));
  } catch { /* Use the default when storage is unavailable. */ }

  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene.add(sun.target);
  const camera = sun.shadow.camera;
  camera.left = camera.bottom = -40;
  camera.right = camera.top = 40;
  camera.near = 1;
  camera.far = 180;
  camera.updateProjectionMatrix();
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.06;

  const apply = () => {
    const size = sizes[quality];
    const enabled = size > 0;
    const changed = renderer.shadowMap.enabled !== enabled;
    renderer.shadowMap.enabled = sun.castShadow = enabled;
    // Three.js allocates a new render target on the next render. Release the
    // previous one so repeated live quality changes do not retain GPU memory.
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapPass?.dispose();
    sun.shadow.mapPass = null;
    sun.shadow.mapSize.set(size || 512, size || 512);
    sun.shadow.needsUpdate = renderer.shadowMap.needsUpdate = true;
    if (changed) scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material) material.needsUpdate = true;
    });
    input.value = String(size);
  };
  input.addEventListener('change', () => {
    const next = sizes.indexOf(Number(input.value));
    if (next < 0) return;
    quality = next;
    apply();
    try { localStorage.setItem(storageKey, String(sizes[quality])); } catch { /* Live setting still works. */ }
  });
  apply();
  return {
    update(center) {
      // Preserve the environment's authored sun direction as the local shadow
      // coverage follows the camera's gameplay target across the island.
      const angle = environmentState.sunAngle * Math.PI / 180;
      sun.target.position.copy(center);
      sun.position.set(Math.cos(angle) * 80, 60, Math.sin(angle) * 80).add(center);
    },
  };
}
