import * as THREE from 'three';

/** Visual-only contract v1. No inventory, movement, damage or collision imports. */
export const CHARACTER_ASSET_VERSION = 1;
export const CHARACTER_SLOTS = Object.freeze(['body', 'legs', 'gloves', 'head', 'face', 'helmet', 'hair', 'mask', 'goggles',
  'sword', 'repeaterLeft', 'repeaterRight', 'chainbladeLeft', 'chainbladeRight']);
const skinOnly = new Set(['body', 'legs', 'gloves', 'head', 'face', 'hair', 'mask']);
const headSlots = new Set(['helmet', 'mask', 'goggles']);
const visibilityKeys = ['hideHair', 'hideFace', 'hideHead'];

function resources(root) {
  const geometry = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root.traverse(node => {
    if (node.geometry) geometry.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    for (const material of [].concat(node.material ?? [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return () => {
    for (const item of [...geometry, ...materials, ...skeletons]) item.dispose();
    for (const texture of textures) { texture.source?.data?.close?.(); texture.dispose(); }
  };
}

/** Capture bind transforms before animation. Existing procedural pieces stay in place. */
export function createCharacterAssets(view, defaults, bones, attachments) {
  view.root.updateMatrixWorld(true);
  const bindMatrices = Object.fromEntries(Object.entries(bones).map(([name, bone]) => [name, bone.matrixWorld.clone()]));
  const rigBones = Object.entries(bones).map(([name, bone]) => ({ name, parent: bone.parent?.isBone ? bone.parent.name : null,
    position: bone.position.toArray(), bindMatrix: bindMatrices[name].toArray() }));
  const current = new Map(), requests = new Map(), rules = new Map();
  let disposed = false;
  function visibility() {
    const hides = { hideHair: false, hideFace: false, hideHead: false };
    for (const slot of headSlots) {
      const rule = { ...current.get(slot), ...rules.get(slot) };
      for (const key of visibilityKeys) hides[key] ||= rule[key] === true;
    }
    for (const node of current.get('head')?.nodes ?? defaults.head) node.visible = !hides.hideHead;
    for (const node of current.get('face')?.nodes ?? defaults.face) node.visible = !hides.hideHead && !hides.hideFace;
    const hair = current.get('hair');
    for (const node of hair?.nodes ?? defaults.hair) node.visible = !hides.hideHead && !hides.hideHair;
    return hides;
  }
  function remove(slot) {
    const previous = current.get(slot);
    for (const node of previous?.nodes ?? []) node.removeFromParent();
    previous?.dispose?.();
    current.delete(slot);
  }
  function reset(slot) {
    if (!CHARACTER_SLOTS.includes(slot)) throw new Error(`Unknown visual slot: ${slot}`);
    requests.set(slot, (requests.get(slot) ?? 0) + 1);
    remove(slot);
    rules.delete(slot);
    for (const node of defaults[slot]) node.visible = true;
    visibility();
  }
  function install(slot, asset) {
    if (disposed) throw new Error('Character visual has been disposed.');
    if (!CHARACTER_SLOTS.includes(slot)) throw new Error(`Unknown visual slot: ${slot}`);
    if (!asset?.root?.isObject3D || asset.root.parent) throw new Error('A slot asset must own a detached Object3D root.');
    if (!['skinned', 'rigid'].includes(asset.kind) || skinOnly.has(slot) && asset.kind !== 'skinned') throw new Error(`${slot} requires a skinned asset.`);
    if (!skinOnly.has(slot) && !headSlots.has(slot) && asset.kind !== 'rigid') throw new Error(`${slot} requires an attached asset.`);
    for (const key of visibilityKeys) if (asset[key] !== undefined && typeof asset[key] !== 'boolean') throw new Error(`${key} must be a boolean.`);
    const nodes = [], bindings = [];
    if (asset.kind === 'skinned') {
      asset.root.updateMatrixWorld(true);
      asset.root.traverse(mesh => {
        if (!mesh.isMesh) return;
        if (!mesh.isSkinnedMesh) throw new Error('Every mesh in a skinned slot must be skinned.');
        if (!mesh.geometry.getAttribute('skinIndex') || !mesh.geometry.getAttribute('skinWeight')) throw new Error('Missing skin indices or weights.');
        const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
        if (indices.itemSize !== 4 || weights.itemSize !== 4 || indices.count !== mesh.geometry.getAttribute('position')?.count || weights.count !== indices.count) throw new Error('Invalid skin attribute layout.');
        for (let i = 0; i < indices.count; i++) {
          let sum = 0;
          for (let c = 0; c < 4; c++) {
            const weight = weights.getComponent(i, c), index = indices.getComponent(i, c);
            if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(index) || index < 0 || index >= mesh.skeleton.bones.length) throw new Error('Invalid skin weight or bone index.');
            sum += weight;
          }
          if (Math.abs(sum - 1) > .01) throw new Error('Skin weights must sum to one.');
        }
        const targets = mesh.skeleton.bones.map((bone, index) => {
          const target = bones[bone.name];
          if (!target) throw new Error(`Unknown bone: ${bone.name}`);
          const inverse = bindMatrices[bone.name].clone().invert();
          if (inverse.elements.some((n, i) => Math.abs(n - mesh.skeleton.boneInverses[index].elements[i]) > 1e-4)) throw new Error(`Incompatible bind pose: ${bone.name}`);
          return target;
        });
        // Preserve authored skin-index order; the hunter supplies the moving bones.
        bindings.push({ mesh, targets, inverses: mesh.skeleton.boneInverses.map(m => m.clone()), matrix: mesh.matrixWorld.clone() });
      });
      if (!bindings.length) throw new Error('No skinned mesh in asset.');
    } else if (!attachments[asset.attachment ?? slot]) throw new Error(`Unknown attachment: ${asset.attachment ?? slot}`);
    // Validate the whole replacement before removing a working visual.
    reset(slot);
    for (const node of defaults[slot]) node.visible = false;
    if (asset.kind === 'skinned') {
      for (const binding of bindings) {
        const { mesh, targets, inverses, matrix } = binding;
        const skeleton = binding.skeleton = new THREE.Skeleton(targets, inverses);
        mesh.removeFromParent(); mesh.matrix.copy(matrix); mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        // Meshes and bones share the hunter root; attached mode prevents double transforms.
        mesh.bindMode = THREE.AttachedBindMode; mesh.bind(skeleton, matrix);
        mesh.frustumCulled = false; view.root.add(mesh); nodes.push(mesh);
      }
      const release = asset.dispose;
      asset = { ...asset, dispose() { for (const b of bindings) b.skeleton.dispose(); release?.(); } };
    } else {
      const root = asset.root;
      const transform = asset.transform ?? {};
      root.position.fromArray(transform.position ?? [0, 0, 0]);
      root.rotation.fromArray([...(transform.rotation ?? [0, 0, 0]), 'XYZ']);
      root.scale.fromArray(transform.scale ?? [1, 1, 1]);
      attachments[asset.attachment ?? slot].add(root); nodes.push(root);
    }
    current.set(slot, { ...asset, nodes }); visibility();
  }
  return {
    bones, attachments, bindMatrices, defaults,
    set: install, reset, visibility,
    setVisibility(slot, flags) {
      if (!headSlots.has(slot)) throw new Error('Visibility rules belong to helmet, mask or goggles.');
      for (const key of visibilityKeys) if (typeof flags[key] !== 'boolean') throw new Error(`${key} must be a boolean.`);
      rules.set(slot, { ...flags }); return visibility();
    },
    describe() { return CHARACTER_SLOTS.map(slot => ({ slot, asset: current.get(slot)?.id ?? 'procedural', kind: current.get(slot)?.kind ?? 'procedural' })); },
    /** Last request wins; a failed load keeps the previous asset. */
    async load(slot, definition) {
      if (!CHARACTER_SLOTS.includes(slot)) throw new Error(`Unknown visual slot: ${slot}`);
      const request = (requests.get(slot) ?? 0) + 1; requests.set(slot, request);
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(definition.url);
      const release = resources(gltf.scene);
      if (disposed || requests.get(slot) !== request) { release(); return false; }
      try { install(slot, { ...definition, root: gltf.scene, dispose: release }); }
      catch (error) { release(); throw error; }
      return true;
    },
    /** Exportable bone hierarchy in hunter-local bind space. */
    rigDefinition() {
      return { version: CHARACTER_ASSET_VERSION, units: 'metres', forward: '-Z', up: '+Y',
        bones: structuredClone(rigBones) };
    },
    dispose() { disposed = true; for (const slot of CHARACTER_SLOTS) reset(slot); },
  };
}
