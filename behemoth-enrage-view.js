import * as THREE from 'three';

// Shared enrage presentation; each encounter still owns its combat rules and timing.
export function createEnrageEffect(root, radius) {
  const material = new THREE.MeshBasicMaterial({ color: '#ff334d', transparent: true, opacity: 0.22, depthWrite: false, wireframe: true });
  const burst = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), material);
  burst.scale.setScalar(radius); burst.visible = false; root.add(burst);
  const warningMaterial = new THREE.MeshBasicMaterial({ color: '#ff334d', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
  const warning = new THREE.Mesh(new THREE.CircleGeometry(radius, 36), warningMaterial);
  warning.rotation.x = -Math.PI / 2; warning.position.y = 0.09;
  warning.visible = false; root.add(warning);
  return { burst, warning };
}
export function updateEnrageEffect(effect, state, move) {
  const entering = ['enrage', 'enrageBurst'].includes(state.move);
  effect.warning.visible = entering && state.mode === 'windup';
  effect.warning.material.opacity = 0.08 + Math.min(1, state.elapsed / (move?.tell || 1)) * 0.17;
  effect.burst.visible = entering && state.mode === 'active';
  effect.burst.material.opacity = 0.3 * Math.max(0, 1 - state.elapsed / (move?.active || 1));
}
