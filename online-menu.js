import { createOnlineMenu as createMenu } from './vendor/online-client.min.js';
import { ONLINE_TEXT } from './online-text.js';
import { EXPLORATION_ISLANDS } from './exploration-islands.js';
import { ROOM_SERVER_URL } from './online-config.js';
import { configureMenuClose } from './menu-close.js';
export function createOnlineMenu(options) {
  return createMenu({ ...options, catalog: ONLINE_TEXT, endpoint: ROOM_SERVER_URL, storageKey: 'doughty-online-v1',
    destinations: { island: { name: 'Cinderwild Isle' }, ...EXPLORATION_ISLANDS }, defaultMap: 'island', defaultMode: 'hunting-grounds',
    modeLabel: mode => mode === 'hunting-grounds' ? options.narrative?.text(ONLINE_TEXT.huntingGrounds.id) ?? ONLINE_TEXT.huntingGrounds.value : mode,
    configureClose: configureMenuClose });
}
