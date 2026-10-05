import * as THREE from 'three';
import { damageFeedback } from './combat-presentation.js';

/** Bounded presentation pools. No damage, state transitions or gameplay timers live here. */
export function createCombatFeedback(scene, container) {
  const layer = document.createElement('div');
  layer.className = 'combat-feedback'; layer.setAttribute('aria-hidden', 'true'); container.append(layer);
  const banner = document.createElement('div'); banner.className = 'combat-outcome'; layer.append(banner);
  const particles = [];
  const particleGeometry = new THREE.IcosahedronGeometry(0.035, 0);
  for (let i = 0; i < 96; i++) {
    const mesh = new THREE.Mesh(particleGeometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    mesh.visible = false; scene.add(mesh);
    particles.push({ mesh, life: 0, duration: 0, velocity: new THREE.Vector3() });
  }
  const rings = Array.from({ length: 6 }, () => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false; scene.add(mesh);
    return { mesh, life: 0 };
  });
  const labels = Array.from({ length: 24 }, () => {
    const element = document.createElement('span'); element.className = 'damage-number'; element.hidden = true; layer.append(element);
    return { element, position: new THREE.Vector3(), life: 0, duration: 1, drift: 0 };
  });
  let particleCursor = 0, labelCursor = 0, ringCursor = 0, shake = 0, bannerTime = 0, time = 0;
  let audio, master, noiseBuffer;
  let muted = false, shakeEnabled = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { muted = localStorage.getItem('open-range-muted') === 'true';
    const saved = localStorage.getItem('open-range-shake'); if (saved !== null) shakeEnabled = saved === 'true';
  } catch { /* Private browsing can disable storage. */ }
  const save = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* Optional preference. */ } };
  const unlockAudio = () => {
    if (muted) return;
    try {
      if (!audio) {
        const AudioContext = window.AudioContext ?? window.webkitAudioContext;
        if (!AudioContext) return;
        audio = new AudioContext(); master = audio.createGain(); master.gain.value = 0.12; master.connect(audio.destination);
        noiseBuffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.25), audio.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch { /* Sound is optional; combat continues without an audio device. */ }
  };
  // Called only from a real input gesture by the application.
  let lastSound = -1;
  const sound = (kind, weight = 1) => {
    if (muted || !audio || audio.state !== 'running') return;
    const now = audio.currentTime;
    if (kind === 'hit' && now - lastSound < 0.04) return;
    if (kind === 'hit') lastSound = now;
    const tone = audio.createOscillator(), gain = audio.createGain();
    const frequency = kind === 'cue' ? 160 : kind === 'reward' ? 440 : kind === 'hurt' ? 75 : kind === 'swing' ? 240 : 120;
    const duration = kind === 'reward' ? 0.32 : kind === 'cue' ? 0.22 : 0.12;
    tone.type = kind === 'reward' ? 'sine' : 'triangle';
    tone.frequency.setValueAtTime(frequency, now);
    tone.frequency.exponentialRampToValueAtTime(kind === 'reward' ? 880 : frequency * 0.3, now + duration);
    gain.gain.setValueAtTime(0.001, now); gain.gain.linearRampToValueAtTime(kind === 'swing' ? 0.12 : Math.min(weight, 1.2) * 0.5, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    tone.connect(gain); gain.connect(master); tone.start(now); tone.stop(now + duration);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    if (['hit', 'hurt', 'swing'].includes(kind)) {
      const noise = audio.createBufferSource(), filter = audio.createBiquadFilter(), envelope = audio.createGain();
      noise.buffer = noiseBuffer; filter.type = 'lowpass'; filter.frequency.value = kind === 'swing' ? 1800 : 3200;
      envelope.gain.setValueAtTime(kind === 'swing' ? 0.17 : 0.35, now); envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
      noise.connect(filter); filter.connect(envelope); envelope.connect(master); noise.start(now); noise.stop(now + duration);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); envelope.disconnect(); };
    }
  };
  const burst = (position, color, strength = 0.3) => {
    const count = Math.min(20, Math.round(5 + strength * 13));
    for (let i = 0; i < count; i++) {
      const p = particles[particleCursor++ % particles.length];
      p.mesh.visible = true; p.mesh.position.set(...position); p.mesh.material.color.set(color);
      p.duration = p.life = 0.2 + Math.random() * 0.22;
      p.velocity.set((Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5);
    }
  };
  const impact = (position, damage, { outcome = 'hit', part = 'body', periodic = false, brokenPart = null } = {}) => {
    if (outcome === 'ignored') return;
    const style = damageFeedback(outcome, part, periodic);
    if (brokenPart && outcome !== 'part-break') style.label = [style.label, damageFeedback('part-break', brokenPart).label].filter(Boolean).join(' / ');
    const label = labels[labelCursor++ % labels.length];
    label.position.set(...position); label.life = label.duration = periodic ? 0.7 : 0.95;
    label.drift = (labelCursor % 3 - 1) * 23;
    label.element.textContent = String(Math.round(damage)); label.element.style.color = style.color;
    label.element.classList.toggle('damage-heavy', Boolean(style.label)); label.element.hidden = false;
    if (!periodic) burst(position, style.color, style.strength);
    shake = Math.max(shake, style.strength * 0.075);
    if (style.label) {
      banner.textContent = style.label; banner.style.color = style.color; bannerTime = 1.35;
      const ring = rings[ringCursor++ % rings.length]; ring.life = 0.5; ring.mesh.visible = true;
      ring.mesh.position.set(position[0], 0.04, position[2]); ring.mesh.material.color.set(style.color);
    }
    if (!periodic) sound(style.label ? 'reward' : outcome === 'hurt' ? 'hurt' : 'hit', damage / 40 + 0.3);
  };
  const projected = new THREE.Vector3();
  const update = (dt, camera) => {
    time += dt; shake *= Math.exp(-dt * 18);
    bannerTime = Math.max(0, bannerTime - dt); banner.style.opacity = String(Math.min(1, bannerTime * 4));
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= dt; p.mesh.visible = p.life > 0;
      p.velocity.y -= dt * 8; p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.material.opacity = Math.max(0, p.life / p.duration); p.mesh.scale.setScalar(0.6 + p.life / p.duration);
    }
    for (const r of rings) {
      if (r.life <= 0) continue;
      r.life -= dt; r.mesh.visible = r.life > 0; r.mesh.scale.setScalar(0.5 + (0.5 - r.life) * 5);
      r.mesh.material.opacity = Math.max(0, r.life);
    }
    for (const label of labels) {
      if (label.life <= 0) continue;
      label.life -= dt;
      projected.copy(label.position); projected.y += (label.duration - label.life) * 0.85;
      projected.project(camera);
      label.element.hidden = label.life <= 0 || projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      label.element.style.left = `${(projected.x * 0.5 + 0.5) * container.clientWidth + label.drift}px`;
      label.element.style.top = `${(-projected.y * 0.5 + 0.5) * container.clientHeight}px`;
      label.element.style.opacity = String(Math.min(1, label.life * 4));
    }
  };
  const clear = () => {
    shake = 0; bannerTime = 0; banner.style.opacity = '0';
    for (const p of particles) { p.life = 0; p.mesh.visible = false; }
    for (const r of rings) { r.life = 0; r.mesh.visible = false; }
    for (const l of labels) { l.life = 0; l.element.hidden = true; }
  };
  return {
    impact, sound, unlockAudio, update, clear,
    applyCamera(camera) {
      if (!shakeEnabled) return;
      camera.translateX(Math.sin(time * 93) * shake); camera.translateY(Math.sin(time * 77) * shake * 0.65);
    },
    get muted() { return muted; }, get shakeEnabled() { return shakeEnabled; },
    setMuted(value) { muted = value; if (master) master.gain.value = muted ? 0 : 0.12; save('open-range-muted', muted); if (!muted) unlockAudio(); },
    setShake(value) { shakeEnabled = value; save('open-range-shake', value); },
  };
}
