import { createSunShadows as createShadows } from './vendor/three-foundation.min.js';
export function createSunShadows(renderer, scene, sun, state, input) {
  let size = 1024;
  try { const stored = localStorage.getItem('doughty-shadow-quality'); if (stored !== null && [0,512,1024,2048].includes(Number(stored))) size = Number(stored); } catch {}
  const shadows = createShadows(renderer, scene, sun, state, { initialSize: size }); input.value = String(size);
  const change = () => { if (shadows.setQuality(Number(input.value))) try { localStorage.setItem('doughty-shadow-quality', input.value); } catch {} };
  input.addEventListener('change', change);
  return { ...shadows, dispose() { input.removeEventListener('change', change); shadows.dispose(); } };
}
