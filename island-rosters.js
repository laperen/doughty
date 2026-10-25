// A roster entry identifies a species AND rank; Embermane's internal ID is first-behemoth.
const entry = (speciesId, tier) => Object.freeze({ speciesId, tier });
export const ISLAND_ROSTERS = Object.freeze({
  island: Object.freeze([entry('gnasher', 'lesser'), entry('first-behemoth', 'lesser')]),
  brackenlight: Object.freeze([entry('gnasher', 'normal'), entry('quillshot', 'lesser')]),
  thunderstep: Object.freeze([entry('first-behemoth', 'normal'), entry('quillshot', 'normal'), entry('gnasher', 'normal')]),
  rimewatch: Object.freeze([entry('quillshot', 'greater'), entry('gnasher', 'greater')]),
  cinderfall: Object.freeze([entry('first-behemoth', 'greater'), entry('first-behemoth', 'alpha'), entry('gnasher', 'alpha')]),
});
export const islandPopulationLimit = (arenas, roster) => Math.max(0, Math.min(arenas.length - 1, roster.length));
