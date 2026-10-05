/** Shared player stamina rules. Values are provisional playtest tuning. */
export const STAMINA = Object.freeze({ max: 100, recoveryPerSecond: 30, recoveryDelay: 2, sprintDrainPerSecond: 2, dodgeCost: 15, heavyAttackCost: 10 });

export function spendStamina(state, amount) {
  if (state.stamina < 1) return false;
  state.stamina = Math.max(0, state.stamina - amount);
  state.staminaRecoveryDelay = STAMINA.recoveryDelay;
  return true;
}

export function recoverStamina(state, dt) {
  state.staminaRecoveryDelay = Math.max(0, state.staminaRecoveryDelay - dt);
  if (state.staminaRecoveryDelay === 0) state.stamina = Math.min(STAMINA.max, state.stamina + STAMINA.recoveryPerSecond * dt);
}
