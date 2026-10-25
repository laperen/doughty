import { ISLAND_ROSTERS, islandPopulationLimit } from './island-rosters.js';
import { EXPLORATION_ISLANDS } from './exploration-islands.js';
import { stepWounds } from './wounds.js';
import { defineEnvironment } from './map-environment.js';
import { createBehemothState, stepBehemoth } from './encounter-combat.js';
import { advanceTimedMode } from './behemoth-states.js';
import { advanceQuillshotTimers } from './quillshot.js';
import { advanceEmbermaneModes } from './embermane-aether.js';
import { advanceGnasherTimers } from './gnasher.js';
import { BEHEMOTH_TIERS, SUMMON_HEALTH_FRACTION, SUMMON_REPLACEMENT_DELAY } from './behemoth-tiers.js';

const CINDERWILD_ARENAS = [
    { id: 'ash', name: 'Ash Hollow', center: [-48, -0.025, -18], radius: 40 },
    { id: 'stone', name: 'Crown Basin', center: [48, -0.025, -64], radius: 40 },
];
export const ISLAND = Object.freeze({
  environment: defineEnvironment({
    skyTop: '#82413e', skyHorizon: '#dfad86', fogColor: '#c6a38b',
    cloudColor: '#b09c92', cloudShadow: '#62565e', clouds: .6,
    cloudScale: 3.3, cloudStretch: 1.4, wind: .3, windDirection: 95,
    sunColor: '#ffdfbd', ambientColor: '#e0d5cf', groundColor: '#615b54',
    rimColor: '#dfc4b3', rimIntensity: 1.2,
  }),
  id: 'island', name: 'Cinderwild Isle', layoutScale: 2, arrival: [0, 0.25, 78], roster: ISLAND_ROSTERS.island, tier: 'lesser', maxAlive: islandPopulationLimit(CINDERWILD_ARENAS, ISLAND_ROSTERS.island),
  spawnDuration: 2.4, deathDuration: 3.2, replacementDelay: 5, awarenessRadius: 20.25,
  patrolRadius: 8,
  arenas: CINDERWILD_ARENAS,
});
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const inTerritory = (arena, position, margin = 0) => distance(arena.center, position) <= arena.radius + margin && Math.abs(position[1] - arena.center[1]) < 5;
export const encounterTouchable = state => state.mode !== 'defeated' && (!state.lifecycle || state.lifecycle === 'alive');
export const islandDefinition = mapId => mapId === 'island' || !mapId ? ISLAND : EXPLORATION_ISLANDS[mapId];
export const mainEncounters = encounter => encounter ? [encounter, ...(encounter.others ?? [])] : [];
export const encounterEnemies = encounter => mainEncounters(encounter).flatMap(e => [e.boss, e.summon?.boss].filter(Boolean));
export function createIslandEncounter(index = 0, serial = 1, speciesId, tier, mapId = 'island') {
  const map = islandDefinition(mapId);
  const authored = map.roster[(serial - 1) % map.roster.length];
  tier ??= speciesId == null ? authored.tier : map.roster.find(e => e.speciesId === speciesId)?.tier ?? 'normal';
  speciesId ??= authored.speciesId;
  const arena = map.arenas[index];
  const boss = createBehemothState(speciesId, tier);
  Object.assign(boss, { position: [...arena.center], lifecycle: 'spawning', lifecycleTime: 0 });
  return { id: `${mapId}-${serial}`, mapId, speciesId, tier, index, serial, arena, boss, summon: null, summonUnlocked: false, summonCooldown: 0, summonSerial: 0, awareness: 'dormant', targetId: null, clock: 0 };
}
export function createIslandPopulation(mapId = 'island', random = Math.random) {
  const map = islandDefinition(mapId), count = islandPopulationLimit(map.arenas, map.roster);
  const offset = Math.floor(random() * map.roster.length);
  const encounters = Array.from({ length: count }, (_, i) => {
    const rosterIndex = (offset + i) % map.roster.length, entry = map.roster[rosterIndex];
    return Object.assign(createIslandEncounter(i, i + 1, entry.speciesId, entry.tier, mapId), { rosterIndex });
  });
  if (!encounters.length) return null;
  encounters[0].others = encounters.slice(1);
  return encounters[0];
}
// Reserve living, dying and summoning encounters until their complete lifecycle ends.
export function replacementArena(encounter, population = mainEncounters(encounter)) {
  const map = islandDefinition(encounter.mapId);
  for (let n = 1; n < map.arenas.length; n++) {
    const index = (encounter.index + n) % map.arenas.length;
    if (!population.some(e => e !== encounter && e.index === index)) return index;
  }
  return encounter.index;
}
export function stepIslandPopulation(root, players, dt) {
  const encounters = mainEncounters(root), map = islandDefinition(root.mapId);
  let serial = Math.max(...encounters.map(e => e.serial));
  for (let i = 0; i < encounters.length; i++) {
    const e = encounters[i];
    stepIslandEncounter(e, players, dt, false);
    if (e.boss.mode !== 'defeated' || e.summon || e.boss.lifecycleTime < ISLAND.deathDuration + ISLAND.replacementDelay) continue;
    const index = replacementArena(e, encounters);
    if (index === e.index || players.some(p => distance(p.position, map.arenas[index].center) < 6)) continue;
    let rosterIndex = e.rosterIndex ?? map.roster.findIndex(r => r.speciesId === e.speciesId && r.tier === e.tier);
    for (let n = 1; n <= map.roster.length; n++) {
      const candidate = (rosterIndex + n) % map.roster.length;
      if (!encounters.some(other => other !== e && other.rosterIndex === candidate)) { rosterIndex = candidate; break; }
    }
    const entry = map.roster[rosterIndex];
    encounters[i] = Object.assign(createIslandEncounter(index, ++serial, entry.speciesId, entry.tier, map.id), { rosterIndex });
  }
  const [first, ...others] = encounters;
  first.others = others;
  return first;
}
export function alertEncounter(encounter, position) {
  if (encounterTouchable(encounter.boss) && inTerritory(encounter.arena, position)) encounter.awareness = 'engaged';
}
function chooseTarget(encounter, candidates) {
  const standing = candidates.filter(player => !player.knockedDown);
  const pool = standing.length ? standing : candidates;
  const target = pool[Math.floor(Math.random() * pool.length)];
  encounter.targetId = target?.id ?? null;
  return target ?? null;
}
export function stepIslandEncounter(encounter, players, dt, replace = true) {
  const map = islandDefinition(encounter.mapId);
  let { boss, arena } = encounter;
  boss.runOutContact = null;
  encounter.clock += dt;
  if (encounter.summon?.boss.mode === 'defeated' && !encounter.summon.replacementWaitStarted) {
    encounter.summon.replacementWaitStarted = true;
    encounter.summonCooldown = SUMMON_REPLACEMENT_DELAY;
  }
  // Count from defeat, concurrently with disappearance, even outside engagement.
  encounter.summonCooldown = Math.max(0, encounter.summonCooldown - dt);
  if (boss.mode === 'defeated') {
    // The summon retains its own life and rewards; finish it before replacement.
    stepSummon(encounter, players, dt);
    boss.lifecycleTime += dt;
    boss.lifecycle = boss.lifecycleTime < ISLAND.deathDuration ? 'dying' : 'absent';
    if (replace && boss.lifecycleTime >= ISLAND.deathDuration + ISLAND.replacementDelay) {
      if (encounter.summon) return encounter;
      const next = (encounter.index + 1) % map.arenas.length;
      // Defer materialization if a hunter is standing at the next spawn.
      if (players.some(p => distance(p.position, map.arenas[next].center) < 6)) return encounter;
      const current = map.roster.findIndex(e => e.speciesId === encounter.speciesId && e.tier === encounter.tier);
      const entry = map.roster[(current + 1) % map.roster.length];
      return createIslandEncounter(next, encounter.serial + 1, entry.speciesId, entry.tier, map.id);
    }
    return encounter;
  }
  if (boss.lifecycle === 'spawning') {
    boss.lifecycleTime += dt;
    if (boss.lifecycleTime >= ISLAND.spawnDuration) { boss.lifecycle = 'alive'; boss.lifecycleTime = 0; }
    return encounter;
  }
  const occupants = players.map((p, n) => ({ ...p, id: p.id ?? `player-${n}` }))
    .filter(p => inTerritory(arena, p.position, encounter.awareness === 'engaged' ? 1 : 0));
  if (encounter.awareness === 'engaged' && !occupants.length) {
    encounter.awareness = 'returning'; boss.mode = 'idle'; boss.move = null; boss.attackHit = false;
    encounter.targetId = null;
    boss.runOutGoal = null; boss.returnCharge = false; boss.chargeDuration = null;
    if (boss.projectiles) { boss.projectiles = []; boss.impactEvents = []; }
  }
  if (encounter.awareness !== 'engaged' && occupants.some(p => distance(p.position, boss.position) <= ISLAND.awarenessRadius)) encounter.awareness = 'engaged';
  if (encounter.awareness === 'engaged') {
    let target = occupants.find(p => p.id === encounter.targetId);
    const standing = occupants.some(p => !p.knockedDown);
    // Keep a target for the full committed action. Replace it when it leaves
    // the arena, or when it is down and a standing hunter is available.
    if (!target || (boss.mode === 'idle' && target.knockedDown && standing)) target = chooseTarget(encounter, occupants);
    const modeBeforeStep = boss.mode;
    const local = boss.position.map((v, i) => v - arena.center[i]);
    boss.position = local;
    for (const q of boss.projectiles ?? []) for (const key of ['position', 'previous', 'destination']) if (q[key]) q[key] = q[key].map((v, i) => v - arena.center[i]);
    stepBehemoth(boss, target.position.map((v, i) => v - arena.center[i]), dt, arena.radius - 3, { targetKnockedDown: target.knockedDown, players: occupants.map((p, n) => ({ ...p, id: p.id ?? `player-${n}`, position: p.position.map((v, i) => v - arena.center[i]) })) });
    // A combo remains one committed sequence. Re-roll only once its final
    // recovery completes, including full-target attacks such as volleys.
    if (modeBeforeStep === 'recovery' && boss.mode === 'idle') chooseTarget(encounter, occupants);
    const r = Math.hypot(local[0], local[2]);
    if (r > arena.radius - 3) { local[0] *= (arena.radius - 3) / r; local[2] *= (arena.radius - 3) / r; }
    boss.position = local.map((v, i) => v + arena.center[i]);
    for (const q of [...(boss.projectiles ?? []), ...(boss.impactEvents ?? [])]) for (const key of ['position', 'previous', 'destination']) if (q[key]) q[key] = q[key].map((v, i) => v + arena.center[i]);
  } else {
    // Health, parts and stagger persist; timed combat states continue expiring.
    stepWounds(boss.parts, dt);
    if (boss.speciesId === 'gnasher') advanceGnasherTimers(boss, dt);
    else if (boss.speciesId === 'quillshot') advanceQuillshotTimers(boss, dt, false);
    else {
      advanceTimedMode(boss.states.enrage, dt);
      advanceEmbermaneModes(boss, dt, false);
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
  const summonTier = BEHEMOTH_TIERS[boss.tier ?? 'normal'].summon;
  if (summonTier && boss.health < boss.definition.maxHealth * SUMMON_HEALTH_FRACTION) encounter.summonUnlocked = true;
  if (summonTier && encounter.summonUnlocked && encounter.awareness === 'engaged' && !encounter.summon) {
    if (encounter.summonCooldown <= 1e-8 && !['windup', 'active', 'recovery', 'reaction'].includes(boss.mode)) {
      const summon = createIslandEncounter(encounter.index, encounter.serial, encounter.speciesId, summonTier, encounter.mapId);
      summon.id = `${encounter.id}-summon-${++encounter.summonSerial}`;
      summon.boss.position = [boss.position[0] + 7, boss.position[1], boss.position[2]];
      if (!inTerritory(arena, summon.boss.position, -5)) summon.boss.position = [...arena.center];
      summon.boss.summonerId = encounter.id;
      summon.awareness = 'engaged'; encounter.summon = summon;
    }
  }
  stepSummon(encounter, players, dt);
  return encounter;
}
function stepSummon(encounter, players, dt) {
  const summon = encounter.summon;
  if (!summon) return;
  if (summon.boss.mode === 'defeated') {
    summon.boss.lifecycleTime += dt;
    summon.boss.lifecycle = 'dying';
    if (summon.boss.lifecycleTime >= ISLAND.deathDuration) encounter.summon = null;
    return;
  }
  stepIslandEncounter(summon, players, dt);
}
