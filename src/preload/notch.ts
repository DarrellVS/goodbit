import { contextBridge, ipcRenderer } from 'electron';
import type { NotchAction, NotchChime, NotchState } from '@shared/notch';

/**
 * The notch window's bridge, and all of it.
 *
 * Three calls, because the notch draws what main tells it and reports a button
 * press. It deliberately does not get the app's `window.goodbit`: it is always
 * on screen over other programs, and nothing on it should be able to reach an
 * endpoint that deletes a clip.
 */
const notch = {
  onState: (listener: (state: NotchState) => void) => {
    const handler = (_event: unknown, state: NotchState): void => listener(state);
    ipcRenderer.on('notch:state', handler);
    return () => ipcRenderer.removeListener('notch:state', handler);
  },
  onChime: (listener: (kind: NotchChime, volume: number) => void) => {
    const handler = (_event: unknown, kind: NotchChime, volume: number): void =>
      listener(kind, volume);
    ipcRenderer.on('notch:chime', handler);
    return () => ipcRenderer.removeListener('notch:chime', handler);
  },
  /** Says the page is listening, so main can send the state it missed. */
  ready: () => ipcRenderer.send('notch:ready'),
  act: (action: NotchAction) => ipcRenderer.send('notch:action', action),
};

contextBridge.exposeInMainWorld('goodbitNotch', notch);

export type NotchBridge = typeof notch;
