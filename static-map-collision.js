import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
// Shared triangle identities are essential to Octree candidate deduplication.
export function serializeCollisionTree(tree) {
  const triangles = [], ids = new Map();
  const collect = (node, found = new Set()) => {
    node.triangles.forEach(t => found.add(t));
    node.subTrees.forEach(child => collect(child, found));
    return [...found];
  };
  // Deep subdivisions duplicate large surfaces excessively. Coarser leaves
  // retain identical triangles and query results with much less startup data.
  const visit = (node, depth = 0) => ({
    box: [node.box.min.toArray(), node.box.max.toArray()],
    triangles: (depth >= 6 ? collect(node) : node.triangles).map(triangle => {
      if (!ids.has(triangle)) {
        ids.set(triangle, triangles.length);
        triangles.push([triangle.a.toArray(), triangle.b.toArray(), triangle.c.toArray()]);
      }
      return ids.get(triangle);
    }),
    children: depth >= 6 ? [] : node.subTrees.map(child => visit(child, depth + 1)),
  });
  const root = visit(tree);
  return { triangles, root };
}
export function restoreCollisionTree(data) {
  const triangles = data.triangles.map(points => new THREE.Triangle(...points.map(p => new THREE.Vector3(...p))));
  const visit = node => {
    const tree = new Octree(new THREE.Box3(new THREE.Vector3(...node.box[0]), new THREE.Vector3(...node.box[1])));
    tree.triangles = node.triangles.map(id => triangles[id]);
    tree.subTrees = node.children.map(visit);
    return tree;
  };
  return visit(data.root);
}
