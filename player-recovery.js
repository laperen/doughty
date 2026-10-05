/** Authored prototype timings, not measured reference frame data. */
export const RECOVERY = Object.freeze({ inputBlock: 0.6, protection: 1.5, getUp: 0.5, launchSpeed: 5, pushSpeed: 5 });
export const isRecovering = (player) => Boolean(player.recovery);
export const isRecoveryProtected = (player) => Boolean(player.recovery
  && (player.recovery.phase === 'airborne' || player.recovery.protection > 0));

export function startKnockdown(player, sourcePosition) {
  if (player.health <= 0 || isRecovering(player)) return false;
  let dx = player.position[0] - sourcePosition[0];
  let dz = player.position[2] - sourcePosition[2];
  const length = Math.hypot(dx, dz);
  if (length > 0.001) { dx /= length; dz /= length; }
  else { dx = Math.sin(player.facingYaw); dz = Math.cos(player.facingYaw); }
  player.recovery = { phase: 'airborne', elapsed: 0, inputBlock: 0, protection: 0 };
  player.grounded = false;
  player.velocity = [0, RECOVERY.launchSpeed, 0];
  player.groundVelocity = [0, 0];
  player.airborneDirection = [dx, dz];
  player.airborneSpeed = RECOVERY.pushSpeed;
  player.movementAction = 'knockdown';
  player.actionTime = 0;
  player.dodgeStyle = null;
  player.climbTarget = null;
  return true;
}

export function landKnockdown(player) {
  Object.assign(player.recovery, { phase: 'prone', elapsed: 0, inputBlock: RECOVERY.inputBlock, protection: RECOVERY.protection });
  player.movementAction = 'knockdown';
  player.velocity = [0, 0, 0];
  player.groundVelocity = [0, 0];
}

export function stepRecovery(player, dt) {
  const recovery = player.recovery;
  recovery.elapsed += dt;
  if (recovery.phase === 'prone') {
    recovery.inputBlock = Math.max(0, recovery.inputBlock - dt);
    recovery.protection = Math.max(0, recovery.protection - dt);
    if (recovery.protection <= 1e-8) {
      recovery.protection = 0;
      recovery.phase = 'getting-up';
      recovery.elapsed = 0;
    }
  } else if (recovery.phase === 'getting-up' && recovery.elapsed >= RECOVERY.getUp - 1e-8) {
    player.recovery = null;
    player.movementAction = 'idle';
  }
}
