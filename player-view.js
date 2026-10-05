import { RECOVERY } from './player-recovery.js';
import * as THREE from 'three';
import { attackPose } from './combat-presentation.js';

/** Small articulated mannequin; collision stays on the unchanged gameplay capsule. */
export function createPlayerView() {
  const root = new THREE.Group();
  root.name = 'Range hunter';
  const bodyRig = new THREE.Group();
  bodyRig.position.y = 0.91;
  root.add(bodyRig);
  const armor = new THREE.MeshStandardMaterial({ color: '#d9ff69', roughness: 0.52, metalness: 0.22 });
  const dark = new THREE.MeshStandardMaterial({ color: '#252e37', roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: '#d3e2ec', roughness: 0.3, metalness: 0.75 });
  const mesh = (parent, name, size, position, material) => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    piece.name = name; piece.position.set(...position); piece.castShadow = true;
    parent.add(piece); return piece;
  };
  mesh(bodyRig, 'chest', [0.55, 0.48, 0.3], [0, 0.23, 0], armor);
  mesh(bodyRig, 'belt', [0.44, 0.15, 0.29], [0, -0.07, 0], dark);
  mesh(bodyRig, 'helmet', [0.35, 0.34, 0.32], [0, 0.63, 0], dark);
  mesh(bodyRig, 'visor', [0.3, 0.06, 0.035], [0, 0.66, -0.17], armor);
  const limbs = {};
  for (const [name, x, y, length, material] of [
    ['leftArm', -0.36, 0.39, 0.51, armor], ['rightArm', 0.36, 0.39, 0.51, armor],
    ['leftLeg', -0.15, -0.12, 0.67, dark], ['rightLeg', 0.15, -0.12, 0.67, dark],
  ]) {
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(x, y, 0);
    mesh(pivot, name + ' segment', [0.18, length, 0.2], [0, -length / 2, 0], material);
    mesh(pivot, name + ' tip', [0.21, 0.16, 0.27], [0, -length, -0.035], dark);
    bodyRig.add(pivot); limbs[name] = pivot;
  }
  const sword = new THREE.Group(); sword.name = 'Modular sword visual';
  mesh(sword, 'grip', [0.075, 0.26, 0.075], [0, 0.08, 0], dark);
  mesh(sword, 'guard', [0.32, 0.065, 0.1], [0, 0.23, 0], armor);
  mesh(sword, 'blade', [0.12, 0.98, 0.045], [0, 0.75, 0], steel);
  limbs.rightArm.add(sword);
  const trailMaterial = new THREE.MeshBasicMaterial({ color: '#e7ffa1', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const trail = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.5, 32, 1, 0, Math.PI * 0.75), trailMaterial);
  trail.name = 'Attack trail'; trail.rotation.x = -Math.PI / 2; trail.visible = false; root.add(trail);
  return { root, bodyRig, armor, limbs, sword, trail, gait: 0 };
}

export function updatePlayerView(view, player, equipment, dt) {
  const state = equipment?.state;
  const move = state?.action?.move;
  const visual = equipment?.definition?.presentation;
  const rig = view.bodyRig;
  view.root.position.set(...player.position); view.root.rotation.y = player.facingYaw;
  const speed = Math.hypot(...player.groundVelocity);
  view.gait += dt * speed * 2.3;
  const stride = player.grounded && !move ? Math.min(0.7, speed * 0.1) : 0;
  rig.position.set(0, 0.91 + Math.abs(Math.sin(view.gait)) * stride * 0.055, 0);
  rig.rotation.set(0, 0, 0); rig.scale.set(1, 1, 1);
  for (const limb of Object.values(view.limbs)) limb.rotation.set(0, 0, 0);
  const { leftArm, rightArm, leftLeg, rightLeg } = view.limbs;
  leftLeg.rotation.x = Math.sin(view.gait) * stride;
  rightLeg.rotation.x = -leftLeg.rotation.x;
  leftArm.rotation.x = -leftLeg.rotation.x * 0.75;
  rightArm.rotation.x = leftLeg.rotation.x * 0.75;
  view.sword.visible = visual?.weaponShape === 'sword';
  // The equipped definition opts into this visual; another weapon gets no sword.
  if (state?.sheathed) {
    if (view.sword.parent !== rig) rig.add(view.sword);
    view.sword.position.set(0.2, -0.23, 0.24); view.sword.rotation.set(0, 0, -0.4);
  } else {
    if (view.sword.parent !== rightArm) rightArm.add(view.sword);
    view.sword.position.set(0, -0.49, -0.05); view.sword.rotation.set(-1.55, 0, 0);
    rightArm.rotation.x -= 0.35; leftArm.rotation.x -= 0.25;
  }
  view.trail.visible = false;
  if (move && visual) {
    const pose = attackPose(move, state.elapsed);
    const heavy = move.presentation?.weight === 'heavy';
    const side = move.presentation?.side ?? 1;
    const stroke = move.hitOffsets?.length > 1 && pose.active
      ? (state.elapsed - move.startup) / move.active * move.hitOffsets.length % 1 : pose.strike;
    const swing = (-0.75 * pose.windup + 1.65 * stroke) * (1 - pose.recovery);
    rig.rotation.y = swing * side * (heavy ? 0.85 : 0.6);
    rig.rotation.x = Math.sin(stroke * Math.PI) * (heavy ? 0.18 : 0.07) * (1 - pose.recovery);
    rightArm.rotation.x = (-0.45 - pose.windup * 1.8 + stroke * 2.2) * (1 - pose.recovery);
    rightArm.rotation.z = -side * (0.25 + Math.sin(stroke * Math.PI) * 0.7) * (1 - pose.recovery);
    leftArm.rotation.x = heavy ? rightArm.rotation.x * 0.65 : -0.8 * (1 - pose.recovery);
    leftLeg.rotation.x = -0.2 * (1 - pose.recovery);
    rightLeg.rotation.x = 0.15 * (1 - pose.recovery);
    if (move.presentation?.motion === 'thrust') {
      // Draw the blade back, then extend it straight along the locked attack yaw.
      // Counter-rotate the blade so the arm never turns this into a slash.
      const extension = Math.min(1, pose.strike * 2) * (1 - pose.recovery);
      const brace = pose.windup * (1 - pose.recovery);
      rig.rotation.set(0.12 * extension, 0, 0);
      rightArm.rotation.set(0.25 * brace + 1.05 * extension, 0, -0.12 * brace);
      view.sword.rotation.set(-Math.PI / 2 - rightArm.rotation.x - rig.rotation.x, 0, 0.12 * brace);
      leftArm.rotation.set(0.6 * extension - 0.35 * brace, 0, 0.2 * brace);
      leftLeg.rotation.x = -0.45 * extension;
      rightLeg.rotation.x = 0.35 * extension;
    }
    if (move.range > 0 && pose.active && move.presentation?.motion !== 'thrust') {
      view.trail.visible = true;
      view.trail.position.set(0, heavy ? 1.15 : 1.25, -0.35);
      view.trail.rotation.set(-Math.PI / 2 + (heavy ? 0.35 : -0.12), 0, -Math.PI * 0.85 + stroke * Math.PI * side);
      view.trail.scale.setScalar(Math.min(1.5, move.range / 1.7));
      view.trail.material.color.set(visual.trailColor ?? '#e7ffa1');
      view.trail.material.opacity = 0.2 + Math.sin(stroke * Math.PI) * 0.5;
    }
  }
  if (player.movementAction === 'dodge') {
    const duration = equipment?.definition?.movement?.dodge?.duration ?? 0.62 * (2 / 3);
    const t = THREE.MathUtils.clamp(1 - player.actionTime / duration, 0, 1);
    view.root.rotation.y = Math.atan2(-player.dodgeDirection[0], -player.dodgeDirection[1]);
    rig.position.y = 0.64; rig.rotation.set(-t * Math.PI * 2, 0, 0);
    rig.scale.setScalar(0.78); leftLeg.rotation.x = rightLeg.rotation.x = -0.8;
    leftArm.rotation.x = rightArm.rotation.x = -1.8; view.trail.visible = false;
  } else if (player.movementAction === 'climb') {
    leftArm.rotation.x = rightArm.rotation.x = -2.6; leftLeg.rotation.x = -0.7;
  } else if (!player.grounded) {
    leftLeg.rotation.x -= 0.45; rightLeg.rotation.x += 0.35;
  }
  if (player.recovery) {
    const recovery = player.recovery;
    const rise = recovery.phase === 'getting-up' ? Math.min(1, recovery.elapsed / RECOVERY.getUp) : 0;
    const fall = recovery.phase === 'airborne' ? Math.min(1, recovery.elapsed / 0.3) : 1;
    const weight = fall * (1 - rise * rise * (3 - 2 * rise));
    rig.position.y = 0.91 - 0.63 * weight;
    rig.rotation.set(-Math.PI / 2 * weight, 0, 0);
    leftArm.rotation.set(-0.45 * weight, 0, -0.3 * weight);
    rightArm.rotation.set(-0.45 * weight, 0, 0.3 * weight);
    leftLeg.rotation.x = 0.15 * weight; rightLeg.rotation.x = -0.1 * weight;
    view.trail.visible = false;
  }
  if (player.health <= 0) {
    rig.position.y = 0.28; rig.rotation.set(-Math.PI / 2, 0, 0.15); view.trail.visible = false;
  } else if (player.invulnerability > 0.5) {
    rig.rotation.x -= Math.sin((0.78 - player.invulnerability) / 0.28 * Math.PI) * 0.3;
  }
}
