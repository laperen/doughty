/** Authoring values shared by simulation, descriptions, menus and the previewer. */
export const CELL_RECIPES = Object.freeze({
  1: Object.freeze({ dust: 20, inputs: 0 }),
  2: Object.freeze({ dust: 20, inputs: 2 }),
  3: Object.freeze({ dust: 40, inputs: 2 }),
});
export const CELL_TUNING = Object.freeze({
  tough: { levels: [25, 30, 35, 40, 45, 50] },
  'counter-measures': { levels: [10, 20, 30, 40, 50, 60], duration: 60 },
  endurance: { levels: [50, 60, 70, 80, 90, 100] },
  'evasive-fury': { levels: [5, 8, 11, 14, 17, 20], duration: 8 },
  discipline: { levels: [30, 40, 50, 60, 70, 80] },
  'stunning-grace': { levels: [15, 30, 55, 70, 85, 100], interruptLevel: 3 },
  'wild-frenzy': { levels: [10, 12, 14, 16, 18, 20], duration: 15 },
  parasitic: { levels: [10, 12, 14, 16, 18, 20] },
  agility: { levels: [25, 30, 35, 40, 45, 50] },
  recycle: { levels: [5, 8, 11, 14, 17, 20], maxStacks: 5 },
});
export const ARMOR_DEFENSE_TIERS = Object.freeze({
  helmet: [1, 3, 4, 5], chestplate: [2, 3, 4, 5], gloves: [1, 2, 4, 5], legs: [1, 2, 3, 5],
});
export const FAMILY_TUNING = Object.freeze({
  embermane: { duration: 20, base: 10, tier4: 20, reforge8: 30 },
  quillshot: { base: 1, tier4: 2, reforge8: 3, damagePercent: 100 },
});
export const QUILL_TUNING = Object.freeze({ chargeTime: 12, speed: 24, range: 25,
  width: .18, height: .18, depth: .65, centerHeight: 1.3, spacing: .22 });
export const CHESTPLATE_TUNING = Object.freeze({ buffDuration: 20, cooldown: 30, chargeTime: 30,
  damage: 60, commitment: .5, releaseAt: .45, basePercent: 5, tier4Percent: 5, reforge8Percent: 5,
  baseQuills: 1, tier4Quills: 1, reforge8Quills: 1, spreadDegrees: 5 });
