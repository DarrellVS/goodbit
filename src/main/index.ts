// First, and on its own line: see the file. Reordering this is a crash on install.
import './bootstrap.js';
import { app, BrowserWindow, Menu, Tray, shell, nativeImage } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { MoreThanOrEqual } from 'typeorm';
import { AppDataSource, initDatabase } from './data-source.js';
import { Clip } from './entity/Clip.js';
import { isConfigured, loadSettings, onSettingsChange, saveSettings, userDataDir } from './settings.js';
import { onServiceEvent, reconcile, startServices, stopServices } from './startup.js';
import { registerIpc } from './ipc/index.js';
import { registerApiBridge, startApiBridge, stopApiBridge } from './ipc/apiBridge.js';
import { registerProtocolScheme, registerProtocolHandler } from './protocol.js';
import { checkForUpdatesNow, registerUpdater } from './updater.js';
import { TITLEBAR_HEIGHT } from '@shared/index.js';
import { initialBounds, rememberWindowState } from './windowState.js';
import { shareService } from './services/share.js';

/**
 * GoodBit's main process is the background service.
 *
 * It is registered to start with Windows, lives in the tray, and owns
 * everything stateful: the database, the folder watcher, ffmpeg. The window is
 * a client that attaches to it — closing the window hides it, and the watcher
 * keeps indexing whatever OBS writes while nothing is on screen.
 */

declare const __LEGACY_IMPORT__: boolean;

/**
 * Fix the app name before anything asks for a path.
 *
 * userData is derived from it, and running unpackaged the default is
 * "Electron" — so a development run would use a different profile from the
 * installed app, and never exercise the real one.
 */
app.setName('GoodBit');

/** Set on quit so the close handler stops hiding and lets the app go. */
let quitting = false;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

/**
 * Redirect the whole profile before anything else runs.
 *
 * This has to happen here, not just in settings.ts: Electron derives the
 * single-instance lock and all of Chromium's state from `userData`, so setting
 * it only for our own files left a test run sharing a lock — and a cache —
 * with whatever install was already running, and being turned away by it.
 */
const dataOverride = process.env.GOODBIT_USER_DATA;
if (dataOverride) {
  mkdirSync(dataOverride, { recursive: true });
  app.setPath('userData', dataOverride);
}

/**
 * One service, or two watchers fight over one SQLite file.
 *
 * Scoped by `userData` above, so a test with its own profile launches beside
 * the tray app rather than being refused by it.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Must run before the app is ready, or Chromium will not treat the scheme as
// privileged and Range requests (therefore seeking) will not work.
registerProtocolScheme();

app.on('second-instance', () => {
  // Launching again is how someone asks for the window back.
  showWindow();
});

function createWindow(): BrowserWindow {
  const remembered = initialBounds();

  const window = new BrowserWindow({
    width: remembered.width,
    height: remembered.height,
    x: remembered.x,
    y: remembered.y,
    minWidth: 940,
    minHeight: 600,
    show: false,
    icon: appIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#0f1012',
    // A drawn title bar, with Windows still owning the caption buttons — which
    // keeps the snap layouts that appear on hovering maximise, and the system
    // behaviour for double-click and drag.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#a0a4ac',
      height: TITLEBAR_HEIGHT,
    },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
      // The renderer is ours, but it also renders filenames and notes that came
      // off disk; there is no reason for it to reach Node directly.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (remembered.maximized) window.maximize();
  rememberWindowState(window);

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

/**
 * The icon as a file. The exe carries one for the taskbar, but a tray entry
 * and a development window take an image from JavaScript — so the PNG ships
 * beside the asar (`extraResources` in electron-builder.yml) and is read from
 * `build/` while developing.
 */
function appIcon(): Electron.NativeImage {
  const candidates = [
    join(process.resourcesPath ?? '', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
  ];
  const found = candidates.find((p) => existsSync(p));
  return found ? nativeImage.createFromPath(found) : nativeImage.createEmpty();
}

/** Tray-sized, one representation per common Windows scale so it stays crisp. */
function trayIcon(): Electron.NativeImage {
  const base = appIcon();
  if (base.isEmpty()) return base;
  const icon = nativeImage.createEmpty();
  for (const [scaleFactor, px] of [[1, 16], [1.25, 20], [1.5, 24], [2, 32]] as const) {
    icon.addRepresentation({ scaleFactor, buffer: base.resize({ width: px, height: px }).toPNG() });
  }
  return icon;
}

function buildTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip('GoodBit');
  void refreshTrayMenu();
  tray.on('double-click', showWindow);
}

/** Show the window on a route — what the tray items reach for. */
function openIn(path: string): void {
  showWindow();
  const window = mainWindow;
  if (!window) return;
  const send = (): void => {
    if (!window.isDestroyed()) window.webContents.send('app:navigate', path);
  };
  // A window that was just created has no router yet to hand the path to.
  if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', send);
  else send();
}

async function latestClip(): Promise<Clip | null> {
  if (!AppDataSource.isInitialized) return null;
  return AppDataSource.getRepository(Clip).findOne({ where: {}, order: { createdAt: 'DESC' } });
}

async function clipsToday(): Promise<number> {
  if (!AppDataSource.isInitialized) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return AppDataSource.getRepository(Clip).count({ where: { createdAt: MoreThanOrEqual(start) } });
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * The tray menu is the app for someone who never opens the window: the
 * replay buffer just saved something, and the next step is to trim it. So the
 * menu leads with today's count and the latest clip, and the rest is what
 * the settings screen would be opened for.
 */
export async function refreshTrayMenu(): Promise<void> {
  if (!tray) return;
  const settings = loadSettings();
  const [latest, today] = await Promise.all([
    latestClip().catch(() => null),
    clipsToday().catch(() => 0),
  ]);
  if (!tray) return;

  const latestName = latest ? shorten(latest.displayName || latest.filename, 40) : null;
  const count = `${today} clip${today === 1 ? '' : 's'} today`;

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open GoodBit', click: showWindow },
      { label: latestName ? `${count} · latest: ${latestName}` : count, enabled: false },
      { type: 'separator' },
      {
        label: 'Trim the latest clip',
        enabled: !!latest,
        click: () => latest && openIn(`/trim/${latest.id}`),
      },
      {
        label: 'Open the latest clip',
        enabled: !!latest,
        click: () => latest && openIn(`/clips/${latest.id}`),
      },
      {
        label: 'Open the clips folder',
        enabled: !!settings.videosRoot,
        click: () => void shell.openPath(settings.videosRoot),
      },
      { label: 'Rescan the library', click: () => void reconcile() },
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
      {
        label: 'Keep running when the window closes',
        type: 'checkbox',
        checked: settings.keepRunningInTray,
        click: (item) => saveSettings({ keepRunningInTray: item.checked }),
      },
      ...(app.isPackaged
        ? [{ label: 'Check for updates', click: () => { checkForUpdatesNow(); showWindow(); } }]
        : []),
      { label: 'Settings', click: () => openIn('/settings') },
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

  registerProtocolHandler();
  await startApiBridge();
  registerApiBridge();
  registerIpc(() => mainWindow);
  registerUpdater(() => mainWindow);
  buildTray();
  applyLoginItem();
  // The menu quotes the library and two settings, so it follows both.
  onServiceEvent((event) => {
    if (event.type !== 'scan-started') void refreshTrayMenu();
  });
  onSettingsChange(() => void refreshTrayMenu());

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
  // A share is only ever meant to outlive the sheet that started it, not the app.
  shareService.stop();
  void stopApiBridge();
});
