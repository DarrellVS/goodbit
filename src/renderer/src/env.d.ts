/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/** What the preload exposes. See `src/preload/index.ts`. */
interface GoodBitBridge {
  /** Loopback API port, until the HTTP layer is gone. */
  apiPort: number;
  getSettings: () => Promise<{
    videosRoot: string;
    audioRoot: string;
    publisherBaseUrl: string;
    startAtLogin: boolean;
    keepRunningInTray: boolean;
    migratedFromWebApp: boolean;
  }>;
  saveSettings: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>;
  pickFolder: (title: string) => Promise<string | null>;
  rescan: () => Promise<{ ok: boolean }>;
  showInFolder: (filePath: string) => Promise<void>;
  openPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  app: { version: () => Promise<string> };
  updater: {
    state: () => Promise<UpdateStateWire>;
    check: () => Promise<UpdateStateWire>;
    install: () => Promise<boolean>;
    onState: (listener: (state: UpdateStateWire) => void) => () => void;
  };
  onServiceEvent: (listener: (event: unknown) => void) => () => void;
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
