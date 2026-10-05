import { BEHEMOTH } from './behemoth.js';
/** Pure timing helpers shared by the weapon's poses and its combat clock. */
export function attackPose(move, elapsed) {
  if (!move) return { windup: 0, strike: 0, recovery: 0, active: false };
  const clamp = (n) => Math.max(0, Math.min(1, n));
  const active = elapsed >= move.startup && elapsed < move.startup + move.active;
  return {
    windup: clamp(elapsed / Math.max(move.startup, 0.001)),
    strike: clamp((elapsed - move.startup) / Math.max(move.active, 0.001)),
    recovery: clamp((elapsed - move.startup - move.active) / Math.max(move.recovery, 0.001)),
    active,
  };
}

export function damageFeedback(outcome, part = 'body', periodic = false) {
  const reactions = {
    'true-stagger': { label: 'STAGGER', color: '#8ee5ff', strength: 1 },
    interrupt: { label: 'INTERRUPT', color: '#e4ff91', strength: 0.8 },
    'part-break': { label: `${BEHEMOTH.parts[part]?.label.toUpperCase() ?? 'PART'} BROKEN`, color: '#ffc28b', strength: 0.7 },
    defeated: { label: 'BEHEMOTH DEFEATED', color: '#e4ff91', strength: 1.1 },
    hurt: { label: '', color: '#ff887c', strength: 0.65 },
  };
  return reactions[outcome] ?? { label: '', color: periodic ? '#b3a4ff' : BEHEMOTH.parts[part] ? '#ffe09b' : '#f2f7ff', strength: periodic ? 0 : 0.18 };
}
