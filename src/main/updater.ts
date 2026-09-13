import { app, BrowserWindow, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

/**
 * Updates, the way ApexCut does them: electron-updater against GitHub releases.
 *
 * The renderer shows a banner and decides when to restart — a build that
 * installs itself mid-edit is exactly the behaviour the service worker had, and
 * why it was replaced. Downloading happens on its own; applying does not.
 */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

let state: UpdateState = { status: 'idle' };

function publish(getWindow: () => BrowserWindow | null, next: UpdateState): void {
  state = next;
  const window = getWindow();
  if (window && !window.isDestroyed()) window.webContents.send('updater:state', next);
}

export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('updater:state', () => state);

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return state;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      publish(getWindow, {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return state;
  });

  ipcMain.handle('updater:install', () => {
    if (state.status !== 'ready') return false;
    // Quits and relaunches into the new build.
    autoUpdater.quitAndInstall();
    return true;
  });

  // Nothing below means anything in development: there is no feed to check and
  // no packaged app to replace.
  if (!app.isPackaged) return;

  // The banner is the point; downloading silently and then asking is the
  // behaviour that does not interrupt anyone.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => publish(getWindow, { status: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    publish(getWindow, { status: 'available', version: info.version }),
  );
  autoUpdater.on('update-not-available', () => publish(getWindow, { status: 'idle' }));
  autoUpdater.on('download-progress', (progress) =>
    publish(getWindow, { status: 'downloading', percent: Math.round(progress.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    publish(getWindow, { status: 'ready', version: info.version }),
  );
  autoUpdater.on('error', (error) =>
    publish(getWindow, { status: 'error', message: error?.message ?? String(error) }),
  );

  void autoUpdater.checkForUpdates();
  // A window left open for days should still notice a release.
  setInterval(() => void autoUpdater.checkForUpdates(), 6 * 60 * 60 * 1000);
}
