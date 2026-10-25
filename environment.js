import * as THREE from 'three';
import { RANGE_MAP } from './map-environment.js';

/** One background draw for the gradient and cosmetic, distant clouds. */
export function createEnvironment(scene, camera, lights, animationInput) {
  const animationStorageKey = 'doughty-cloud-animation';
  let animateClouds = true;
  try {
    animateClouds = localStorage.getItem(animationStorageKey) !== 'false';
  } catch { /* Animate by default when browser storage is unavailable. */ }
  animationInput.checked = animateClouds;
  animationInput.addEventListener('change', () => {
    animateClouds = animationInput.checked;
    try { localStorage.setItem(animationStorageKey, String(animateClouds)); }
    catch { /* The preference still applies for this session. */ }
  });
  // Preserve identity for the sun-shadow controller across map changes.
  const state = { ...RANGE_MAP.environment };
  const group = new THREE.Group(); group.name = 'Atmosphere'; scene.add(group);
  const uniforms = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    cloudColor: { value: new THREE.Color() }, cloudShadow: { value: new THREE.Color() },
    coverage: { value: 0 }, cloudScale: { value: 1 }, cloudStretch: { value: 1 },
    softness: { value: .18 }, drift: { value: new THREE.Vector2() },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms,
    // Far-plane depth keeps all map geometry in front of the sky.
    vertexShader: `varying vec3 direction;
      void main(){direction=position;
        vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        gl_Position=p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 top, horizon, cloudColor, cloudShadow;
      uniform float coverage, cloudScale, cloudStretch, softness;
      uniform vec2 drift;
      varying vec3 direction;
      float hash(vec2 p){
        vec3 q=fract(vec3(p.xyx)*.1031);
        q+=dot(q,q.yzx+33.33);
        return fract((q.x+q.y)*q.z);
      }
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      float cloudNoise(vec2 p){
        // Four bounded 2D octaves; no volume sampling or ray marching.
        float n=.55*noise(p);
        p=mat2(.8,-.6,.6,.8)*p*2.03+17.1;n+=.26*noise(p);
        p=p*2.01+9.2;n+=.13*noise(p);
        p=p*2.02+5.7;return n+.06*noise(p);
      }
      void main(){
        vec3 d=normalize(direction);
        vec3 color=mix(horizon,top,smoothstep(-.08,.85,d.y));
        if(d.y>0.0 && coverage>0.0){
          // Stable overhead projection with clouds fading into horizon haze.
          vec2 p=d.xz/(max(d.y,0.0)+.24)*cloudScale;
          p.x/=cloudStretch;
          float n=cloudNoise(p+drift);
          float threshold=mix(.91,.20,coverage);
          float mask=smoothstep(threshold-softness,threshold+softness,n);
          mask*=smoothstep(.015,.20,d.y)*smoothstep(0.0,.12,coverage);
          vec3 tint=mix(cloudShadow,cloudColor,smoothstep(threshold-.05,.88,n));
          color=mix(color,tint,mask*.92);
        }
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'Cloud sky'; sky.frustumCulled = false; sky.renderOrder = -1;
  sky.userData.movementCollision = false; group.add(sky);
  const apply = () => {
    uniforms.top.value.set(state.skyTop); uniforms.horizon.value.set(state.skyHorizon);
    uniforms.cloudColor.value.set(state.cloudColor); uniforms.cloudShadow.value.set(state.cloudShadow);
    uniforms.coverage.value = state.clouds; uniforms.cloudScale.value = state.cloudScale;
    uniforms.cloudStretch.value = state.cloudStretch; uniforms.softness.value = state.cloudSoftness;
    const angle = state.sunAngle * Math.PI / 180;
    lights.sun.position.set(Math.cos(angle) * 20, 15, Math.sin(angle) * 20);
    lights.sun.intensity = state.sunlight; lights.sun.color.set(state.sunColor);
    lights.ambient.intensity = state.ambient; lights.ambient.color.set(state.ambientColor);
    lights.ambient.groundColor.set(state.groundColor);
    if (lights.rim) { lights.rim.color.set(state.rimColor); lights.rim.intensity = state.rimIntensity; }
    scene.fog.color.set(state.fogColor);
    scene.fog.near = 25 + (1 - state.fog) * state.fogDistance;
    scene.fog.far = scene.fog.near + 40 + (1 - state.fog) * state.fogDepth;
  };
  apply();
  return {
    group, state,
    setMap(map) {
      Object.assign(state, RANGE_MAP.environment, map?.environment);
      uniforms.drift.value.set(0, 0);
      apply();
    },
    update(delta) {
      sky.position.copy(camera.position); sky.scale.setScalar(camera.far * .9);
      // Pause at the current offset; resuming continues without a jump.
      if (!animateClouds) return;
      const angle = state.windDirection * Math.PI / 180;
      const travel = Math.min(Math.max(0, delta), .1) * state.wind * .025;
      uniforms.drift.value.x += Math.sin(angle) * travel;
      uniforms.drift.value.y -= Math.cos(angle) * travel;
    },
  };
}
