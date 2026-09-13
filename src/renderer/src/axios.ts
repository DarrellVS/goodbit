import axios from 'axios';

/**
 * Talking to the loopback API.
 *
 * A migration scaffold. The API runs inside the main process on 127.0.0.1 at a
 * port the OS picks, so the base URL is built from what the preload was handed
 * at launch. Each `services/*.ts` file moves to IPC in turn, and this goes away
 * with the last of them.
 *
 * The Firebase token interceptor is gone: there is nobody to authenticate to.
 * The listener is on loopback and its only client is this window.
 */
const port = window.goodbit?.apiPort ?? 0;

if (port > 0) {
  axios.defaults.baseURL = `http://127.0.0.1:${port}`;
} else {
  // Only reachable if the renderer somehow loads outside Electron. Same-origin
  // requests will fail, which is the honest outcome rather than a silent hang.
  console.error('No API port was provided; requests will fail.');
}

export default axios;
