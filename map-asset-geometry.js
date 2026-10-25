// Static map meshes may share geometry while retaining their own transforms,
// materials, shadows and collision flags. Keep names and other metadata in the
// comparison so distinct authored resources are not silently combined.
const signature = value => JSON.stringify(value, (_, entry) =>
  entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
    : entry);

/** Deduplicate serialized Three.js geometry in place; return the removal count. */
export function deduplicateMapGeometry(scene) {
  if (!scene.geometries) return 0;
  const definitions = new Map(), replacements = new Map(), unique = [];
  for (const geometry of scene.geometries) {
    const { uuid, ...definition } = geometry;
    const key = signature(definition);
    if (definitions.has(key)) replacements.set(uuid, definitions.get(key));
    else { definitions.set(key, uuid); unique.push(geometry); }
  }
  if (!replacements.size) return 0;
  const visit = object => {
    if (replacements.has(object.geometry)) object.geometry = replacements.get(object.geometry);
    for (const child of object.children || []) visit(child);
  };
  visit(scene.object);
  scene.geometries = unique;
  return replacements.size;
}
