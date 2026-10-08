import { stepWounds } from './wounds.js';
import { createBehemothState, stepBehemoth } from './encounter-combat.js';
import { advanceTimedMode } from './behemoth-states.js';
import { advanceQuillshotTimers } from './quillshot.js';

export const ISLAND = Object.freeze({
  name: 'Cinderwild Isle', layoutScale: 2, arrival: [0, 0.25, 78], roster: ['first-behemoth', 'quillshot'], maxAlive: 1,
  spawnDuration: 2.4, deathDuration: 3.2, replacementDelay: 5, awarenessRadius: 20.25,
  patrolRadius: 8,
  arenas: [
    { id: 'ash', name: 'Ash Hollow', center: [-48, -0.025, -18], radius: 40 },
    { id: 'stone', name: 'Crown Basin', center: [48, -0.025, -64], radius: 40 },
  ],
});
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const inTerritory = (arena, position, margin = 0) => distance(arena.center, position) <= arena.radius + margin && Math.abs(position[1] - arena.center[1]) < 5;
export const encounterTouchable = state => state.mode !== 'defeated' && (!state.lifecycle || state.lifecycle === 'alive');
export function createIslandEncounter(index = 0, serial = 1, speciesId = ISLAND.roster[(serial - 1) % ISLAND.roster.length]) {
  const arena = ISLAND.arenas[index];
  const boss = createBehemothState(speciesId);
  Object.assign(boss, { position: [...arena.center], lifecycle: 'spawning', lifecycleTime: 0 });
  return { id: `island-${serial}`, speciesId, index, serial, arena, boss, awareness: 'dormant', clock: 0 };
}
export function alertEncounter(encounter, position) {
  if (encounterTouchable(encounter.boss) && inTerritory(encounter.arena, position)) encounter.awareness = 'engaged';
}
export function stepIslandEncounter(encounter, players, dt) {
  let { boss, arena } = encounter;
  encounter.clock += dt;
  if (boss.mode === 'defeated') {
    boss.lifecycleTime += dt;
    boss.lifecycle = boss.lifecycleTime < ISLAND.deathDuration ? 'dying' : 'absent';
    if (boss.lifecycleTime >= ISLAND.deathDuration + ISLAND.replacementDelay) {
      const next = (encounter.index + 1) % ISLAND.arenas.length;
      // Defer materialization if a hunter is standing at the next spawn.
      if (players.some(p => distance(p.position, ISLAND.arenas[next].center) < 6)) return encounter;
      return createIslandEncounter(next, encounter.serial + 1, ISLAND.roster[(ISLAND.roster.indexOf(encounter.speciesId) + 1) % ISLAND.roster.length]);
    }
    return encounter;
  }
  if (boss.lifecycle === 'spawning') {
    boss.lifecycleTime += dt;
    if (boss.lifecycleTime >= ISLAND.spawnDuration) { boss.lifecycle = 'alive'; boss.lifecycleTime = 0; }
    return encounter;
  }
  const occupants = players.filter(p => inTerritory(arena, p.position, encounter.awareness === 'engaged' ? 1 : 0));
  if (encounter.awareness === 'engaged' && !occupants.length) {
    encounter.awareness = 'returning'; boss.mode = 'idle'; boss.move = null; boss.attackHit = false;
    boss.runOutGoal = null; boss.returnCharge = false; boss.chargeDuration = null;
    if (boss.projectiles) { boss.projectiles = []; boss.impactEvents = []; }
  }
  if (encounter.awareness !== 'engaged' && occupants.some(p => distance(p.position, boss.position) <= ISLAND.awarenessRadius)) encounter.awareness = 'engaged';
  if (encounter.awareness === 'engaged') {
    const target = occupants.find(p => !p.knockedDown) ?? occupants[0];
    const local = boss.position.map((v, i) => v - arena.center[i]);
    boss.position = local;
    for (const q of boss.projectiles ?? []) for (const key of ['position', 'previous', 'destination']) if (q[key]) q[key] = q[key].map((v, i) => v - arena.center[i]);
    stepBehemoth(boss, target.position.map((v, i) => v - arena.center[i]), dt, arena.radius - 3, { targetKnockedDown: target.knockedDown, players: occupants.map((p, n) => ({ ...p, id: p.id ?? `player-${n}`, position: p.position.map((v, i) => v - arena.center[i]) })) });
    const r = Math.hypot(local[0], local[2]);
    if (r > arena.radius - 3) { local[0] *= (arena.radius - 3) / r; local[2] *= (arena.radius - 3) / r; }
    boss.position = local.map((v, i) => v + arena.center[i]);
    for (const q of [...(boss.projectiles ?? []), ...(boss.impactEvents ?? [])]) for (const key of ['position', 'previous', 'destination']) if (q[key]) q[key] = q[key].map((v, i) => v + arena.center[i]);
  } else {
    // Health, parts and stagger persist; timed combat states continue expiring.
    stepWounds(boss.parts, dt);
    if (boss.speciesId === 'quillshot') advanceQuillshotTimers(boss, dt);
    else {
      for (const mode of Object.values(boss.states)) advanceTimedMode(mode, dt);
      boss.flash = Math.max(0, boss.flash - dt);
    }
    boss.elapsed += dt; boss.move = null;
    const returning = encounter.awareness === 'returning';
    const resting = !returning && encounter.clock % 10 < 3;
    const angle = Math.floor(encounter.clock / 10) * 2.4;
    const goal = returning ? arena.center : [arena.center[0] + Math.sin(angle) * ISLAND.patrolRadius, arena.center[1], arena.center[2] + Math.cos(angle) * ISLAND.patrolRadius];
    const d = distance(boss.position, goal);
    boss.mode = resting || d < 0.2 ? 'idle' : 'patrol';
    if (!resting && d > 0.2) {
      const amount = Math.min(d, dt * (returning ? 3 : 1.2));
      boss.yaw = Math.atan2(-(goal[0] - boss.position[0]), -(goal[2] - boss.position[2]));
      for (const i of [0, 2]) boss.position[i] += (goal[i] - boss.position[i]) / d * amount;
    }
    if (returning && d < 0.3) encounter.awareness = 'dormant';
  }
  return encounter;
}
