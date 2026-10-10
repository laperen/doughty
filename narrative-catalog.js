import { sourceText, parameters } from './narrative-references.js';
import { StoryNodesRuntime } from './storynodes-runtime/index.js';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const tokens = /\{\{(name|value):([^}]+)\}\}/g;
const normalize = text => String(text).replace(/\s+/g, ' ').trim();
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Per-render overrides never modify saved narrative stats or names. */
export class DoughtyNarrativeRuntime extends StoryNodesRuntime {
  getText(key, context = {}) {
    const stack = context.textStack || [];
    if (stack.includes(key)) return `{{name:${key}}}`;
    return super.getText(key, { ...context, textStack: [...stack, key] });
  }
  _resolveToken(token, context) {
    if (['name', 'value'].includes(token.type) && own(context.overrides, token.parts[0])) {
      return context.overrides[token.parts[0]];
    }
    return super._resolveToken(token, context);
  }
  async followSingleOutputs(result) {
    const visited = new Set();
    while (result?.type === 'outputs' && result.nodeKeys.length === 1) {
      const key = result.nodeKeys[0];
      if (visited.has(key)) throw new Error('Dialogue has a cycle without a line or choice.');
      visited.add(key);
      result = await this.chooseOutput(key);
    }
    return result;
  }
}

/** Legacy English references identify UI text; exported UUIDs supply its current wording. */
export class NarrativeCatalog {
  constructor(runtime, sources = sourceText, parameterIds = parameters) {
    this.runtime = runtime;
    this.exact = new Map();
    this.patterns = [];
    this.cache = new Map();
    const parameterKeys = new Set(Object.values(parameterIds));
    // References preserve the English input snapshot even after an editor re-export.
    const originals = new Map(Object.entries(sources));
    const expand = (text, seen = []) => String(text).replace(tokens, (token, kind, key) => {
      if (kind !== 'name' || parameterKeys.has(key) || seen.includes(key)) return token;
      const value = originals.get(key) ?? runtime.project.text[key]?.value;
      return value == null ? token : expand(value, [...seen, key]);
    });
    for (const [uuid, original] of originals) {
      // References may outlive removed content in a later editor export.
      // Obsolete text must not prevent valid UI and NPC dialogue from loading.
      if (!runtime.project.text[uuid]) continue;
      const source = normalize(expand(original));
      if (!source) continue;
      const matches = [...source.matchAll(tokens)];
      if (!matches.length) {
        if (!this.exact.has(source)) this.exact.set(source, uuid);
        continue;
      }
      const fixed = source.replace(tokens, '');
      // Pure parameter/numeric labels remain literal UI values.
      if (!/[\p{L}]/u.test(fixed)) continue;
      let pattern = '', offset = 0;
      const slots = [];
      for (const match of matches) {
        const capture = match[1] === 'value' ? '([+-]?(?:\\d[\\d.,]*|Infinity|NaN|∞))' : '([\\s\\S]*?)';
        pattern += escape(source.slice(offset, match.index)) + capture;
        slots.push({ kind: match[1], key: match[2] });
        offset = match.index + match[0].length;
      }
      pattern += escape(source.slice(offset));
      this.patterns.push({ uuid: uuid, regex: new RegExp(`^${pattern}$`), slots, weight: fixed.length });
    }
    this.patterns.sort((a, b) => b.weight - a.weight);
  }
  clearCache() { this.cache.clear(); }
  text(uuid, overrides = {}) { return this.runtime.getText(uuid, { overrides }); }
  translate(input, depth = 0) {
    const value = String(input ?? '');
    if (!value.trim() || depth > 8) return value;
    if (this.cache.has(value)) return this.cache.get(value);
    const source = normalize(value);
    if (!/[\p{L}]/u.test(source) && !this.exact.has(source)) return value;
    let translated;
    const uuid = this.exact.get(source);
    if (uuid) translated = this.text(uuid);
    else {
      for (const pattern of this.patterns) {
        const match = pattern.regex.exec(source);
        if (!match) continue;
        const overrides = {};
        let valid = true;
        pattern.slots.forEach((slot, index) => {
          const captured = match[index + 1];
          if (own(overrides, slot.key) && overrides[slot.key] !== captured) valid = false;
          overrides[slot.key] = captured;
        });
        if (!valid) continue;
        for (const slot of pattern.slots) {
          if (slot.kind === 'name') overrides[slot.key] = this.translate(overrides[slot.key], depth + 1);
        }
        translated = this.text(pattern.uuid, overrides);
        break;
      }
    }
    // Preserve source spacing used by inline HTML fragments.
    const result = translated === undefined ? value : value.match(/^\s*/)[0] + translated.trim() + value.match(/\s*$/)[0];
    if (depth === 0) {
      if (this.cache.size > 2000) this.cache.clear();
      this.cache.set(value, result);
    }
    return result;
  }
}
