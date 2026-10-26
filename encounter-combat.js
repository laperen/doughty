import * as ember from './behemoth.js';
import * as quill from './quillshot.js';
import * as gnasher from './gnasher.js';
import { advanceEmbermaneModes, stepEmbermaneProjectiles } from './embermane-aether.js';
import { advanceTimedMode } from './behemoth-states.js';
import { stepWounds } from './wounds.js';
import { hasRunOutContact } from './behemoth-run-out.js';
import { canAttemptHeal, cancelHealOnOutcome, stepBehemothHealing } from './behemoth-healing.js';
const species = {
  'first-behemoth': { definition: ember.BEHEMOTH, create: ember.createBehemothState, hit: ember.hitBehemoth, step: ember.stepBehemoth, interruptible: ember.isInterruptible, touches: ember.behemothAttackTouchesPlayer },
  quillshot: { definition: quill.QUILLSHOT, create: tier => quill.createQuillshotState(undefined, tier), hit: quill.hitQuillshot, step: quill.stepQuillshot, interruptible: quill.isQuillshotInterruptible, touches: quill.quillshotAttackTouchesPlayer },
  gnasher: { definition: gnasher.GNASHER, create: gnasher.createGnasherState, hit: gnasher.hitGnasher, step: gnasher.stepGnasher, interruptible: gnasher.isGnasherInterruptible, touches: gnasher.gnasherAttackTouchesPlayer },
};
export const BEHEMOTH_SPECIES = Object.freeze(Object.keys(species));
const implementation = id => {
  if (!Object.hasOwn(species, id)) throw new RangeError(`Unknown Behemoth species: ${id}`);
  return species[id];
};
export const definitionFor = s => s.definition ?? implementation(s.speciesId ?? 'first-behemoth').definition;
export const createBehemothState = (id = 'first-behemoth', tier = 'normal') => implementation(id).create(tier);
export const hitBehemoth = (s, hit) => {
  const result = implementation(s.speciesId ?? 'first-behemoth').hit(s, hit);
  cancelHealOnOutcome(s, result.outcome);
  return result;
};
function stepHealingAuxiliaries(s, players, dt) {
  stepWounds(s.parts, dt);
  if (s.speciesId === 'gnasher') {
    gnasher.advanceGnasherTimers(s, dt); gnasher.stepBlasts(s, dt);
  } else if (s.speciesId === 'quillshot') {
    quill.stepQuillProjectiles(s, players, dt); quill.advanceQuillshotTimers(s, dt);
  } else {
    advanceTimedMode(s.states.enrage, dt); advanceEmbermaneModes(s, dt);
    stepEmbermaneProjectiles(s, players, dt); s.flash = Math.max(0, s.flash - dt);
  }
}
export const stepBehemoth = (s, ...args) => {
  const dt = args[1], bounds = args[2];
  // If a canceled attempt leaves the Behemoth below its next threshold, let
  // the reaction finish, then start healing before species AI can enter enrage.
  if (s.mode === 'reaction' && canAttemptHeal(s) && s.elapsed + dt >= s.pause) {
    s.mode = 'idle'; s.move = null; s.elapsed = 0; s.pause = 0.4;
  }
  if (stepBehemothHealing(s, dt, bounds)) {
    stepHealingAuxiliaries(s, args[3]?.players ?? [{ id: 'local', position: args[0], knockedDown: args[3]?.targetKnockedDown }], dt);
    return [];
  }
  return implementation(s.speciesId ?? 'first-behemoth').step(s, ...args);
};
export const isInterruptible = s => implementation(s.speciesId ?? 'first-behemoth').interruptible(s);
export const behemothAttackTouchesPlayer = (s, p) => implementation(s.speciesId ?? 'first-behemoth').touches(s, p);
export const behemothContactAttack = s => definitionFor(s).moves[hasRunOutContact(s) ? 'runOut' : s.move];
