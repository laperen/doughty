import * as THREE from 'three';

export function createEnvironment(scene, camera, lights) {
  const defaults = { skyTop: '#3ee6ee', skyHorizon: '#baefde', sunAngle: 145, sunlight: 3.2, ambient: 1.9, clouds: .45, wind: .7, windDirection: 90, fog: .35 };
  const state = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem('doughty-environment'));
    for (const key of Object.keys(defaults)) {
      if (typeof defaults[key] === 'string' && /^#[0-9a-f]{6}$/i.test(saved?.[key])) state[key] = saved[key];
      if (typeof defaults[key] === 'number' && Number.isFinite(saved?.[key])) state[key] = saved[key];
    }
  } catch { /* Defaults also cover unavailable storage. */ }
  const group = new THREE.Group(); group.name = 'Atmosphere'; scene.add(group);
  const uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms,
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 direction;
      void main(){float h=normalize(direction).y;gl_FragColor=vec4(mix(horizon,top,smoothstep(-.08,.85,h)),1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'Gradient sky'; sky.frustumCulled = false; sky.renderOrder = -1; group.add(sky);
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: '#f1dfdc', roughness: 1, fog: false });
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group(); const material = cloudMaterial.clone(); const angle = i * Math.PI * 2 / 10;
    cloud.position.set(Math.sin(angle) * (240 + i % 3 * 35), 100 + i % 3 * 18, Math.cos(angle) * (240 + i % 3 * 35));
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(geometry, material);
      puff.position.set(j * 5 - 7, (j % 2) * 2, j % 2 * 2);
      puff.scale.set(7, 3 + j % 2, 4); cloud.add(puff);
    }
    cloud.scale.setScalar(3);
    material.transparent = true; material.depthWrite = false;
    cloud.userData.material = material;
    group.add(cloud); clouds.push(cloud);
  }
  group.traverse(object => { object.userData.movementCollision = false; });
  const panel = document.querySelector('#environmentSettings');
  const inputs = [...panel.querySelectorAll('[data-environment]')];
  let arenaMode = 'range';
  const apply = () => {
    uniforms.top.value.set(state.skyTop); uniforms.horizon.value.set(state.skyHorizon);
    const angle = state.sunAngle * Math.PI / 180;
    lights.sun.position.set(Math.cos(angle) * 20, 15, Math.sin(angle) * 20);
    lights.sun.intensity = state.sunlight; lights.ambient.intensity = state.ambient;
    lights.ambient.color.set(state.skyTop).lerp(new THREE.Color('#ffffff'), .6);
    lights.sun.color.set(state.skyHorizon).lerp(new THREE.Color('#ffffff'), .5);
    const distance = arenaMode === 'island' ? 220 : 150;
    scene.fog.color.set(state.skyHorizon);
    scene.fog.near = 25 + (1 - state.fog) * distance;
    scene.fog.far = scene.fog.near + 40 + (1 - state.fog) * 180;
    clouds.forEach((cloud, i) => { cloud.visible = i < Math.round(state.clouds * clouds.length); });
    for (const input of inputs) {
      const key = input.dataset.environment; input.value = state[key];
      const output = panel.querySelector(`[data-value="${key}"]`);
      if (output) output.textContent = ['sunAngle', 'windDirection'].includes(key) ? `${state[key]}°` : Number(state[key]).toFixed(2);
    }
  };
  for (const input of inputs) {
    const key = input.dataset.environment;
    if (input.type === 'range') state[key] = THREE.MathUtils.clamp(state[key], Number(input.min), Number(input.max));
    input.addEventListener('input', () => {
      state[key] = input.type === 'color' ? input.value : Number(input.value); apply();
      try { localStorage.setItem('doughty-environment', JSON.stringify(state)); } catch { /* Session settings still work. */ }
    });
  }
  panel.querySelector('button').addEventListener('click', () => {
    Object.assign(state, defaults); apply();
    try { localStorage.removeItem('doughty-environment'); } catch { /* Session settings still work. */ }
  });
  apply();
  return {
    group, state,
    setArena(mode) { arenaMode = mode; apply(); },
    update(delta) {
      sky.position.copy(camera.position); sky.scale.setScalar(camera.far * .9);
      const direction = state.windDirection * Math.PI / 180;
      const travel = Math.max(0, delta) * state.wind * 10;
      // A camera-centered field keeps clouds available across both arenas. Reuse
      // every mesh, wrapping beyond a faded boundary rather than reallocating.
      const halfWidth = 380;
      for (const cloud of clouds) {
        cloud.position.x += Math.sin(direction) * travel;
        cloud.position.z -= Math.cos(direction) * travel;
        let x = cloud.position.x - camera.position.x;
        let z = cloud.position.z - camera.position.z;
        x = ((x + halfWidth) % (halfWidth * 2) + halfWidth * 2) % (halfWidth * 2) - halfWidth;
        z = ((z + halfWidth) % (halfWidth * 2) + halfWidth * 2) % (halfWidth * 2) - halfWidth;
        cloud.position.x = camera.position.x + x;
        cloud.position.z = camera.position.z + z;
        cloud.userData.material.opacity = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), 300, halfWidth);
      }
    },
  };
}
