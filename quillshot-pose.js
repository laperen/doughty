/** Shared side-fall posture for rendering and solid collision. */
export function quillshotSidePose(s) {
  if (s.move !== 'sideDrop' || !['windup', 'active', 'recovery'].includes(s.mode)) return { roll: 0, dip: 0 };
  const move = s.definition?.moves.sideDrop ?? { tell: 1, recovery: 1.2 };
  let amount = s.mode === 'windup' ? Math.min(1, s.elapsed / move.tell)
    : s.mode === 'recovery' ? Math.max(0, 1 - s.elapsed / move.recovery) : 1;
  return { roll: (s.side ?? 1) * amount * 1.15, dip: -0.4 * amount };
}
