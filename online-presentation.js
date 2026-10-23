// Render-only playback. Never runs AI, collision, damage, rewards or input handlers.
const clone = value => structuredClone(value);
const mix = (a, b, t) => a + (b - a) * t;
const angle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export function motionKey(state, weapon = null) {
  if (state.speciesId) return JSON.stringify([state.lifecycle, state.mode, state.move, state.attackCount,
    state.sideCombo?.cycle, state.sideCombo?.phase, state.states?.enrage?.active, state.states?.aetherCharge?.active,
    (state.projectiles ?? []).map(p => p.id)]);
  return JSON.stringify([state.movementAction, state.recovery?.phase, weapon?.sheathed, weapon?.mode,
    weapon?.action, weapon?.comboIndex]);
}
export class OnlinePresentation {
  constructor({ delay = 100, maxAdvance = 250 } = {}) { this.delay = delay; this.maxAdvance = maxAdvance; this.clear(); }
  clear() { this.actors = new Map(); this.offset = Infinity; }
  remove(id) { this.actors.delete(id); }
  observe(time, now = performance.now()) {
    if (!Number.isFinite(time)) return false;
    this.offset = Math.min(this.offset, now - time); return true;
  }
  receive(id, state, weapon, time, { snapshot = false, now = performance.now() } = {}) {
    if (!this.observe(time, now)) return;
    let actor = this.actors.get(id);
    if (!actor) { actor = { frames: [], time: -Infinity }; this.actors.set(id, actor); }
    if (snapshot && !actor.frames.some(f => f.time === time)) {
      actor.frames.push({ time, state: clone(state) }); actor.frames.sort((a, b) => a.time - b.time);
      if (actor.frames.length > 16) actor.frames.splice(0, actor.frames.length - 16);
    }
    if (time < actor.time) return;
    const key = motionKey(state, weapon);
    const elapsed = weapon?.elapsed ?? state.elapsed;
    const oldElapsed = actor.weapon?.elapsed ?? actor.state?.elapsed;
    const span = (time - actor.time) / 1000;
    actor.rate = actor.key === key && span > 0 && elapsed >= oldElapsed
      ? Math.min(3, Math.max(0, (elapsed - oldElapsed) / span)) : 1;
    actor.key = key; actor.time = time; actor.state = clone(state); actor.weapon = weapon ? clone(weapon) : null;
  }
  sample(id, now = performance.now()) {
    const actor = this.actors.get(id); if (!actor) return null;
    const state = { ...actor.state }, weapon = actor.weapon ? { ...actor.weapon } : null;
    const age = Math.max(0, Math.min(this.maxAdvance, now - this.offset - actor.time)) / 1000;
    if (Number.isFinite(state.elapsed)) state.elapsed += age * actor.rate;
    if (weapon && Number.isFinite(weapon.elapsed)) weapon.elapsed += age * actor.rate;
    if (Number.isFinite(state.actionTime)) state.actionTime = Math.max(0, state.actionTime - age);
    if (state.recovery) state.recovery = { ...state.recovery, elapsed: state.recovery.elapsed + age };
    const frames = actor.frames, target = now - this.offset - this.delay;
    let a = frames[0], b = a;
    for (const frame of frames) { if (frame.time <= target) a = frame; if (frame.time >= target) { b = frame; break; } b = frame; }
    if (a && b) {
      const t = b.time > a.time ? Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time))) : 1;
      // Large displacement means a teleport/respawn; don't sweep through the map.
      const jump = Math.hypot(...a.state.position.map((v, i) => v - b.state.position[i])) > 8;
      state.position = jump ? [...b.state.position] : a.state.position.map((v, i) => mix(v, b.state.position[i], t));
      for (const key of ['velocity', 'groundVelocity']) if (a.state[key] && b.state[key]) state[key] = a.state[key].map((v, i) => mix(v, b.state[key][i], t));
      for (const key of ['yaw', 'facingYaw']) if (Number.isFinite(a.state[key]) && Number.isFinite(b.state[key])) state[key] = jump ? b.state[key] : angle(a.state[key], b.state[key], t);
      // Keep event-driven projectile lifetimes, but interpolate surviving projectile transforms.
      if (state.projectiles) state.projectiles = state.projectiles.map(p => {
        const from = a.state.projectiles?.find(q => q.id === p.id), to = b.state.projectiles?.find(q => q.id === p.id);
        return from && to ? { ...p, position: from.position.map((v, i) => mix(v, to.position[i], t)) } : p;
      });
    }
    return { state, weapon };
  }
}
