import { app, BrowserWindow, Menu, Tray, shell, nativeImage } from 'electron';
import { join } from 'node:path';
import { initDatabase } from './data-source.js';
import { isConfigured, loadSettings, saveSettings, userDataDir } from './settings.js';
import { startServices, stopServices } from './startup.js';
import { startLocalServer, type LocalServer } from './server.js';
import { registerIpc } from './ipc/index.js';

/**
 * GoodBit's main process is the background service.
 *
 * It is registered to start with Windows, lives in the tray, and owns
 * everything stateful: the database, the folder watcher, ffmpeg. The window is
 * a client that attaches to it — closing the window hides it, and the watcher
 * keeps indexing whatever OBS writes while nothing is on screen.
 */

declare const __LEGACY_IMPORT__: boolean;

/** Set on quit so the close handler stops hiding and lets the app go. */
let quitting = false;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let apiServer: LocalServer | null = null;

/**
 * One service, or two watchers fight over one SQLite file.
 *
 * The lock follows GOODBIT_USER_DATA, so a test run with its own data folder
 * can launch beside the tray app instead of being turned away by it.
 */
const lockKey = process.env.GOODBIT_USER_DATA ?? 'default';
if (!app.requestSingleInstanceLock({ key: lockKey })) {
  app.quit();
}

app.on('second-instance', () => {
  // Launching again is how someone asks for the window back.
  showWindow();
});

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1012',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
      // The loopback API's port is chosen by the OS, and the renderer's axios
      // needs it at module load. Handing it over as a launch argument makes it
      // readable synchronously in the preload, with no round trip to race.
      additionalArguments: [`--api-port=${apiServer?.port ?? 0}`],
      // The renderer is ours, but it also renders filenames and notes that came
      // off disk; there is no reason for it to reach Node directly.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  // Anything aimed at a new window is a real link; hand it to the browser
  // rather than opening a chromeless Electron window on it.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.on('close', (event) => {
    // The point of the tray: closing the window must not stop the scanning.
    if (quitting || !loadSettings().keepRunningInTray) return;
    event.preventDefault();
    window.hide();
  });

  window.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }

  return window;
}

function showWindow(): void {
  if (!mainWindow) {
    mainWindow = createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildTray(): void {
  // An empty image still gives a usable tray entry; the real icon lands with
  // the packaging work rather than blocking the service from running.
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('GoodBit');
  refreshTrayMenu();
  tray.on('double-click', showWindow);
}

export function refreshTrayMenu(clipsToday?: number): void {
  if (!tray) return;
  const settings = loadSettings();

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open GoodBit', click: showWindow },
      ...(clipsToday === undefined
        ? []
        : [{ label: `${clipsToday} clip${clipsToday === 1 ? '' : 's'} today`, enabled: false }]),
      { type: 'separator' },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: settings.startAtLogin,
        click: (item) => {
          saveSettings({ startAtLogin: item.checked });
          applyLoginItem();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function applyLoginItem(): void {
  // Never register a login item for a throw-away test profile.
  if (process.env.GOODBIT_USER_DATA || !app.isPackaged) return;

  app.setLoginItemSettings({
    openAtLogin: loadSettings().startAtLogin,
    // Launched by Windows: no window, just the watcher and the tray.
    args: ['--hidden'],
  });
}

app.whenReady().then(async () => {
  console.log(`[goodbit] data directory ${userDataDir()}`);

  if (__LEGACY_IMPORT__) {
    // Development-only: adopt the database the self-hosted version left behind.
    const { importLegacyDatabase } = await import('./migration/importLegacy.js');
    const report = await importLegacyDatabase();
    if (!report.imported) console.log(`[migration] skipped — ${report.reason}`);
  }

  await initDatabase();

  // Before the window: it is handed the port as a launch argument.
  apiServer = await startLocalServer();

  registerIpc(() => mainWindow);
  buildTray();
  applyLoginItem();

  // A first run with nowhere to look for clips still opens, so the window can
  // ask for a folder. Only a configured install starts watching.
  if (isConfigured()) {
    void startServices();
  }

  const hidden = process.argv.includes('--hidden');
  if (!hidden) showWindow();

  app.on('activate', () => showWindow());
});

// The service outliving its window is the whole design, so this does not quit.
app.on('window-all-closed', () => {
  if (!loadSettings().keepRunningInTray) app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  stopServices();
  void apiServer?.close();
  apiServer = null;
});
