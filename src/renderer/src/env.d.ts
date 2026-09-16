/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/** What the preload exposes. See `src/preload/index.ts`. */
interface GoodBitBridge {
  /** Every data call, dispatched through the router in main. */
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

interface AppSettingsWire {
  videosRoot: string;
  audioRoot: string;
  publisherBaseUrl: string;
  publisherToken?: string;
  startAtLogin: boolean;
  keepRunningInTray: boolean;
  startObsWithGoodbit?: boolean;
  migratedFromWebApp: boolean;
  learnFromTrims?: boolean;
  compressTrims?: boolean;
  compressPublished?: boolean;
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

interface Window {
  goodbit?: GoodBitBridge;
}
