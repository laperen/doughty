// Protocol 1: directory/signaling over WebSocket; hunt data over host WebRTC.
// STUN discovers direct paths. TURN relays are intentionally outside this game.
import { STUN_URLS } from './online-config.js';
export const ONLINE_PROTOCOL = 1;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export class OnlineConnection extends EventTarget {
  constructor({ stun = STUN_URLS } = {}) {
    super(); this.stun = stun; this.peers = new Map(); this.pending = new Map(); this.requestId = 0;
    this.room = null; this.id = null; this.socket = null; this.lastWorld = 0; this.sequence = 0;
    this.endpoint = null; this.handoverToken = null; this.term = 0; this.successors = []; this.migrating = false;
    this.handoverAcks = new Set(); this.handoverPreparing = false;
    this.probeEpoch = 0; this.activeProbes = new Set(); this.retainedProbes = new Map();
    this.listings = new Map();
    this.timer = setInterval(() => this.watch(), 1000);
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  get host() { return Boolean(this.room && this.room.host === this.id); }
  get guest() { return Boolean(this.room && !this.host); }
  async connect(endpoint) {
    this.endpoint = endpoint;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;
    const url = new URL(endpoint);
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (!['ws:', 'wss:'].includes(url.protocol) || location.protocol === 'https:' && url.protocol !== 'wss:') throw new Error('invalid-server');
    url.pathname = '/rooms'; url.search = ''; url.hash = '';
    this.connecting = new Promise((resolve, reject) => {
      const ws = new WebSocket(url); this.socket = ws;
      const timeout = setTimeout(() => { ws.close(); reject(new Error('server-unavailable')); }, 10000);
      ws.onmessage = event => {
        let m; try { m = JSON.parse(event.data); } catch { return; }
        if (m.type === 'hello') {
          clearTimeout(timeout);
          if (m.protocol !== ONLINE_PROTOCOL) { ws.close(); reject(new Error('version-mismatch')); return; }
          if (!this.room) this.id = m.id;
          else this.directoryId = m.id;
          resolve(); return;
        }
        if (m.request != null) {
          const pending = this.pending.get(m.request);
          if (pending) { this.pending.delete(m.request); clearTimeout(pending.timeout); m.error ? pending.reject(new Error(m.error)) : pending.resolve(m); }
          return;
        }
        this.message(m).catch(error => this.emit('diagnostic', error.message));
      };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('server-unavailable')); };
      ws.onclose = () => {
        clearTimeout(timeout); reject(new Error('server-unavailable'));
        if (ws !== this.socket) return;
        this.socket = null;
        for (const p of this.pending.values()) { clearTimeout(p.timeout); p.reject(new Error('server-unavailable')); }
        this.pending.clear();
        // A directory outage does not break a working peer connection.
        if (!ws.detached && this.room && this.host) {
          this.emit('directory-offline', null);
          this.recoverHostDirectory();
        }
      };
    }).finally(() => { this.connecting = null; });
    return this.connecting;
  }
  request(type, data = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('server-unavailable'));
    const request = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(request); reject(new Error('request-timeout')); }, 10000);
      this.pending.set(request, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ ...data, type, request }));
    });
  }
  async create(options) {
    const result = await this.request('create', { mode: 'hunting-grounds', map: 'island', ...options });
    this.handoverToken = result.handoverToken; this.term = result.term;
    this.room = result.room; this.emit('room', this.room); return this.room;
  }
  ready() { return this.request('ready'); }
  async list(options) {
    const key = JSON.stringify([this.endpoint, options.mode, options.map]);
    const previous = this.listings.get(key);
    const result = await this.request('list', { ...options, revision: previous?.revision });
    if (result.updated) {
      const rooms = new Map((previous?.rooms ?? []).map(r => [r.id, r]));
      for (const id of result.removed) rooms.delete(id);
      for (const room of result.updated) rooms.set(room.id, room);
      result.rooms = [...rooms.values()];
    }
    if (!result.unchanged) this.listings.set(key, result);
    if (this.listings.size > 10) this.listings.delete(this.listings.keys().next().value);
    return result.unchanged ? previous : result;
  }
  async join(code) {
    const retained = this.retainedProbes.get(code);
    const reusable = retained && this.peers.get(retained.token)?.channel?.readyState === 'open' ? retained.token : undefined;
    const result = await this.request('join', { code, token: reusable });
    this.handoverToken = result.handoverToken; this.term = result.term;
    this.room = result.room; this.lastWorld = performance.now() + 12000; this.emit('room', this.room);
    if (result.token) this.promoteProbe(result.token);
    this.cancelProbes();
    try {
      await this.waitPeer(this.room.host, 12000);
      await this.detachDirectory();
      return this.room;
    } catch (error) { await this.leave(); throw error; }
  }
  async detachDirectory() {
    if (!this.guest || this.socket?.readyState !== WebSocket.OPEN) return;
    const socket = this.socket;
    await this.request('detach');
    socket.detached = true; this.socket = null; socket.close();
  }
  async waitPeer(key, timeout, cancelled = () => false) {
    const end = performance.now() + timeout;
    while (performance.now() < end) {
      if (cancelled()) throw new Error('probe-cancelled');
      const peer = this.peers.get(key);
      if (peer?.channel?.readyState === 'open') return peer;
      if (peer?.pc.connectionState === 'failed') break;
      await wait(50);
    }
    throw new Error('peer-unreachable');
  }
  async message(m) {
    if (m.type === 'room' && (this.room?.id === m.room.id || !this.room)) {
      this.room = m.room; this.emit('room', this.room);
    } else if (m.type === 'member-joined' && this.host) {
      if (!m.token || !this.promoteProbe(m.token)) await this.makePeer(m.peer, null, true);
    } else if (m.type === 'member-left') {
      this.removePeer(m.peer); this.emit('peer-left', m.peer); this.sendStandbyRoster();
    } else if (m.type === 'probe' && this.host) {
      this.activeProbes.add(m.token);
      await this.makePeer(m.peer, m.token, true);
    } else if (m.type === 'end-probe') { this.activeProbes.delete(m.token); this.removePeer(m.token); }
    else if (m.type === 'signal') {
      if (m.token && !this.activeProbes.has(m.token)) return;
      const key = m.token ?? m.peer;
      // The server validates probe tokens and host/room membership too.
      if (!m.token && m.peer !== this.room?.host && !this.host) return;
      let peer = this.peers.get(key);
      if (!peer) peer = await this.makePeer(m.peer, m.token, false);
      this.acceptSignal(peer, m.data);
    }
  }
  acceptSignal(peer, data) {
    // Serialize SDP and ICE, including candidates delivered before the offer.
    peer.signals = peer.signals.then(async () => {
      if (data.description) {
        await peer.pc.setRemoteDescription(data.description);
        for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
        if (data.description.type === 'offer') {
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          await this.signalPeer(peer, { description: peer.pc.localDescription });
        }
      } else if (data.candidate || Array.isArray(data.candidates)) {
        for (const candidate of (data.candidates ?? [data.candidate]).slice(0, 32)) {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate);
          else peer.candidates.push(candidate);
        }
      }
    }).catch(error => this.emit('diagnostic', error.message));
  }
  signalPeer(peer, data) {
    if (peer.standby) return Promise.resolve(this.send('standby-signal', { peer: peer.id, data }));
    return this.request('signal', { peer: peer.id, token: peer.token, data });
  }
  async makePeer(id, token, offer, standby = false) {
    const key = token ?? id;
    if (this.peers.has(key)) return this.peers.get(key);
    const pc = new RTCPeerConnection({ iceServers: this.stun.length ? [{ urls: this.stun }] : [] });
    const peer = { id, token, standby, pc, candidates: [], outgoingCandidates: [], signals: Promise.resolve(), lastSeen: performance.now(), rtt: null, pings: new Map(), lastSequence: {} };
    this.peers.set(key, peer);
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      peer.outgoingCandidates.push(candidate.toJSON());
      if (!peer.iceTimer) peer.iceTimer = setTimeout(() => {
        peer.iceTimer = null;
        const candidates = peer.outgoingCandidates.splice(0);
        for (let i = 0; i < candidates.length; i += 16) this.signalPeer(peer, { candidates: candidates.slice(i, i + 16) }).catch(() => {});
      }, 40);
    };
    const attach = channel => {
      const replaceable = channel.label === 'snapshots';
      if (replaceable) peer.snapshots = channel; else peer.channel = channel;
      const lane = replaceable ? 'snapshots' : 'events';
      channel.onopen = () => {
        peer.lastSeen = performance.now();
        if (!peer.token && !replaceable && !peer.standby) { this.emit('peer-open', id); if (this.host) this.sendStandbyRoster(); }
      };
      channel.onclose = () => {
        if (replaceable || peer.token || this.peers.get(peer.id) !== peer || !this.room) return;
        if (this.guest && this.room.host === id) this.beginMigration();
        else if (this.host && !peer.standby) {
          this.removePeer(peer.id); this.emit('peer-left', id);
          this.request('remove-member', { peer: id }).catch(() => {});
          this.sendStandbyRoster();
        } else if (peer.standby) this.removePeer(peer.id);
      };
      channel.onmessage = async ({ data }) => {
        if (typeof data !== 'string' || data.length > 256 * 1024) return;
        let m; try { m = JSON.parse(data); } catch { return; }
        if (m.v !== ONLINE_PROTOCOL) return;
        peer.lastSeen = performance.now();
        if (m.type === 'ping') { this.sendPeer(peer, 'pong', { nonce: m.nonce }); return; }
        if (m.type === 'pong') {
          const started = peer.pings.get(m.nonce);
          if (started != null) { peer.rtt = performance.now() - started; peer.pings.delete(m.nonce); }
          return;
        }
        if ((m.type === 'standby-roster' || m.type === 'handover-intent') && id === this.room?.host && this.guest) {
          this.successors = m.data?.successors?.filter(x => typeof x === 'string') ?? [];
          for (const other of this.successors) if (other !== this.id && other !== id && !this.peers.has(other)) {
            this.makePeer(other, null, this.id < other, true).catch(error => this.emit('diagnostic', error.message));
          }
          if (m.type === 'handover-intent') this.sendPeer(peer, 'handover-ready', { term: this.term });
          return;
        }
        if (m.type === 'handover-ready' && this.host && m.data?.term === this.term) {
          this.handoverAcks.add(id);
          return;
        }
        if (m.type === 'standby-signal' && this.host) {
          if (this.peers.has(m.data?.peer) && m.data?.peer !== id && m.data?.data) this.send('standby-signal', { peer: id, data: m.data.data }, m.data.peer);
          return;
        }
        if (m.type === 'depart' && this.host && !peer.standby) {
          this.removePeer(id); this.emit('peer-left', id);
          this.request('remove-member', { peer: id }).catch(() => {});
          this.sendStandbyRoster();
          return;
        }
        if (m.type === 'standby-signal' && id === this.room?.host && this.guest) {
          const other = m.data?.peer;
          if (this.successors.includes(other) && m.data?.data) {
            const standbyPeer = this.peers.get(other) ?? await this.makePeer(other, null, false, true);
            this.acceptSignal(standbyPeer, m.data.data);
          }
          return;
        }
        if (m.type === 'handover' && this.guest && this.successors.includes(id) && m.data?.term > this.term) {
          this.adoptHost(id, m.data.term);
          return;
        }
        if (m.type === 'term-update' && this.guest && id === this.room?.host && Number.isSafeInteger(m.data?.term) && m.data.term > this.term) {
          this.term = m.data.term;
          return;
        }
        if (peer.token || !Number.isSafeInteger(m.seq) || m.seq <= (peer.lastSequence[lane] ?? -1)) return;
        peer.lastSequence[lane] = m.seq;
        if (m.type === 'world' && id === this.room?.host) this.lastWorld = performance.now();
        this.emit('packet', { peer: id, type: m.type, data: m.data });
      };
    };
    pc.ondatachannel = ({ channel }) => attach(channel);
    if (offer) {
      attach(pc.createDataChannel(token ? 'probe' : standby ? 'standby' : 'hunt', { ordered: true }));
      if (!standby) attach(pc.createDataChannel('snapshots', { ordered: false, maxRetransmits: 0 }));
      await pc.setLocalDescription(await pc.createOffer());
      await this.signalPeer(peer, { description: pc.localDescription });
    }
    return peer;
  }
  sendPeer(peer, type, data) {
    const replaceable = type === 'world' || type === 'input';
    const channel = replaceable && peer?.snapshots?.readyState === 'open' ? peer.snapshots : peer?.channel;
    if (channel?.readyState !== 'open' || channel.bufferedAmount > (replaceable ? 32 : 128) * 1024) return false;
    channel.send(JSON.stringify({ v: ONLINE_PROTOCOL, seq: ++this.sequence, type, data, ...(type === 'ping' || type === 'pong' ? data : {}) })); return true;
  }
  send(type, data, id = this.room?.host) { return this.sendPeer(this.peers.get(id), type, data); }
  broadcast(type, data) {
    for (const peer of this.peers.values()) if (!peer.token && !peer.standby && (this.host || peer.id === this.room?.host)) this.sendPeer(peer, type, data);
  }
  sendStandbyRoster() {
    if (!this.host || this.handoverPreparing) return;
    const successors = [...this.peers.values()].filter(p => !p.token && !p.standby && p.channel?.readyState === 'open')
      .sort((a, b) => (a.rtt ?? Infinity) - (b.rtt ?? Infinity) || a.id.localeCompare(b.id)).map(p => p.id);
    const changed = successors.join(',') !== this.successors.join(',');
    if (!changed) return;
    this.successors = successors;
    this.broadcast('standby-roster', { successors });
  }
  adoptHost(id, term) {
    if (!this.room || term <= this.term || !this.peers.get(id)?.channel || this.peers.get(id).channel.readyState !== 'open') return;
    const former = this.room.host;
    this.term = term; this.room = { ...this.room, host: id };
    this.peers.get(id).standby = false;
    this.lastWorld = performance.now() + 5000;
    this.migrating = false;
    if (former !== id) this.removePeer(former);
    this.emit('room', this.room); this.emit('handover', { host: id, term });
  }
  async beginMigration() {
    if (!this.guest || this.migrating) return;
    this.migrating = true;
    const former = this.room.host;
    const candidates = this.successors.filter(id => id !== former);
    for (const candidate of candidates) {
      if (!this.room || !this.guest) return;
      if (candidate === this.id) {
        try {
          const oldId = this.id, roomCode = this.room.code;
          if (this.socket?.readyState !== WebSocket.OPEN) await this.connect(this.endpoint);
          let result;
          const deadline = performance.now() + 2500;
          while (!result && performance.now() < deadline) {
            try { result = await this.request('claim', { code: roomCode, member: oldId, token: this.handoverToken, term: this.term + 1 }); }
            catch (error) {
              if (error.message !== 'handover-unavailable') throw error;
              await wait(150);
            }
          }
          if (!result) throw new Error('handover-unavailable');
          this.id = oldId; this.term = result.term; this.room = result.room;
          this.removePeer(former);
          for (const p of this.peers.values()) if (!p.token) p.standby = false;
          this.migrating = false;
          this.emit('promoted', { term: this.term }); this.emit('room', this.room);
          this.broadcast('handover', { term: this.term });
          this.sendStandbyRoster();
          return;
        } catch (error) { this.emit('diagnostic', error.message); }
      } else {
        const deadline = performance.now() + 3500;
        while (this.migrating && performance.now() < deadline) await wait(100);
        if (!this.migrating) return;
      }
    }
    this.migrating = false;
    this.fallback();
  }
  async releaseForHandover() {
    if (!this.host || !this.successors.length) return false;
    this.handoverPreparing = true; this.handoverAcks.clear();
    this.broadcast('handover-intent', { successors: this.successors });
    const deadline = performance.now() + 750;
    while (performance.now() < deadline && this.successors.some(id => !this.handoverAcks.has(id))) await wait(25);
    try { await this.request('release'); }
    finally { this.handoverPreparing = false; }
    // Peers detect the closed host channel and elect from the published order.
    return true;
  }
  async recoverHostDirectory() {
    if (this.recovering || !this.host || !this.endpoint) return;
    this.recovering = true;
    const member = this.id, code = this.room.code;
    for (let attempt = 0; attempt < 4 && this.host && !this.socket?.readyState; attempt++) {
      try {
        await wait(attempt ? 750 : 250);
        await this.connect(this.endpoint);
        const result = await this.request('claim', { code, member, token: this.handoverToken, term: this.term + 1 });
        this.term = result.term; this.room = result.room; this.emit('room', this.room);
        this.broadcast('term-update', { term: this.term });
        this.recovering = false;
        return;
      } catch (error) {
        const socket = this.socket; this.socket = null; socket?.close();
      }
    }
    this.recovering = false;
  }
  promoteProbe(token) {
    const peer = this.peers.get(token);
    if (!peer || peer.channel?.readyState !== 'open') return false;
    clearTimeout(peer.retainTimer);
    this.peers.delete(token); peer.token = null; this.peers.set(peer.id, peer);
    this.activeProbes.delete(token);
    for (const [room, retained] of this.retainedProbes) if (retained.token === token) this.retainedProbes.delete(room);
    this.emit('peer-open', peer.id);
    if (this.host) this.sendStandbyRoster();
    return true;
  }
  endProbe(token) {
    this.activeProbes.delete(token);
    for (const [room, retained] of this.retainedProbes) if (retained.token === token) this.retainedProbes.delete(room);
    this.removePeer(token);
    this.request('end-probe', { token }).catch(() => {});
  }
  cancelProbes() {
    this.probeEpoch++;
    for (const token of [...this.activeProbes]) this.endProbe(token);
  }
  async probe(room, { retain = false } = {}) {
    const epoch = this.probeEpoch;
    const { token, host } = await this.request('probe', { room: room.id });
    this.activeProbes.add(token);
    let kept = false;
    try {
      if (epoch !== this.probeEpoch) throw new Error('probe-cancelled');
      const peer = await this.waitPeer(token, 8000, () => epoch !== this.probeEpoch);
      const samples = [];
      for (let i = 0; i < 3; i++) {
        if (epoch !== this.probeEpoch) throw new Error('probe-cancelled');
        const nonce = `${performance.now()}-${i}`; peer.pings.set(nonce, performance.now());
        this.sendPeer(peer, 'ping', { nonce });
        const end = performance.now() + 1500;
        while (peer.pings.has(nonce) && performance.now() < end && epoch === this.probeEpoch) await wait(20);
        if (!peer.pings.has(nonce)) samples.push(peer.rtt);
      }
      if (!samples.length) throw new Error('peer-unreachable');
      if (epoch !== this.probeEpoch) throw new Error('probe-cancelled');
      if (retain) {
        kept = true; this.retainedProbes.set(room.id, { token, host });
        peer.retainTimer = setTimeout(() => this.endProbe(token), 8000);
      }
      return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    } finally { if (!kept) this.endProbe(token); }
  }
  watch() {
    const now = performance.now();
    for (const [key, peer] of this.peers) {
      if (peer.token) continue;
      if (peer.channel?.readyState === 'open') {
        const nonce = String(now); peer.pings.set(nonce, now); this.sendPeer(peer, 'ping', { nonce });
      }
      for (const [nonce, started] of peer.pings) if (now - started > 5000) peer.pings.delete(nonce);
      if (this.host && !peer.standby && now - peer.lastSeen > 15000) {
        this.removePeer(key); this.emit('peer-left', peer.id);
        this.request('remove-member', { peer: peer.id }).catch(() => {});
      }
    }
    if (this.host) this.sendStandbyRoster();
    if (this.guest && now - this.lastWorld > 8000) this.beginMigration();
  }
  removePeer(key) {
    const peer = this.peers.get(key); this.peers.delete(key);
    if (peer) { clearTimeout(peer.iceTimer); clearTimeout(peer.retainTimer); peer.channel?.close(); peer.snapshots?.close(); peer.pc.close(); }
  }
  fallback() { if (!this.guest) return; this.leave(); this.emit('fallback', null); }
  async leave() {
    this.cancelProbes();
    const wasHost = this.host;
    const canHandover = wasHost && this.successors.length > 0;
    if (canHandover) await this.releaseForHandover().catch(() => {});
    if (!wasHost) this.send('depart', {});
    this.room = null;
    for (const key of [...this.peers.keys()]) this.removePeer(key);
    const socket = this.socket;
    const leaving = socket?.readyState === WebSocket.OPEN && !canHandover ? this.request('leave').catch(() => {}) : Promise.resolve();
    this.socket = null; this.emit('room', null);
    await leaving;
    socket?.close();
    this.handoverToken = null; this.successors = []; this.term = 0; this.migrating = false;
  }
}
