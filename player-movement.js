import { isRecovering, landKnockdown, stepRecovery } from './player-recovery.js';
import { STAMINA, recoverStamina, spendStamina } from './stamina.js';

/**
 * Small, renderer-independent player movement simulation.
 * State and input are plain data so a later network layer can serialize them.
 */
export const MOVEMENT_CONFIG = Object.freeze({
  walkSpeed: 5.2,
  runSpeed: 8,
  airSpeed: 4.2,
  groundAcceleration: 28,
  groundBraking: 18,
  facingTurnSpeed: 12,
  jumpSpeed: 7.35,
  gravity: 20,
  playerRadius: 0.36,
  playerHeight: 1.72,
  maxClimbHeight: 1.35,
  climbDuration: 0.38,
  fallResetY: -5,
  dodgeDuration: 0.62 * (2 / 3),
  dodgeSpeed: 9.2,
  dodgeInputBlock: 0.2,
});

export const DEFAULT_DODGE = Object.freeze({
  id: 'diving-roll',
  duration: MOVEMENT_CONFIG.dodgeDuration,
  cooldown: MOVEMENT_CONFIG.dodgeDuration / 2,
  speed: MOVEMENT_CONFIG.dodgeSpeed,
  animation: 'crouched-dive-roll',
  groundedOnly: true,
});

export const ARENA_SCALE = 1.5;

const LOCAL_ARENA_COLLIDERS = [
  // Solid walls. The south opening (z = 0) is deliberately left clear.
  { minX: -10, maxX: 10, minZ: -10.21, maxZ: -9.79, minY: -0.2, maxY: 5.2 },
  { minX: -10.21, maxX: -9.79, minZ: -10, maxZ: 0, minY: -0.2, maxY: 5.2 },
  { minX: 9.79, maxX: 10.21, minZ: -10, maxZ: 0, minY: -0.2, maxY: 5.2 },
  // Graybox marker blocks.
  { minX: -6.9, maxX: -5.5, minZ: -5.1, maxZ: -3.7, minY: 0, top: 1.4 },
  { minX: 5.25, maxX: 6.35, minZ: -4.35, maxZ: -3.25, minY: 0, top: 1.1 },
  { minX: 0.5, maxX: 2.3, minZ: 4.4, maxZ: 6.2, minY: 0, top: 1.8 },
];
export const ARENA_COLLIDERS = Object.freeze(LOCAL_ARENA_COLLIDERS.map((box) => Object.freeze({
  minX: box.minX * ARENA_SCALE,
  maxX: box.maxX * ARENA_SCALE,
  minZ: box.minZ * ARENA_SCALE,
  maxZ: box.maxZ * ARENA_SCALE,
  minY: box.minY,
  maxY: box.top ?? box.maxY,
  ...(box.top === undefined ? {} : { top: box.top }),
})));

const FLOOR = Object.freeze({ minX: -10 * ARENA_SCALE, maxX: 10 * ARENA_SCALE, minZ: -10 * ARENA_SCALE, maxZ: 10 * ARENA_SCALE, y: -0.025 });
const MAX_STEP = 1 / 60;

export function createPlayerState(position = [0, FLOOR.y, 1.5]) {
  return {
    position: [...position],
    velocity: [0, 0, 0],
    groundVelocity: [0, 0],
    facingYaw: 0,
    immediateFacingYaw: 0,
    grounded: true,
    airborneSpeed: null,
    airborneDirection: null,
    movementAction: 'idle',
    actionTime: 0,
    dodgeCooldown: 0,
    dodgeInputBlock: 0,
    dodgeStyle: null,
    dodgeDirection: [0, 0],
    stamina: STAMINA.max,
    health: 100,
    invulnerability: 0,
    recovery: null,
    staminaRecoveryDelay: 0,
    sprintExhausted: false,
    statModifiers: [],
    lastGroundedPosition: [...position],
  };
}

/** No weapon (sheathed), melee, ranged and weapon overrides use this policy. */
export function resolveWeaponMovement(weapon = null) {
  const movement = weapon?.movement ?? {};
  return {
    facing: movement.facing ?? (weapon?.kind === 'ranged' ? 'aim' : 'travel'),
    camera: {
      distance: movement.camera?.distance ?? 8.67,
      height: movement.camera?.height ?? 3.47,
      shoulder: movement.camera?.shoulder ?? 0,
      fov: movement.camera?.fov ?? 48,
    },
    dodge: { ...DEFAULT_DODGE, ...(movement.dodge ?? {}) },
  };
}

function isOnFloor(x, z, radius, bounds = FLOOR) {
  return x - radius >= bounds.minX && x + radius <= bounds.maxX
    && z - radius >= bounds.minZ && z + radius <= bounds.maxZ;
}

function collides(x, z, radius, colliders, feetY, playerHeight) {
  return colliders.some((box) => {
    const verticallyOverlapping = feetY < box.maxY && feetY + playerHeight > box.minY;
    if (!verticallyOverlapping) return false;
    const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
    const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - nearestX;
    const dz = z - nearestZ;
    return dx * dx + dz * dz < radius * radius;
  });
}

/**
 * Collision worlds may be backed by boxes, triangle meshes, compound shapes,
 * or a physics engine. Positions are world-space and feet-based.
 */
function overlaps(world, position, config) {
  if (world?.overlapsCapsule) return world.overlapsCapsule(position, config.playerRadius, config.playerHeight);
  return collides(position[0], position[2], config.playerRadius, world, position[1], config.playerHeight);
}

function moveWithWorld(state, dx, dz, config, world) {
  if (world?.moveCapsule) {
    const result = world.moveCapsule(state.position, [dx, 0, dz], config.playerRadius, config.playerHeight);
    state.position = result.position;
    const wallContact = result.contacts?.find((normal) => Math.abs(normal[1]) < 0.65);
    return wallContact ? { normal: wallContact } : null;
  }
  if (!world?.overlapsCapsule) {
    moveOnFloor(state, dx, dz, config, world);
    return null;
  }
  const radius = config.playerRadius;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.35)));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let contact = null;
  for (let i = 0; i < steps; i += 1) {
    for (const [axis, amount] of [[0, stepX], [2, stepZ]]) {
      if (Math.abs(amount) < 1e-8) continue;
      const candidate = [...state.position];
      candidate[axis] += amount;
      if (!overlaps(world, candidate, config)) state.position[axis] = candidate[axis];
      else contact ??= world.sweepCapsule?.(state.position, [axis === 0 ? Math.sign(amount) : 0, 0, axis === 2 ? Math.sign(amount) : 0], radius, config.playerHeight) ?? { direction: [axis === 0 ? -Math.sign(amount) : 0, 0, axis === 2 ? -Math.sign(amount) : 0] };
    }
  }
  return contact;
}

function findClimbTarget(world, state, direction, config) {
  if (!world?.raycast || !direction || Math.hypot(direction[0], direction[2]) < 0.05) return null;
  const horizontal = [direction[0], 0, direction[2]];
  const magnitude = Math.hypot(horizontal[0], horizontal[2]);
  horizontal[0] /= magnitude;
  horizontal[2] /= magnitude;
  const origin = [state.position[0], state.position[1] + config.playerHeight * 0.55, state.position[2]];
  const wall = world.raycast(origin, horizontal, config.playerRadius + 0.16);
  if (!wall || wall.climbable === false || wall.normal?.[1] > 0.45) return null;
  const topOrigin = [wall.point[0] + horizontal[0] * (config.playerRadius + 0.08), state.position[1] + config.maxClimbHeight + 0.08, wall.point[2] + horizontal[2] * (config.playerRadius + 0.08)];
  const down = world.raycast(topOrigin, [0, -1, 0], config.maxClimbHeight + 0.16);
  if (!down || down.climbable === false || down.normal?.[1] < 0.65) return null;
  const rise = down.point[1] - state.position[1];
  if (rise < 0.18 || rise > config.maxClimbHeight) return null;
  const destination = [topOrigin[0], down.point[1] + 0.015, topOrigin[2]];
  if (overlaps(world, destination, config)) return null;
  return { position: destination, duration: config.climbDuration };
}

function moveOnFloor(state, dx, dz, config, colliders) {
  const radius = config.playerRadius;
  // Small substeps keep fast dodges from tunnelling through thin obstacles.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.45)));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  for (let i = 0; i < steps; i += 1) {
    const nextX = state.position[0] + stepX;
    if (!collides(nextX, state.position[2], radius, colliders, state.position[1], config.playerHeight)) state.position[0] = nextX;
    const nextZ = state.position[2] + stepZ;
    if (!collides(state.position[0], nextZ, radius, colliders, state.position[1], config.playerHeight)) state.position[2] = nextZ;
  }
}

/** Mutates state by one frame. Input fields are moveX, moveY, sprintHeld, jumpPressed, dodgePressed, aimYaw. */
export function stepPlayer(state, input, delta, {
  config = MOVEMENT_CONFIG,
  colliders = ARENA_COLLIDERS,
  collisionWorld = null,
  floorBounds = FLOOR,
  weapon = null,
  staminaState = state,
} = {}) {
  let remaining = Math.min(Math.max(delta, 0), 0.05);
  const inputsBlocked = state.dodgeInputBlock > 0;
  state.dodgeInputBlock = Math.max(0, state.dodgeInputBlock - remaining);
  if (inputsBlocked) input = { ...input, moveX: 0, moveY: 0, sprintHeld: false, jumpPressed: false, dodgePressed: false };
  const movement = resolveWeaponMovement(weapon);
  if (isRecovering(state)) {
    const recovery = state.recovery;
    if (recovery.phase === 'airborne') {
      // Reuse collision/landing integration with all player actions suppressed.
      state.recovery = null;
      stepPlayer(state, { moveX: 0, moveY: 0, cameraYaw: input.cameraYaw ?? 0 }, remaining,
        { config, colliders, collisionWorld, floorBounds, weapon, staminaState });
      state.recovery = recovery;
      recovery.elapsed += remaining;
      state.movementAction = 'knockdown';
      if (state.grounded) landKnockdown(state);
      return state;
    }
    const canDodge = recovery.phase === 'prone' && recovery.inputBlock <= 1e-8
      && input.dodgePressed && state.dodgeCooldown <= 0 && staminaState.stamina > 0;
    if (canDodge) {
      state.recovery = null; // The normal dodge below pays stamina and owns its own protection.
    } else {
      recoverStamina(staminaState, remaining);
      state.dodgeCooldown = Math.max(0, state.dodgeCooldown - remaining);
      stepRecovery(state, remaining);
      return state;
    }
  }
  const length = Math.hypot(input.moveX, input.moveY);
  const world = collisionWorld ?? colliders;
  const surfaces = Array.isArray(world) ? world.filter((box) => box.top !== undefined) : [];
  const moveX = length > 1 ? input.moveX / length : input.moveX;
  const moveY = length > 1 ? input.moveY / length : input.moveY;

  if (!input.sprintHeld) state.sprintExhausted = false;
  if (input.dodgePressed && state.dodgeCooldown <= 0
    && (!movement.dodge.groundedOnly || state.grounded) && state.movementAction !== 'dodge') {
    if (!spendStamina(staminaState, STAMINA.dodgeCost)) return;
    const directionLength = Math.hypot(moveX, moveY);
    const localX = directionLength > 0.05 ? moveX / directionLength : 0;
    const localY = directionLength > 0.05 ? moveY / directionLength : 0;
    const direction = directionLength > 0.05
      ? [
        localX * Math.cos(input.cameraYaw) + localY * -Math.sin(input.cameraYaw),
        localX * -Math.sin(input.cameraYaw) + localY * -Math.cos(input.cameraYaw),
      ]
      : [-Math.sin(state.facingYaw), -Math.cos(state.facingYaw)];
    state.dodgeDirection = direction;
    state.movementAction = 'dodge';
    state.actionTime = movement.dodge.duration;
    state.dodgeCooldown = movement.dodge.duration + movement.dodge.cooldown;
    state.dodgeStyle = movement.dodge.animation;
  }

  if (input.jumpPressed && state.grounded && state.movementAction !== 'dodge') {
    const sprintCostEnabled = input.sprintCostsStamina !== false;
    state.airborneSpeed = input.sprintHeld && length > 0.05
      && (!sprintCostEnabled || (!state.sprintExhausted && staminaState.stamina > 0))
      ? config.runSpeed
      : config.walkSpeed;
    state.airborneDirection = length > 0.05
      ? [
        moveX * Math.cos(input.cameraYaw) + moveY * -Math.sin(input.cameraYaw),
        moveX * -Math.sin(input.cameraYaw) + moveY * -Math.cos(input.cameraYaw),
      ]
      : [0, 0];
    state.grounded = false;
    state.velocity[1] = config.jumpSpeed;
    state.movementAction = 'jump';
  }

  while (remaining > 0) {
    const dt = Math.min(remaining, MAX_STEP);
    remaining -= dt;
    recoverStamina(staminaState, dt);
    state.dodgeCooldown = Math.max(0, state.dodgeCooldown - dt);
    if (state.movementAction === 'climb') {
      const duration = Math.max(state.actionDuration ?? config.climbDuration, 0.001);
      const progress = Math.min(1, dt / Math.max(state.actionTime, dt));
      for (let axis = 0; axis < 3; axis += 1) state.position[axis] += (state.climbTarget[axis] - state.position[axis]) * progress;
      state.actionTime -= dt;
      if (state.actionTime <= 0.001) {
        state.position = [...state.climbTarget];
        state.climbTarget = null;
        state.grounded = true;
        state.velocity = [0, 0, 0];
        state.groundVelocity = [0, 0];
        state.movementAction = 'idle';
        state.lastGroundedPosition = [...state.position];
      }
      continue;
    }
    const previousX = state.position[0];
    const previousZ = state.position[2];
    let horizontalX = 0;
    let horizontalZ = 0;

    if (state.movementAction === 'dodge') {
      horizontalX = state.dodgeDirection[0] * movement.dodge.speed * dt;
      horizontalZ = state.dodgeDirection[1] * movement.dodge.speed * dt;
      state.actionTime -= dt;
      if (state.actionTime <= 0) {
        state.movementAction = 'idle';
        state.actionTime = 0;
        state.dodgeInputBlock = MOVEMENT_CONFIG.dodgeInputBlock;
        state.dodgeStyle = null;
      }
    } else {
      const sprintCostEnabled = input.sprintCostsStamina !== false;
      const sprinting = input.sprintHeld && !input.attackLocked && length > 0.05
        && (!sprintCostEnabled || (!state.sprintExhausted && staminaState.stamina > 0));
      if (sprinting && sprintCostEnabled) {
        staminaState.stamina = Math.max(0, staminaState.stamina - STAMINA.sprintDrainPerSecond * dt);
        staminaState.staminaRecoveryDelay = STAMINA.recoveryDelay;
        if (staminaState.stamina === 0) state.sprintExhausted = true;
      }
      const speed = state.grounded
        ? sprinting ? config.runSpeed : config.walkSpeed
        : state.airborneSpeed ?? config.airSpeed;
      const direction = state.grounded || !state.airborneDirection
        ? [
          moveX * Math.cos(input.cameraYaw) + moveY * -Math.sin(input.cameraYaw),
          moveX * -Math.sin(input.cameraYaw) + moveY * -Math.cos(input.cameraYaw),
        ]
        : state.airborneDirection;
      if (input.attackLocked) {
        state.groundVelocity = [0, 0];
      } else if (state.grounded) {
        const targetX = direction[0] * speed;
        const targetZ = direction[1] * speed;
        const currentX = state.groundVelocity[0];
        const currentZ = state.groundVelocity[1];
        // Velocity keeps its momentum while the intended heading changes immediately.
        const deltaX = targetX - currentX;
        const deltaZ = targetZ - currentZ;
        const deltaLength = Math.hypot(deltaX, deltaZ);
        const acceleration = length > 0.05 ? config.groundAcceleration : config.groundBraking;
        const maxChange = acceleration * dt;
        const blend = deltaLength > maxChange ? maxChange / deltaLength : 1;
        state.groundVelocity[0] = currentX + deltaX * blend;
        state.groundVelocity[1] = currentZ + deltaZ * blend;
        horizontalX = state.groundVelocity[0] * dt;
        horizontalZ = state.groundVelocity[1] * dt;
      } else {
        horizontalX = direction[0] * speed * dt;
        horizontalZ = direction[1] * speed * dt;
      }
      state.movementAction = !state.grounded ? 'jump' : length > 0.05 && !input.attackLocked ? 'walk' : 'idle';
    }

    const contact = moveWithWorld(state, horizontalX, horizontalZ, config, world);
    if (contact && length > 0.05 && state.movementAction !== 'dodge') {
      const travel = state.grounded
        ? [moveX * Math.cos(input.cameraYaw) + moveY * -Math.sin(input.cameraYaw), 0, moveX * -Math.sin(input.cameraYaw) + moveY * -Math.cos(input.cameraYaw)]
        : state.airborneDirection ? [state.airborneDirection[0], 0, state.airborneDirection[1]] : null;
      const target = findClimbTarget(collisionWorld, state, travel, config);
      if (target) {
        state.climbTarget = target.position;
        state.actionDuration = target.duration;
        state.actionTime = target.duration;
        state.movementAction = 'climb';
        state.grounded = false;
        state.velocity = [0, 0, 0];
        state.groundVelocity = [0, 0];
        continue;
      }
    }
    state.velocity[0] = (state.position[0] - previousX) / dt;
    state.velocity[2] = (state.position[2] - previousZ) / dt;

    if (!state.grounded) {
      const previousY = state.position[1];
      state.velocity[1] -= config.gravity * dt;
      state.position[1] += state.velocity[1] * dt;
      const landedPlatform = collisionWorld?.raycast
        ? state.velocity[1] <= 0 ? collisionWorld.raycast([state.position[0], previousY + 0.02, state.position[2]], [0, -1, 0], Math.max(previousY - state.position[1] + 0.03, 0.03)) : null
        : state.velocity[1] <= 0 ? surfaces.find((platform) =>
        previousY >= platform.top - 0.02 && state.position[1] <= platform.top
        && state.position[0] + config.playerRadius > platform.minX && state.position[0] - config.playerRadius < platform.maxX
        && state.position[2] + config.playerRadius > platform.minZ && state.position[2] - config.playerRadius < platform.maxZ) : null;
      if (landedPlatform) {
        state.position[1] = collisionWorld?.raycast ? landedPlatform.point[1] : landedPlatform.top;
        state.velocity[1] = 0;
        state.grounded = true;
        state.airborneSpeed = null;
        state.airborneDirection = null;
        state.movementAction = 'idle';
        state.actionTime = 0;
        state.dodgeStyle = null;
        state.lastGroundedPosition = [...state.position];
      } else if (!collisionWorld?.raycast && state.position[1] <= floorBounds.y && isOnFloor(state.position[0], state.position[2], config.playerRadius, floorBounds)) {
        state.position[1] = floorBounds.y;
        state.velocity[1] = 0;
        state.grounded = true;
        state.airborneSpeed = null;
        state.airborneDirection = null;
        state.movementAction = 'idle';
        state.actionTime = 0;
        state.dodgeStyle = null;
        state.lastGroundedPosition = [...state.position];
      }
    } else if (collisionWorld?.raycast) {
      const support = collisionWorld.raycast([state.position[0], state.position[1] + 0.035, state.position[2]], [0, -1, 0], 0.12);
      if (!support || support.normal?.[1] < 0.65 || Math.abs(support.point[1] - state.position[1]) > 0.08) {
        state.grounded = false;
        state.velocity[1] = 0;
      } else {
        state.position[1] = support.point[1];
        state.lastGroundedPosition = [...state.position];
      }
    } else {
      const standingOnPlatform = surfaces.some((platform) => Math.abs(state.position[1] - platform.top) < 0.02
        && state.position[0] + config.playerRadius > platform.minX && state.position[0] - config.playerRadius < platform.maxX
        && state.position[2] + config.playerRadius > platform.minZ && state.position[2] - config.playerRadius < platform.maxZ);
      const outsideFloor = state.position[1] <= floorBounds.y + 0.02
        && !isOnFloor(state.position[0], state.position[2], config.playerRadius, floorBounds);
      const unsupportedPlatform = state.position[1] > floorBounds.y + 0.02 && !standingOnPlatform;
      if (outsideFloor || unsupportedPlatform) {
        state.grounded = false;
        state.velocity[1] = 0;
      } else {
        if (Math.abs(state.position[1] - floorBounds.y) < 0.02 || !standingOnPlatform) state.position[1] = floorBounds.y;
        state.lastGroundedPosition = [...state.position];
      }
    }
  }

  if (state.position[1] < config.fallResetY) {
    state.position = [...state.lastGroundedPosition];
    state.velocity = [0, 0, 0];
    state.groundVelocity = [0, 0];
    state.grounded = true;
    state.airborneSpeed = null;
    state.airborneDirection = null;
    state.movementAction = 'idle';
    state.actionTime = 0;
    state.dodgeStyle = null;
  }

  const facingDuringDodge = state.movementAction === 'dodge';
  const facingMode = input.facingMode ?? movement.facing;
  let desiredFacing = null;
  if (Number.isFinite(input.facingYaw)) {
    desiredFacing = input.facingYaw;
  } else if (facingMode === 'aim' && Number.isFinite(input.aimYaw)) {
    desiredFacing = input.aimYaw;
  } else if (facingDuringDodge) {
    desiredFacing = Math.atan2(-state.dodgeDirection[0], -state.dodgeDirection[1]);
  } else if (length > 0.05) {
    const worldX = moveX * Math.cos(input.cameraYaw) + moveY * -Math.sin(input.cameraYaw);
    const worldZ = moveX * -Math.sin(input.cameraYaw) + moveY * -Math.cos(input.cameraYaw);
    desiredFacing = Math.atan2(-worldX, -worldZ);
  }
  if (desiredFacing !== null) {
    if (!Number.isFinite(input.facingYaw) && !facingDuringDodge) state.immediateFacingYaw = desiredFacing;
    const tau = Math.PI * 2;
    const difference = ((desiredFacing - state.facingYaw + Math.PI) % tau + tau) % tau - Math.PI;
    const maximumTurn = config.facingTurnSpeed * Math.min(Math.max(delta, 0), 0.05);
    state.facingYaw += Math.max(-maximumTurn, Math.min(maximumTurn, difference));
  }

  return state;
}
