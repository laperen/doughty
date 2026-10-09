import * as THREE from 'three';
import { restoreCollisionTree } from './static-map-collision.js';
// Generated assets preserve material, geometry, shadow and collision metadata.
export async function loadMapAsset(name, fallback) {
  try {
    const response = await fetch(new URL(`./map-assets/${name}.json.gz`, import.meta.url));
    if (!response.ok) throw new Error(`Map asset: ${response.status}`);
    const stream = response.headers.get('Content-Encoding')?.includes('gzip')
      ? response.body : response.body.pipeThrough(new DecompressionStream('gzip'));
    const payload = await new Response(stream).json();
    return { root: new THREE.ObjectLoader().parse(payload.scene), stations: payload.stations, collisionTree: payload.collisionTree ? restoreCollisionTree(payload.collisionTree) : null };
  } catch (error) {
    console.warn(`Using procedural ${name} source`, error);
    const view = fallback();
    return view.root ? view : { root: view };
  }
}
