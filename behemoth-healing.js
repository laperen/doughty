const eligibleTier = tier => tier === 'normal' || tier === 'greater';
const committed = state => ['windup', 'active', 'recovery', 'reaction', 'defeated'].includes(state.mode);

export function canAttemptHeal(state) {
  if (!eligibleTier(state.tier) || state.summonerId || state.mode === 'defeated' || state.health <= 0) return false;
  if ((state.healAttempts ?? 0) >= 2) return false;
  const fraction = state.health / (state.definition?.maxHealth ?? 1);
  return (state.healAttempts === 0 && fraction < 0.5)
    || (state.healAttempts === 1 && fraction < (state.healLastSucceeded ? 0.35 : 0.25));
}

export function cancelHealOnOutcome(state, outcome) {
  if (!state.healAttempt || !['part-break', 'true-stagger'].includes(outcome)) return;
  state.healAttempt = null;
  state.healLastSucceeded = false;
  state.mode = 'reaction';
}

/** Owns the retreat/channel phase; arena encounter positions are local to its center. */
export function stepBehemothHealing(state, dt, bounds = 68) {
  if (state.healAttempt) {
    if (state.mode === 'reaction') return false;
    const goalDistance = Math.hypot(state.position[0], state.position[2]);
    if (state.mode === 'healing-retreat') {
      if (goalDistance <= 1.5) {
        state.mode = 'healing-channel'; state.move = 'heal'; state.elapsed = 0;
      } else {
        const amount = Math.min(goalDistance - 1.5, 5 * dt);
        state.position[0] -= state.position[0] / goalDistance * amount;
        state.position[2] -= state.position[2] / goalDistance * amount;
        state.yaw = Math.atan2(state.position[0], state.position[2]);
      }
      return true;
    }
    if (state.mode === 'healing-channel') {
      state.elapsed += dt;
      if (state.elapsed >= 1.5) {
        state.health = Math.min(state.definition.maxHealth, state.health + state.definition.maxHealth * 0.25);
        state.healLastSucceeded = true;
        state.healAttempt = null;
        state.mode = 'idle'; state.move = null; state.elapsed = 0; state.pause = 0.4;
      }
      return true;
    }
    state.healAttempt = null;
    state.healLastSucceeded = false;
  }
  if (!canAttemptHeal(state) || committed(state)) return false;
  state.healAttempts = (state.healAttempts ?? 0) + 1;
  state.healAttempt = { number: state.healAttempts };
  state.healLastSucceeded = false;
  state.mode = 'healing-retreat'; state.move = 'heal'; state.elapsed = 0;
  return true;
}
