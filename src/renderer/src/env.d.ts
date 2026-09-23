/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/** What the preload exposes. See `src/preload/index.ts`. */
interface GoodBitBridge {
  /** Every data call, dispatched through the router in main. */
  apiInFlight: () => number;
  apiRequest: (request: {
    method: string;
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
  }) => Promise<{ status: number; body: unknown }>;
  getSettings: () => Promise<AppSettingsWire>;
  saveSettings: (patch: Partial<AppSettingsWire>) => Promise<AppSettingsWire>;
  pickFolder: (title: string) => Promise<string | null>;
  moveLibrary: (destination: string) => Promise<{ jobId: string }>;
  canMoveLibrary: (
    destination: string,
  ) => Promise<{ problem: string | null; obsRunning: boolean }>;
  dragOutClip: (clipId: number) => void;
  previewClipToast: () => Promise<void>;
  previewSweepToast: () => Promise<void>;
  notchTiles: () => Promise<import('@shared/notch').NotchTiles>;
  onDragOutEnd: (listener: () => void) => () => void;
  steamLaunch: (
    game: string,
  ) => Promise<{ launched: boolean; appId?: string; reason?: string }>;
  mcpState: () => Promise<{
    enabled: boolean;
    running: boolean;
    url: string;
    token: string;
    command: string;
    clients: Array<{
      id: string;
      label: string;
      installed: boolean;
      writable: boolean;
      registered: boolean;
      configPath: string | null;
      note?: string;
    }>;
  }>;
  mcpEnable: (enabled: boolean) => Promise<{ ok: boolean }>;
  streamDeckState: () => Promise<{
    enabled: boolean;
    running: boolean;
    pipe: string;
    allowDiscard: boolean;
    pluginInstalled: boolean;
    pluginAvailable: boolean;
  }>;
  streamDeckEnable: (enabled: boolean) => Promise<{ ok: boolean }>;
  streamDeckInstallPlugin: () => Promise<{ ok: true } | { ok: false; error: string }>;
  mcpRegister: (
    wanted: boolean,
    ids?: string[],
  ) => Promise<Array<{ id: string; label: string; ok: boolean; error?: string }>>;
  closeObs: (
    force?: boolean,
  ) => Promise<{
    closed: boolean;
    wasClosed: boolean;
    reason?: 'no-window' | 'refused';
    ended?: boolean;
  }>;
  rescan: () => Promise<{ ok: boolean }>;
  pickFiles: (kind: 'video' | 'audio') => Promise<string[]>;
  importAudio: (paths: string[]) => Promise<{ imported: number; failed: number; tracks: unknown[]; errors?: string[] }>;
  importClips: (paths: string[]) => Promise<{ imported: number; failed: number; clips: unknown[]; errors?: string[] }>;
  pathForFile: (file: File) => string;
  showInFolder: (filePath: string) => Promise<void>;
  openPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ ok: boolean }>;
  app: {
    version: () => Promise<string>;
    onNavigate: (listener: (path: string) => void) => () => void;
    onDeepLink: (listener: (link: unknown) => void) => () => void;
  };
  backups: {
    list: () => Promise<BackupFileWire[]>;
    now: () => Promise<BackupResultWire>;
    reveal: () => Promise<void>;
    /** Puts a copy back and restarts. On success, the app exits shortly after. */
    restore: (backupPath: string) => Promise<RestoreResultWire>;
  };
  share: {
    start: (clipId: number) => Promise<ShareStateWire>;
    stop: () => Promise<null>;
    current: () => Promise<ShareStateWire | null>;
  };
  window: {
    setOverlay: (colors: { symbolColor?: string }) => Promise<void>;
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
  };
  updater: {
    state: () => Promise<UpdateStateWire>;
    check: () => Promise<UpdateStateWire>;
    install: () => Promise<boolean>;
    onState: (listener: (state: UpdateStateWire) => void) => () => void;
  };
  onServiceEvent: (listener: (event: unknown) => void) => () => void;
}

/**
 * Every key `settings.json` can hold, as it crosses the bridge.
 *
 * This is the wire shape of main's own `Settings`, and it had fallen six keys
 * behind it: `clipToast*`, `analyzeOnGameClose*`, `gameOverrides`, `mcp*`,
 * `window` and `schemaVersion` all existed in main and none of them here. It
 * is not cosmetic. `saveSettings` takes a `Partial<AppSettingsWire>`, so a key
 * missing from this interface cannot be written from the window at all
 * without a cast, and a whole settings screen can be built against a type that
 * says the thing it is editing does not exist.
 *
 * Whatever is added to `src/main/settings.ts` is added here, in the same
 * change.
 */
interface AppSettingsWire {
  videosRoot: string;
  audioRoot: string;
  publisherBaseUrl: string;
  publisherToken?: string;
  startAtLogin: boolean;
  keepRunningInTray: boolean;
  startObsWithGoodbit?: boolean;
  /** A person's own correction to what a folder's game is called. */
  gameOverrides?: Record<string, string>;
  notch?: boolean;
  notchAlwaysOn?: boolean;
  notchDwellMs?: number;
  notchLeaveMs?: number;
  /** The panels beside the open notch: off, on hover, or open with it. Unset means on hover. */
  notchWings?: 'off' | 'hover' | 'always';
  /** Which tiles each panel holds. Read through `resolveWingLayout`; unset is the default. */
  notchWingLayout?: {
    left: Array<{ id: string; x: number; y: number; tall?: boolean }>;
    right: Array<{ id: string; x: number; y: number; tall?: boolean }>;
  };
  clipToast?: boolean;
  clipToastSound?: boolean;
  clipToastCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  clipToastVolume?: number;
  analyzeOnGameClose?: boolean;
  analyzeOnGameCloseToast?: boolean;
  analyzeOnGameCloseSound?: boolean;
  mcpEnabled?: boolean;
  mcpPort?: number;
  mcpToken?: string;
  streamDeckEnabled?: boolean;
  streamDeckAllowDiscard?: boolean;
  migratedFromWebApp: boolean;
  /** The app version that last booted against this database. Main's, not the window's. */
  schemaVersion?: string;
  learnFromTrims?: boolean;
  compressTrims?: boolean;
  compressPublished?: boolean;
  recordingQuality?: 'balanced' | 'indistinguishable';
  window?: {
    x?: number;
    y?: number;
    width: number;
    height: number;
    maximized: boolean;
  };
  /** Storage Saver: how old an unopened clip has to be. Days. */
  unreviewedDays?: number;
  /** Storage Saver: how close two saves have to be to be one moment. Seconds. */
  burstWindowSec?: number;
}

interface BackupFileWire {
  name: string;
  path: string;
  sizeBytes: number;
  takenAt: string;
}

interface RestoreResultWire {
  restored: boolean;
  reason: string;
  /** Where the library that was replaced went, so this is itself undoable. */
  previousPath?: string;
  clips?: number;
}

interface BackupResultWire {
  taken: boolean;
  reason: string;
  path?: string;
  clips?: number;
}

/** A clip being served to the local network right now. */
interface ShareStateWire {
  url: string;
  clipId: number;
  name: string;
  /** Epoch milliseconds at which the share closes itself. */
  until: number;
}

type UpdateStateWire =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

/**
 * The notch window's bridge, which is all it gets: it is always on screen over
 * other programs, so nothing on it reaches the app's API. See `preload/notch.ts`.
 */
interface NotchBridge {
  onState: (listener: (state: import('@shared/notch').NotchState) => void) => () => void;
  onChime: (listener: (kind: import('@shared/notch').NotchChime, volume: number) => void) => () => void;
  ready: () => void;
  act: (action: import('@shared/notch').NotchAction) => void;
  press: (press: import('@shared/notch').NotchTilePress) => void;
}

interface Window {
  /** Only in the notch window. */
  goodbitNotch?: NotchBridge;
  goodbit?: GoodBitBridge;
}
