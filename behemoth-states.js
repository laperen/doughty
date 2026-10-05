/** Independent timed modes; each Behemoth owns its triggers and behavior. */
export function createTimedMode() {
  return { active: false, pending: false, remaining: 0, activations: 0, buildup: 0 };
}

export function activatePendingMode(mode, definition, blocked) {
  if (!definition.enabled || blocked || mode.active || !mode.pending) return false;
  mode.active = true;
  mode.pending = false;
  mode.buildup = 0;
  mode.remaining = definition.durations[Math.min(mode.activations, definition.durations.length - 1)];
  mode.activations += 1;
  return true;
}

export function advanceTimedMode(mode, dt) {
  if (!mode.active) return;
  mode.remaining = Math.max(0, mode.remaining - dt);
  if (mode.remaining === 0) mode.active = false;
}
