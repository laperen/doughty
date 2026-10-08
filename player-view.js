import { CHAINBLADES_TUNING } from './chainblades-weapon.js';
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
  const pistols = [-1, 1].map(side => {
    const gun = new THREE.Group(); gun.name = side < 0 ? 'Left repeater' : 'Right repeater';
    mesh(gun, 'barrel', [.15, .17, .48], [0, 0, -.16], steel);
    mesh(gun, 'grip', [.12, .23, .14], [0, -.12, .02], dark);
    mesh(gun, 'chamber', [.18, .12, .16], [0, .08, -.08], armor);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: '#8ef5ef', side: THREE.BackSide,
      transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending });
    const outline = new THREE.Group(); outline.name = 'Empowered repeater outline';
    for (const piece of [...gun.children]) {
      const shell = new THREE.Mesh(piece.geometry, glowMaterial);
      shell.position.copy(piece.position); shell.scale.set(1.18, 1.18, 1.12);
      outline.add(shell);
    }
    outline.visible = false; gun.add(outline); gun.userData.empoweredOutline = outline;
    bodyRig.add(gun); return gun;
  });
  const chainblades = [-1, 1].map(side => {
    const blade = new THREE.Group(); blade.name = side < 0 ? 'Left chain blade' : 'Right chain blade';
    mesh(blade, 'Handle', [.09, .3, .09], [0, 0, 0], dark);
    mesh(blade, 'Short blade', [.11, .55, .055], [0, .36, 0], steel);
    const hook = mesh(blade, 'Hooked edge', [.28, .11, .055], [side * .09, .6, 0], steel);
    hook.rotation.z = side * .35;
    const links = new THREE.Group(); links.name = 'Chain links';
    for (let i = 0; i < 10; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(.045, .013, 4, 8), steel);
      link.position.y = -.18 - i * .075; link.rotation.y = i % 2 ? Math.PI / 2 : 0; links.add(link);
    }
    blade.add(links); blade.userData.links = links;
    bodyRig.add(blade); return blade;
  });
  // Reused tapered streaks extend behind the dash direction without scaling the hunter.
  const dashTrail = new THREE.Group(); dashTrail.name = 'Chain Blades dash wake';
  const dashMaterial = new THREE.MeshBasicMaterial({ color: '#75e5ff', transparent: true,
    opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const height = .3 + Math.floor(i / 2) * .42;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      side * .32, height, .1, side * .48, height + .08, .3,
      side * .58, height + .02, 1.4 + (i % 3) * .25,
    ], 3));
    dashTrail.add(new THREE.Mesh(geometry, dashMaterial));
  }
  dashTrail.visible = false; root.add(dashTrail);
  return { root, bodyRig, armor, limbs, sword, pistols, chainblades, trail, dashTrail, dashMaterial, gait: 0 };
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
  view.dashTrail.visible = false;
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
  for (const [index, gun] of view.pistols.entries()) {
    gun.visible = visual?.weaponShape === 'pistols';
    gun.userData.empoweredOutline.visible = gun.visible && state.empowered > 0;
    const side = index === 0 ? -1 : 1;
    gun.position.set(side * .36, state?.sheathed ? -.25 : .51, state?.sheathed ? 0 : -.55);
    gun.rotation.set(state?.sheathed ? -Math.PI / 2 : 0, 0, 0);
    if (gun.visible && !state.sheathed) {
      leftArm.rotation.x = rightArm.rotation.x = Math.PI / 2;
      if (state.action?.type === 'reload') {
        gun.rotation.z = side * Math.sin(state.elapsed * Math.PI) * 1.3;
        gun.position.y -= .15 * Math.sin(state.elapsed * Math.PI);
        leftArm.rotation.x = rightArm.rotation.x = .7;
      } else if (state.action?.type === 'heavy') {
        gun.rotation.y = side * .3 * Math.sin(state.elapsed / 1.1 * Math.PI);
      } else if (state.action?.type === 'light' && state.action.hand === index) {
        gun.position.z += .1 * Math.max(0, 1 - state.elapsed / .15);
      }
    }
  }
  for (const [index, blade] of view.chainblades.entries()) {
    blade.visible = visual?.weaponShape === 'chainblades';
    if (!blade.visible) continue;
    const side = index === 0 ? -1 : 1;
    const spin = move?.presentation?.motion === 'spin';
    const hand = index === 0 ? leftArm : rightArm;
    const slam = state.action?.ability === 'air-slam';
    const parent = spin || slam || state.sheathed ? rig : hand;
    if (blade.parent !== parent) parent.add(blade);
    if (slam) {
      const cast = THREE.MathUtils.clamp((state.elapsed - CHAINBLADES_TUNING.slamWindup) / (CHAINBLADES_TUNING.slamImpact - CHAINBLADES_TUNING.slamWindup), 0, 1);
      const retract = 1 - THREE.MathUtils.clamp((state.elapsed - .6) / .4, 0, 1);
      blade.position.set(side * .4, .15 + Math.sin(cast * Math.PI) * 1.4, -.4 - 2.6 * cast * retract);
    } else if (spin) blade.position.set(side * 1.7, .15, -.55);
    else if (state.sheathed) blade.position.set(side * .28, -.2, .22);
    else blade.position.set(0, -.51, -.05);
    blade.rotation.set(state.sheathed ? 0 : -Math.PI / 2, 0, side * .3);
    blade.userData.links.scale.y = slam ? Math.max(1, -blade.position.z / .75) : spin ? 2 : 1;
    if (spin) rig.rotation.y = state.elapsed * Math.PI * 8;

    if (state.airHeight > 0) { leftLeg.rotation.x = -.6; rightLeg.rotation.x = .4; }
  }
  if (visual?.weaponShape === 'chainblades' && move) {
    const ability = state.action.ability;
    const t = state.elapsed;
    if (ability === 'push-off') {
      const rise = THREE.MathUtils.clamp(t / CHAINBLADES_TUNING.pushDuration, 0, 1);
      rig.rotation.set(.45 * Math.sin(rise * Math.PI), 0, 0);
      leftArm.rotation.set(-1.2 + rise * .5, 0, -.65);
      rightArm.rotation.set(-1.2 + rise * .5, 0, .65);
      leftLeg.rotation.x = -.9; rightLeg.rotation.x = .35;
      view.trail.visible = false;
    } else if (ability === 'air-dash') {
      const dive = Math.sin(THREE.MathUtils.clamp((t - .05) / .5, 0, 1) * Math.PI);
      rig.rotation.set(-1.05 * dive, 0, 0);
      leftArm.rotation.set(-1.8 * dive, 0, -.3); rightArm.rotation.set(-1.8 * dive, 0, .3);
      leftLeg.rotation.x = .45 * dive; rightLeg.rotation.x = -.3 * dive;
    } else if (ability === 'air-slam') {
      const spin = THREE.MathUtils.clamp(t / CHAINBLADES_TUNING.slamWindup, 0, 1);
      const land = THREE.MathUtils.clamp((t - CHAINBLADES_TUNING.slamLanding) / .1, 0, 1);
      const recover = 1 - THREE.MathUtils.clamp((t - .6) / .4, 0, 1);
      rig.rotation.set(-Math.PI * 2 * spin - .3 * land * recover, 0, 0);
      rig.position.y -= .2 * land * recover;
      leftArm.rotation.set(-2.4 * (1 - land) - .7 * land, 0, -.3);
      rightArm.rotation.set(leftArm.rotation.x, 0, .3);
      leftLeg.rotation.x = -.7 * recover; rightLeg.rotation.x = .4 * recover;
      view.trail.position.set(0, .25, -(move.originOffset ?? 0));
      view.trail.rotation.set(-Math.PI / 2, 0, 0);
    } else if (move.presentation?.motion === 'chain-finisher') {
      const pose = attackPose(move, t);
      const strike = Math.sin(pose.strike * Math.PI) * (1 - pose.recovery);
      rig.rotation.y = -.35 * pose.windup * (1 - pose.recovery);
      leftArm.rotation.set(-1.2 + strike * 1.7, 0, -.25 - strike * .5);
      rightArm.rotation.set(leftArm.rotation.x, 0, .25 + strike * .5);
    }
  }
  view.root.position.y += state?.airHeight ?? 0;
  if (player.movementAction === 'dodge') {
    const duration = equipment?.definition?.movement?.dodge?.duration ?? 0.62 * (2 / 3);
    const t = THREE.MathUtils.clamp(1 - player.actionTime / duration, 0, 1);
    view.root.rotation.y = Math.atan2(-player.dodgeDirection[0], -player.dodgeDirection[1]);
    const dash = player.dodgeStyle === 'dash';
    rig.position.y = dash ? .86 : .64;
    rig.rotation.set(dash ? -.35 : -t * Math.PI * 2, 0, 0);
    if (!dash) rig.scale.setScalar(.78);
    view.dashTrail.visible = dash && player.health > 0 && !player.recovery;
    view.dashMaterial.opacity = .7 * Math.sin(Math.PI * t);
    view.dashTrail.scale.z = .6 + .6 * Math.sin(Math.PI * t);
    leftLeg.rotation.x = rightLeg.rotation.x = -0.8;
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
