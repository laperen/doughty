import * as ember from './behemoth.js';
import * as quill from './quillshot.js';
import * as gnasher from './gnasher.js';
import { hasRunOutContact } from './behemoth-run-out.js';
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
export const hitBehemoth = (s, hit) => implementation(s.speciesId ?? 'first-behemoth').hit(s, hit);
export const stepBehemoth = (s, ...args) => implementation(s.speciesId ?? 'first-behemoth').step(s, ...args);
export const isInterruptible = s => implementation(s.speciesId ?? 'first-behemoth').interruptible(s);
export const behemothAttackTouchesPlayer = (s, p) => implementation(s.speciesId ?? 'first-behemoth').touches(s, p);
export const behemothContactAttack = s => definitionFor(s).moves[hasRunOutContact(s) ? 'runOut' : s.move];
