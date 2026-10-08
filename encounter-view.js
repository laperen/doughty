import * as THREE from 'three';
import * as emberView from './behemoth-view.js';
import * as quillView from './quillshot-view.js';
export const createBehemothView = (scene, species) => species === 'quillshot' ? quillView.createQuillshotView(scene) : emberView.createBehemothView(scene);
export function updateBehemothView(view, s, ...args) {
  if (s.speciesId === 'quillshot') quillView.updateQuillshotView(view, s, ...args);
  else emberView.updateBehemothView(view, s, ...args);
  if (!view.woundMarkers) {
    view.woundMarkers = {};
    const geometry = new THREE.SphereGeometry(1, 12, 8);
    const material = new THREE.MeshBasicMaterial({ color: '#fa597d', transparent: true, opacity: .42, wireframe: true, depthWrite: false });
    for (const part of Object.keys(view.hitboxes)) {
      const marker = new THREE.Mesh(geometry, material); marker.name = `Wound: ${part}`;
      marker.visible = false; view.root.add(marker); view.woundMarkers[part] = marker;
    }
  }
  view.root.updateMatrixWorld(true);
  for (const [part, marker] of Object.entries(view.woundMarkers)) {
    marker.visible = s.mode !== 'defeated' && (s.parts[part]?.woundRemaining ?? 0) > 0;
    if (!marker.visible) continue;
    const box = new THREE.Box3().setFromObject(view.hitboxes[part]);
    marker.position.copy(view.root.worldToLocal(box.getCenter(new THREE.Vector3())));
    const scale = view.root.getWorldScale(new THREE.Vector3());
    marker.scale.copy(box.getSize(new THREE.Vector3()).multiplyScalar(.55).divide(scale));
  }
}

