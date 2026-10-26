import { createAtmosphere } from './vendor/three-foundation.min.js';
import { RANGE_MAP } from './map-environment.js';
export function createEnvironment(scene, camera, lights, input) {
  let animate = true;
  try { animate = localStorage.getItem('doughty-cloud-animation') !== 'false'; } catch {}
  const environment = createAtmosphere({ scene, camera, lights, values: RANGE_MAP.environment, animateClouds: animate });
  input.checked = animate;
  const change = () => { environment.setAnimationEnabled(input.checked); try { localStorage.setItem('doughty-cloud-animation', String(input.checked)); } catch {} };
  input.addEventListener('change', change);
  return { ...environment, setMap(map) { environment.setEnvironment({ ...RANGE_MAP.environment, ...map?.environment }); },
    dispose() { input.removeEventListener('change', change); environment.dispose(); } };
}
