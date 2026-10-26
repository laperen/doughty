import { loadSceneAsset, restoreCollisionTree } from './vendor/three-foundation.min.js';
// Asset URLs are resolved here so relocating the reusable package cannot change map paths.
export async function loadMapAsset(name, fallback) {
  return loadSceneAsset(new URL(`./map-assets/${name}.json.gz`, import.meta.url), {
    fallback(error) { console.warn(`Using procedural ${name} source`, error); const view = fallback(); return view.root ? view : { root: view }; },
  }).then(view => view.metadata ? { root: view.root, stations: view.metadata.stations,
    collisionTree: view.metadata.collisionTree ? restoreCollisionTree(view.metadata.collisionTree) : null } : view);
}
