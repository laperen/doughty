// Stable compound footprints authored against the procedural models, in model
// units. Rounded segments avoid snagging on corners during melee movement.
// [x, startZ, endZ, radius, bottom, top, optional breakable part]
import { quillshotSidePose } from './quillshot-pose.js';
const EMBER = [
  [0, -.7, .65, 1.06, .65, 2.55],
  [0, -1.55, -1.1, .68, 1.1, 2.55],
  [0, -2.7, -2.05, .57, 1.2, 2.5],
  ...[-1, 1].flatMap(side => [[side * .79, -1.11, -.85, .35, 0, 1.5], [side * .72, .76, 1.1, .35, 0, 1.4]]),
  [0, 1.55, 2.9, .29, 1.4, 2.1, 'tail'],
];
const QUILL = [
  [0, -.65, .55, 1.5, .35, 2.7],
  [0, -1.05, -.9, 1.55, .55, 2.7],
  [0, -2.72, -2.05, .85, .35, 1.85],
  ...[-1, 1].flatMap(side => [[side * 1.15, -1.3, -1.05, .5, 0, 1.4], [side * 1.05, 1.08, 1.3, .5, 0, 1.4]]),
  [0, 2, 3.05, .33, .75, 1.4, 'tail'],
  [-.8, -3.1, -2.7, .2, .4, 1.7, 'leftTusk'],
  [.8, -3.1, -2.7, .2, .4, 1.7, 'rightTusk'],
];
const GNASHER = [
  [0, -.85, .85, 1.03, .7, 3.03],
  [0, -2.65, -1.75, .65, .6, 1.95],
  ...[-1, 1].flatMap(side => [[side * .98, -1.2, -.95, .32, .4, 1.75], [side * 1.1, .7, 1.15, .6, 0, 2.05]]),
  [0, 2.1, 4.6, .8, .9, 1.65, 'tail'],
];

/** Deepest horizontal capsule contact; shared by travel and overlap queries. */
export function behemothPushOut(state, position, radius, height) {
  const quill = state.speciesId === 'quillshot';
  const scale = state.definition?.sizeScale ?? (quill ? 1.5 : 1.2);
  const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
  const dx = position[0] - state.position[0], dz = position[2] - state.position[2];
  const x = c * dx - s * dz, z = s * dx + c * dz;
  const y = position[1] - state.position[1];
  const pose = quill ? quillshotSidePose(state) : { roll: 0, dip: 0 };
  const rollCos = Math.cos(pose.roll), rollSin = Math.sin(pose.roll);
  let best = null, deepest = 0;
  for (const [cx, start, end, r, bottom, top, part] of state.speciesId === 'gnasher' ? GNASHER : quill ? QUILL : EMBER) {
    if (part && state.parts?.[part]?.broken) continue;
    const midY = (bottom + top) / 2, halfY = (top - bottom) / 2;
    const rolledX = cx * rollCos - midY * rollSin;
    const rolledY = cx * rollSin + midY * rollCos + pose.dip;
    const verticalRadius = halfY * Math.abs(rollCos) + r * Math.abs(rollSin);
    if (y >= (rolledY + verticalRadius) * scale || y + height <= (rolledY - verticalRadius) * scale) continue;
    const ox = x - rolledX * scale;
    const oz = z - Math.max(start * scale, Math.min(end * scale, z));
    const horizontalRadius = r * Math.abs(rollCos) + halfY * Math.abs(rollSin);
    const distance = Math.hypot(ox, oz), depth = horizontalRadius * scale + radius - distance;
    if (depth <= deepest) continue;
    // On the segment axis, the nearest exit is sideways.
    const nx = distance > 1e-8 ? ox / distance : (x < 0 ? -1 : 1);
    const nz = distance > 1e-8 ? oz / distance : 0;
    best = [(c * nx + s * nz) * depth, (-s * nx + c * nz) * depth];
    deepest = depth;
  }
  return best;
}
