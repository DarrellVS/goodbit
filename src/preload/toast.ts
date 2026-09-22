import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only way the overlay card can say anything back to main.
 *
 * That window had **no preload at all**, deliberately: it is a `data:text/html`
 * page driven one way from main with `executeJavaScript`, and nothing it could
 * possibly want to say was worth a channel. One button changes that, and this
 * is the narrowest thing that makes the button work.
 *
 * Two calls, no payload the window invents:
 *
 * - `hover` toggles whether the window takes the mouse at all. The card is
 *   created with `setIgnoreMouseEvents(true, { forward: true })`, which is the
 *   documented arrangement for exactly this: clicks pass straight through the
 *   card to whatever is behind it, and the page still receives `mousemove`, so
 *   it can say when the pointer is over the one rectangle that is meant to be
 *   clickable. Blanket-enabling mouse events would put a window in front of a
 *   game that can swallow a click.
 * - `action` carries a token **main issued**, and nothing else. No path, no
 *   clip ids, no route. The window cannot ask for anything main did not
 *   already offer, which is the same rule `deeplink.ts` applies to a
 *   `goodbit://` link and for the same reason: anything that can reach this
 *   channel should not be able to choose what it does.
 *
 * Kept out of `src/preload/index.ts` on purpose. That bridge is the whole
 * `window.goodbit` API, and the overlay is a sandboxed page over somebody's
 * game; handing it the app's API to use two functions would be the opposite of
 * what this window is for.
 */
contextBridge.exposeInMainWorld('goodbitToast', {
  hover: (over: boolean): void => {
    ipcRenderer.send('toast:hover', over === true);
  },
  action: (token: string): void => {
    ipcRenderer.send('toast:action', String(token ?? ''));
  },
});
