import { contextBridge, ipcRenderer, webUtils } from 'electron';

/**
 * The only way the renderer reaches main.
 *
 * Deliberately thin: every entry forwards to one IPC channel and nothing else
 * happens here. The renderer wraps this in its own `api.ts`, which is where
 * arguments get copied to plain data — Vue reactive proxies cannot cross the
 * contextBridge and arrive as "An object could not be cloned".
 */
const api = {
  /** Every data call, dispatched through the router in main. No socket. */
  apiRequest: (request: unknown) => ipcRenderer.invoke('api:request', request),

  /** Settings main itself needs: roots, publisher, autostart. */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: unknown) => ipcRenderer.invoke('settings:save', patch),
  pickFolder: (title: string) => ipcRenderer.invoke('settings:pickFolder', title),

  /**
   * Importing hands over paths, not bytes: form data cannot cross the bridge,
   * and the files are already on this disk.
   */
  pickFiles: (kind: 'video' | 'audio') => ipcRenderer.invoke('files:pick', kind),
  importAudio: (paths: string[]) => ipcRenderer.invoke('audio:import', paths),
  importClips: (paths: string[]) => ipcRenderer.invoke('clips:import', paths),
  /** Electron 32 removed File.path; this is the supported replacement. */
  pathForFile: (file: File) => webUtils.getPathForFile(file),

  /** Library scanning. */
  rescan: () => ipcRenderer.invoke('library:rescan'),

  /** Shell integration, replacing the Windows-only calls the server made. */
  showInFolder: (filePath: string) => ipcRenderer.invoke('shell:showInFolder', filePath),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),

  app: {
    version: () => ipcRenderer.invoke('app:version'),
    /** The tray asked for a screen; the router takes it from here. */
    onNavigate: (listener: (path: string) => void) => {
      const handler = (_: unknown, path: string): void => listener(path);
      ipcRenderer.on('app:navigate', handler);
      return () => ipcRenderer.removeListener('app:navigate', handler);
    },
  },

  /** Copies of the library database, taken before any version changes the schema. */
  backups: {
    list: () => ipcRenderer.invoke('backup:list'),
    now: () => ipcRenderer.invoke('backup:now'),
    reveal: () => ipcRenderer.invoke('backup:reveal'),
  },

  /** Serving one clip to a phone on the same network, for half an hour. */
  share: {
    start: (clipId: number) => ipcRenderer.invoke('share:start', clipId),
    stop: () => ipcRenderer.invoke('share:stop'),
    current: () => ipcRenderer.invoke('share:current'),
  },

  window: {
    setOverlay: (colors: { symbolColor?: string }) =>
      ipcRenderer.invoke('window:setOverlay', colors),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  updater: {
    state: () => ipcRenderer.invoke('updater:state'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onState: (listener: (state: unknown) => void) => {
      const handler = (_: unknown, state: unknown): void => listener(state);
      ipcRenderer.on('updater:state', handler);
      return () => ipcRenderer.removeListener('updater:state', handler);
    },
  },

  /**
   * Background service events — a clip appearing while the window is open, a
   * scan finishing. Returns an unsubscribe, because a component that forgets
   * to detach would otherwise keep a dead listener alive for the session.
   */
  onServiceEvent: (listener: (event: unknown) => void) => {
    const handler = (_: unknown, event: unknown): void => listener(event);
    ipcRenderer.on('service:event', handler);
    return () => ipcRenderer.removeListener('service:event', handler);
  },
};

export type GoodBitApi = typeof api;

contextBridge.exposeInMainWorld('goodbit', api);
