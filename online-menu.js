import { ONLINE_TEXT as T } from './online-text.js';
import { EXPLORATION_ISLANDS } from './exploration-islands.js';
import { ROOM_SERVER_URL } from './online-config.js';
const STORAGE = 'doughty-online-v1';
export function createOnlineMenu({ connection, narrative, onPrivate, onGroup, onModal, settingsParent }) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch {}
  const preferences = { endpoint: ROOM_SERVER_URL, region: 'auto', maxPing: 200, createOnFailure: false, ...saved };
  const text = key => narrative?.text(T[key].id) ?? T[key].value;
  const element = (tag, key, parent, attributes = {}) => {
    const node = document.createElement(tag);
    if (key) { node.textContent = text(key); node.dataset.textId = T[key].id; }
    Object.assign(node, attributes); parent?.append(node); return node;
  };
  const button = (key, parent, action) => {
    const node = element('button', key, parent, { type: 'button', className: 'menu-button' });
    node.addEventListener('click', () => {
      if (['back', 'cancel'].includes(key) && ['searching', 'chooseRoom'].includes(screen)) {
        operation++; busy = false; action(); return;
      }
      run(action);
    }); return node;
  };
  const dialog = element('dialog', null, document.body, { className: 'online-menu' });
  const content = element('div', null, dialog);
  const notice = element('div', null, document.body, { className: 'online-notice', hidden: true });
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  const settings = element('details', null, settingsParent, { className: 'camera-settings online-settings' });
  element('summary', 'connection', settings);
  const current = element('p', null, settings);
  const codeDisplay = element('output', null, settings);
  const endpointLabel = element('label', 'server', settings);
  const endpoint = element('input', null, endpointLabel, { type: 'url', value: preferences.endpoint });
  endpoint.addEventListener('change', () => { preferences.endpoint = endpoint.value.trim(); save(); });
  const regionLabel = element('label', 'region', settings);
  const region = element('select', null, regionLabel);
  for (const value of ['auto', 'asia', 'oceania', 'europe', 'north-america', 'south-america', 'africa']) element('option', value, region, { value });
  region.value = preferences.region;
  region.addEventListener('change', () => { preferences.region = region.value; save(); });
  const minimum = element('label', 'minimum', settings);
  const strength = element('select', null, minimum);
  for (const [value, key] of [[0, 'any'], [300, 'fair'], [200, 'good'], [100, 'strong'], [60, 'excellent']]) element('option', key, strength, { value: String(value) });
  strength.value = String(preferences.maxPing);
  strength.addEventListener('change', () => { preferences.maxPing = Number(strength.value); save(); });
  const fallbackLabel = element('label', 'createOnFailure', settings);
  const fallback = element('input', null, fallbackLabel, { type: 'checkbox', checked: preferences.createOnFailure });
  fallback.addEventListener('change', () => { preferences.createOnFailure = fallback.checked; save(); });
  const leave = button('leave', settings, () => connection.host ? connection.leave() : connection.fallback());
  let refreshTimer = null, screen = '', generation = 0, busy = false, operation = 0, notifyTimer, destination = 'island';
  const latency = new Map(), failures = new Map();
  let resumeRefresh = null, measuring = null;
  const hostKey = room => `${preferences.endpoint}|${room.id}|${room.host}`;
  const sampleFor = room => {
    const sample = latency.get(hostKey(room));
    return sample && performance.now() - sample.at < 120000 ? sample : null;
  };
  const backedOff = room => (failures.get(hostKey(room))?.until ?? 0) > performance.now();
  function failed(room) {
    const key = hostKey(room), count = (failures.get(key)?.count ?? 0) + 1;
    failures.set(key, { count, until: performance.now() + Math.min(120000, 5000 * 2 ** (count - 1)) });
  }
  async function measure(room, revision) {
    if (sampleFor(room)) return sampleFor(room).ping;
    if (backedOff(room)) throw new Error('peer-unreachable');
    const key = hostKey(room);
    if (measuring?.key === key && measuring.revision === revision) return measuring.promise;
    const attempt = { key, revision };
    attempt.promise = (async () => {
      const ping = await connection.probe(room, { retain: true });
      if (revision !== generation || document.hidden) throw new Error('probe-cancelled');
      latency.set(key, { ping, at: performance.now() });
      failures.delete(key);
      return ping;
    })().finally(() => { if (measuring === attempt) measuring = null; });
    measuring = attempt;
    return attempt.promise;
  }
  function save() { try { localStorage.setItem(STORAGE, JSON.stringify(preferences)); } catch {} }
  function notify(key) {
    notice.textContent = text(key); notice.dataset.textId = T[key].id; notice.hidden = false; clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => { notice.hidden = true; }, 5500);
  }
  function updateRoom() {
    current.textContent = text(connection.room ? connection.host ? 'hosting' : 'groupPlay' : 'localPlay');
    codeDisplay.textContent = connection.room?.code ?? '';
    leave.hidden = !connection.room;
  }
  updateRoom(); connection.addEventListener('room', updateRoom);
  connection.addEventListener('fallback', () => notify('disconnected'));
  function close() {
    generation++; operation++; busy = false; connection.cancelProbes(); resumeRefresh = null;
    clearInterval(refreshTimer); refreshTimer = null; screen = '';
    if (dialog.open) dialog.close(); onModal(false);
    if (!connection.room) { connection.socket?.close(); connection.socket = null; }
  }
  function page(key) {
    generation++; connection.cancelProbes(); resumeRefresh = null;
    clearInterval(refreshTimer); refreshTimer = null; screen = key;
    content.replaceChildren(); element('h2', key, content);
    if (!dialog.open) { onModal(true); dialog.showModal(); }
  }
  async function run(action) {
    if (busy) return;
    busy = true; dialog.setAttribute('aria-busy', 'true');
    const currentOperation = ++operation;
    for (const b of content.querySelectorAll('button')) b.disabled = !['back', 'cancel'].some(k => b.dataset.textId === T[k].id);
    try { await action(); } catch (error) {
      if (currentOperation !== operation || error.message === 'probe-cancelled') return;
      console.warn('Online connection:', error.message);
      notify(error.message === 'room-full' ? 'roomFull' : error.message === 'peer-unreachable' ? 'unreachable' : 'connectionFailed');
      if (!connection.room && !dialog.open) entry();
    } finally {
      if (currentOperation !== operation) return;
      busy = false; dialog.removeAttribute('aria-busy');
      for (const b of content.querySelectorAll('button')) b.disabled = false;
    }
  }
  const ensureConnection = () => connection.connect(preferences.endpoint);
  async function enterGroup(room, creator) {
    await onGroup(room, creator);
    if (creator) await connection.ready();
    if (creator && room.private) {
      page('roomCreated'); element('p', 'roomCode', content); element('output', null, content, { textContent: room.code, className: 'online-code' });
      button('continue', content, close);
    } else close();
  }
  async function create(isPrivate, title = '') {
    const revision = generation;
    await ensureConnection();
    if (revision !== generation || document.hidden) return;
    const room = await connection.create({ private: isPrivate, title, region: preferences.region, map: destination });
    if (revision !== generation || document.hidden) { await connection.leave(); return; }
    try { await enterGroup(room, true); } catch (e) { await connection.leave(); throw e; }
  }
  async function join(code) {
    const revision = generation;
    if (connection.room) await connection.leave();
    await ensureConnection();
    if (revision !== generation || document.hidden) throw new Error('probe-cancelled');
    const room = await connection.join(code);
    if (revision !== generation || document.hidden) { await connection.leave(); throw new Error('probe-cancelled'); }
    try { await enterGroup(room, false); } catch (e) { await connection.leave(); throw e; }
  }
  function entry() {
    page('huntPlay');
    button('privatePlay', content, async () => { close(); await onPrivate(destination); });
    button('groupPlay', content, group);
    button('back', content, close);
  }
  async function group() {
    // Choosing another group commits departure from the current room.
    if (connection.room) await connection.leave();
    page('groupPlay');
    button('quickJoin', content, quickJoin);
    button('chooseRoom', content, list);
    button('createRoom', content, creation);
    button('back', content, entry);
  }
  function codeEntry(back = group) {
    page('enterCode');
    const label = element('label', 'roomCode', content);
    const input = element('input', null, label, { type: 'text', maxLength: 12, autocomplete: 'off' });
    button('join', content, () => join(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') run(() => join(input.value)); });
    button('back', content, back); input.focus();
  }
  function creation() {
    page('createRoom');
    const label = element('label', 'title', content);
    const input = element('input', null, label, { type: 'text', maxLength: 60 });
    button('createPublic', content, () => create(false, input.value));
    button('createPrivate', content, () => create(true, input.value));
    button('back', content, group);
  }
  function rating(ping) { return ping <= 60 ? 'excellent' : ping <= 100 ? 'strong' : ping <= 200 ? 'good' : 'fair'; }
  async function list() {
    page('chooseRoom'); const revision = generation;
    element('p', null, content, { textContent: destination === 'island' ? 'Cinderwild Isle' : EXPLORATION_ISLANDS[destination]?.name });
    const label = element('label', 'gameMode', content);
    const mode = element('select', null, label); element('option', 'huntingGrounds', mode, { value: 'hunting-grounds' });
    const filterLabel = element('label', 'minimum', content);
    const filter = strength.cloneNode(true); filterLabel.append(filter);
    filter.value = '0';
    const rows = element('div', null, content, { className: 'online-rooms' });
    let rooms = [], fetching = false, selected = null;
    const render = () => {
      rows.replaceChildren();
      for (const room of rooms) {
        const ping = sampleFor(room)?.ping ?? null;
        if (Number(filter.value) && ping != null && ping > Number(filter.value)) continue;
        const row = element('div', null, rows, { className: 'online-room' });
        // User room titles are data, never narrative markup or executable HTML.
        const title = element('strong', null, row, { textContent: room.title || text('defaultTitle') }); title.dataset.narrativeDirect = '';
        element('span', 'huntingGrounds', row);
        const locationName = room.map === 'island' ? 'Cinderwild Isle' : EXPLORATION_ISLANDS[room.map]?.name;
        element('span', null, row, { textContent: locationName });
        element('span', null, row, { textContent: `${room.members} / ${room.capacity}` });
        element('span', ping == null ? 'unknown' : rating(ping), row);
        button('join', row, async () => {
          if (selected !== room.id) connection.cancelProbes();
          selected = room.id;
          try {
            const ping = await measure(room, revision);
            if (revision !== generation) return;
            render();
            if (Number(filter.value) && ping > Number(filter.value)) return;
            await join(room.id);
          } catch (error) {
            if (error.message !== 'probe-cancelled') failed(room);
            throw error;
          }
        });
        // Focus selects a room for measurement without committing to a join.
        row.addEventListener('focusin', () => {
          if (busy || selected === room.id || sampleFor(room) || backedOff(room)) return;
          selected = room.id; connection.cancelProbes();
          measure(room, revision).then(() => { if (revision === generation && !busy) render(); }).catch(error => {
            if (error.message !== 'probe-cancelled') failed(room);
          });
        });
      }
      if (!rows.children.length) element('p', 'noRooms', rows);
    };
    filter.addEventListener('change', render);
    async function refresh() {
      if (fetching || revision !== generation || document.hidden) return;
      fetching = true;
      try {
        await ensureConnection();
        if (revision !== generation || document.hidden) return;
        const result = await connection.list({ mode: mode.value, map: destination });
        if (revision !== generation) return;
        rooms = result.rooms.filter(room => room.map === destination); render();
      } catch { if (revision === generation) notify('connectionFailed'); }
      finally { fetching = false; }
    }
    button('refresh', content, refresh); button('back', content, group);
    resumeRefresh = refresh;
    refreshTimer = setInterval(refresh, 30000); await refresh();
  }
  async function quickJoin() {
    page('searching'); const revision = generation;
    button('cancel', content, group);
    await ensureConnection();
    if (revision !== generation || document.hidden) return;
    const { rooms } = await connection.list({ mode: 'hunting-grounds', map: destination });
    const candidates = rooms.filter(r => r.map === destination && !backedOff(r))
      .sort((a, b) => Number(b.region === preferences.region) - Number(a.region === preferences.region) || Math.random() - .5).slice(0, 6);
    for (const room of candidates) {
      if (revision !== generation || document.hidden) return;
      try {
        const ping = await measure(room, revision);
        if (revision !== generation || document.hidden) return;
        if (preferences.maxPing && ping > preferences.maxPing) { connection.cancelProbes(); continue; }
        await join(room.id); return;
      } catch (error) {
        if (error.message === 'probe-cancelled' || revision !== generation) return;
        failed(room); connection.cancelProbes();
        await ensureConnection();
      }
    }
    if (revision !== generation || document.hidden) return;
    if (preferences.createOnFailure) await create(false);
    else { group(); notify('noRooms'); }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      connection.cancelProbes();
      if (screen === 'searching') { operation++; busy = false; group(); }
    } else if (dialog.open) resumeRefresh?.();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) close(); });
  narrative?.onLanguageChange(updateRoom);
  return {
    open(map = 'island', action = null) {
      destination = map;
      if (!action) { entry(); return; }
      run(async () => {
        if (connection.room) await connection.leave();
        if (action === 'quickJoin') await quickJoin();
        else if (action === 'chooseRoom') await list();
        else if (action === 'createRoom') creation();
        else if (action === 'privatePlay') { close(); await onPrivate(destination); }
      });
    },
    openCode() { codeEntry(close); },
    close, notify, get openNow() { return dialog.open; }, preferences,
  };
}
