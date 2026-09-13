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
  rescan: () => Promise<{ ok: boolean }>;
  showInFolder: (filePath: string) => Promise<void>;
  openPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  app: { version: () => Promise<string> };
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
  startAtLogin: boolean;
  keepRunningInTray: boolean;
  migratedFromWebApp: boolean;
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
