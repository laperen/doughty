import * as ember from './behemoth.js';
import * as quill from './quillshot.js';
export const definitionFor = s => s.speciesId === 'quillshot' ? quill.QUILLSHOT : ember.BEHEMOTH;
export const createBehemothState = (species = 'first-behemoth') => species === 'quillshot' ? quill.createQuillshotState() : ember.createBehemothState();
export const hitBehemoth = (s, hit) => s.speciesId === 'quillshot' ? quill.hitQuillshot(s, hit) : ember.hitBehemoth(s, hit);
export const stepBehemoth = (s, ...args) => s.speciesId === 'quillshot' ? quill.stepQuillshot(s, ...args) : ember.stepBehemoth(s, ...args);
export const isInterruptible = s => s.speciesId === 'quillshot' ? quill.isQuillshotInterruptible(s) : ember.isInterruptible(s);
export const behemothAttackTouchesPlayer = (s, p) => s.speciesId === 'quillshot' ? quill.quillshotAttackTouchesPlayer(s, p) : ember.behemothAttackTouchesPlayer(s, p);
