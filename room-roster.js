import { shieldAmount, shieldCapacity } from './resource-shields.js';
export const USERNAME_KEY = 'doughty-username';
export function normalizeUsername(value) {
  return Array.from(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim() : '').slice(0, 24).join('');
}
export class RoomIdentities {
  constructor() { this.players = new Map(); }
  ensure(id, name = '') {
    let entry = this.players.get(id);
    if (!entry) {
      const used = new Set([...this.players.values()].map(p => p.number));
      let number = 1; while (used.has(number)) number++;
      entry = { id, number, name: normalizeUsername(name) }; this.players.set(id, entry);
    }
    return entry;
  }
  restore(entries) {
    if (!Array.isArray(entries) || entries.length > 6) return;
    const next = new Map(), numbers = new Set();
    for (const p of entries) {
      if (!p || typeof p.id !== 'string' || !Number.isInteger(p.number) || p.number < 1 || p.number > 6 || numbers.has(p.number) || next.has(p.id)) return;
      numbers.add(p.number); next.set(p.id, { id: p.id, number: p.number, name: normalizeUsername(p.name) });
    }
    this.players = next;
  }
  snapshot() { return [...this.players.values()].sort((a, b) => a.number - b.number); }
  label(id) { const p = this.players.get(id); return p ? `${p.number}. ${p.name || 'player'}` : 'player'; }
}
export function createRoomRoster({ online, narrative, THREE, scene, remoteHunters }) {
  const identities = new RoomIdentities();
  let username = ''; try { username = normalizeUsername(localStorage.getItem(USERNAME_KEY)); } catch {}
  const label = document.createElement('label'); label.className = 'username-setting';
  const caption = document.createElement('span'); caption.dataset.textId = '05f60795-5e1e-4690-a0ab-5098616a02ad';
  caption.textContent = narrative.text(caption.dataset.textId);
  const input = document.createElement('input'); input.maxLength = 48; input.value = username; input.placeholder = 'player';
  label.append(caption, input); document.querySelector('#preferencesPanel').prepend(label);
  const publishName = () => {
    if (online.host) identities.ensure(online.id).name = username;
    else if (online.guest) online.send('profile', { name: username });
  };
  input.addEventListener('input', () => { username = normalizeUsername(input.value); try { localStorage.setItem(USERNAME_KEY, username); } catch {} publishName(); });
  input.addEventListener('change', () => { input.value = username; });
  const list = document.createElement('div'); list.className = 'room-roster'; list.hidden = true;
  document.querySelector('.player-vitals').append(list);
  const rows = new Map(), markers = new Map();
  const removeMarker = id => { const sprite = markers.get(id); if (!sprite) return; scene.remove(sprite); sprite.material.map.dispose(); sprite.material.dispose(); markers.delete(id); };
  online.addEventListener('room', ({ detail }) => {
    if (!detail) { identities.players.clear(); list.hidden = true; for (const id of markers.keys()) removeMarker(id); }
    else if (online.host) identities.ensure(online.id, username);
  });
  online.addEventListener('peer-open', publishName);
  online.addEventListener('handover', publishName);
  online.addEventListener('promoted', publishName);
  online.addEventListener('peer-left', ({ detail }) => { if (online.host) identities.players.delete(detail); });
  online.addEventListener('packet', ({ detail: { peer, type, data } }) => {
    if (type === 'profile' && online.host && online.peers.has(peer)) identities.ensure(peer).name = normalizeUsername(data?.name);
  });
  return {
    identities,
    accept(entries) { identities.restore(entries); },
    snapshot() {
      for (const id of identities.players.keys()) if (id !== online.id && !remoteHunters.has(id)) identities.players.delete(id);
      identities.ensure(online.id, username);
      for (const id of remoteHunters.keys()) identities.ensure(id);
      return identities.snapshot();
    },
    update(active) {
      list.hidden = !active;
      const visible = new Set();
      if (active) for (const p of identities.snapshot()) {
        if (p.id === online.id) continue;
        visible.add(p.id);
        let row = rows.get(p.id);
        if (!row) {
          row = document.createElement('div'); row.className = 'room-player'; row.dataset.narrativeDirect = '';
          const name = document.createElement('div'); row.append(name);
          for (const kind of ['health', 'shield']) { const track = document.createElement('div'); track.className = `room-bar ${kind}`; track.setAttribute('role', 'meter'); track.setAttribute('aria-label', kind === 'health' ? 'Health' : 'Health shields'); track.setAttribute('aria-valuemin', '0'); track.append(document.createElement('i')); row.append(track); }
          rows.set(p.id, row); list.append(row);
        }
        row.firstChild.textContent = identities.label(p.id); row.style.order = p.number;
        const hunter = remoteHunters.get(p.id), state = online.host ? hunter?.playerState : hunter?.targetPlayer ?? hunter?.playerState;
        for (const [index, value, max] of [[1, state?.health ?? 0, state?.maxHealth ?? 1], [2, shieldAmount(state ?? {}, 'health'), shieldCapacity(state ?? {}, 'health')]]) {
          const bar = row.children[index]; bar.firstChild.style.width = `${Math.max(0, Math.min(1, value / (max || 1))) * 100}%`;
          bar.setAttribute('aria-valuemax', String(max || 1)); bar.setAttribute('aria-valuenow', String(value));
          bar.hidden = index === 2 && max === 0;
        }
        if (hunter) {
          let sprite = markers.get(p.id);
          if (sprite && sprite.userData.number !== p.number) { removeMarker(p.id); sprite = null; }
          if (!sprite) {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#10202ddd'; ctx.beginPath(); ctx.arc(64, 64, 48, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 68px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.number), 64, 67);
            sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: true, depthWrite: false, transparent: true }));
            sprite.userData.number = p.number; sprite.scale.set(.65, .65, 1); scene.add(sprite); markers.set(p.id, sprite);
          }
          sprite.position.copy(hunter.playerView.root.position); sprite.position.y += 2.65; sprite.visible = hunter.playerView.root.visible;
        }
      }
      for (const [id, row] of rows) if (!visible.has(id)) { row.remove(); rows.delete(id); }
      for (const id of markers.keys()) if (!visible.has(id) || !remoteHunters.has(id)) removeMarker(id);
    },
  };
}
