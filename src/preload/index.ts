import { contextBridge, ipcRenderer, webUtils } from 'electron';

/**
 * The only way the renderer reaches main.
 *
 * Deliberately thin: every entry forwards to one IPC channel and nothing else
 * happens here. The renderer wraps this in its own `api.ts`, which is where
 * arguments get copied to plain data, Vue reactive proxies cannot cross the
 * contextBridge and arrive as "An object could not be cloned".
 */
let inFlight = 0;

const api = {
  /** Every data call, dispatched through the router in main. No socket. */
  apiRequest: (request: unknown) => {
    inFlight += 1;
    return ipcRenderer.invoke('api:request', request).finally(() => {
      inFlight -= 1;
    });
  },
  /**
   * How many API requests are still waiting for an answer. Read by the e2e
   * suite to know a screen has finished loading its data, instead of sleeping
   * and hoping it had.
   */
  apiInFlight: () => inFlight,

  /** Settings main itself needs: roots, publisher, autostart. */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: unknown) => ipcRenderer.invoke('settings:save', patch),
  pickFolder: (title: string) => ipcRenderer.invoke('settings:pickFolder', title),
  moveLibrary: (destination: string) => ipcRenderer.invoke('library:move', destination),
  canMoveLibrary: (destination: string) => ipcRenderer.invoke('library:canMove', destination),
  closeObs: (force?: boolean) => ipcRenderer.invoke('obs:close', force),
  steamLaunch: (game: string) => ipcRenderer.invoke('steam:launch', game),
  /** Fire and forget: the window manager owns the drag from here. */
  dragOutClip: (clipId: number) => ipcRenderer.send('clip:dragOut', clipId),
  previewClipToast: () => ipcRenderer.invoke('toast:preview'),
  previewSweepToast: () => ipcRenderer.invoke('toast:previewSweep'),
  /** Every notch tile as it would read now, for the layout editor in Settings. */
  notchTiles: () => ipcRenderer.invoke('notch:tiles'),
  /** Fires when the shell is done with a drag this window started. */
  onDragOutEnd: (listener: () => void) => {
    const handler = (): void => listener();
    ipcRenderer.on('clip:dragOutEnded', handler);
    return () => ipcRenderer.removeListener('clip:dragOutEnded', handler);
  },
  mcpState: () => ipcRenderer.invoke('mcp:state'),
  mcpEnable: (enabled: boolean) => ipcRenderer.invoke('mcp:enable', enabled),
  streamDeckState: () => ipcRenderer.invoke('streamdeck:state'),
  streamDeckEnable: (enabled: boolean) => ipcRenderer.invoke('streamdeck:enable', enabled),
  streamDeckInstallPlugin: () => ipcRenderer.invoke('streamdeck:installPlugin'),
  mcpRegister: (wanted: boolean, ids?: string[]) =>
    ipcRenderer.invoke('mcp:register', wanted, ids),

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
  /** A web page, in the browser. Refused for anything that is not http(s). */
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  app: {
    version: () => ipcRenderer.invoke('app:version'),
    /**
     * A `goodbit://` link arrived. The window asks the person about it; it is
     * never applied on the strength of the link alone.
     */
    onDeepLink: (listener: (link: unknown) => void) => {
      const handler = (_: unknown, link: unknown): void => listener(link);
      ipcRenderer.on('app:deep-link', handler);
      return () => ipcRenderer.removeListener('app:deep-link', handler);
    },
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
    /** Puts a copy back and restarts into it. The app will exit if this succeeds. */
    restore: (backupPath: string) => ipcRenderer.invoke('backup:restore', backupPath),
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
   * Background service events, a clip appearing while the window is open, a
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
