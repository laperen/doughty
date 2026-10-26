import { OnlineConnection as Connection } from './vendor/online-client.min.js';
import { STUN_URLS } from './online-config.js';
export { ONLINE_PROTOCOL } from './vendor/online-client.min.js';
export class OnlineConnection extends Connection {
  constructor(options = {}) { super({ stun: STUN_URLS, defaults: { mode: 'hunting-grounds', map: 'island' }, ...options }); }
}
