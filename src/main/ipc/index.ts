import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import { loadSettings, saveSettings } from '../settings.js';
import { refreshRoots } from '../data-source.js';
import { onServiceEvent, reconcile, restartServices } from '../startup.js';

/**
 * The handlers behind the preload bridge.
 *
 * Only what main alone can do lives here for now — settings, folder pickers,
 * shell integration, service events. The library's own data still travels over
 * the loopback HTTP server until `services/*.ts` in the renderer moves across.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('settings:get', () => loadSettings());

  ipcMain.handle('settings:save', async (_event, patch: Record<string, unknown>) => {
    const before = loadSettings();
    const after = saveSettings(patch);

    // Pointing the app at a different folder has to take effect without a
    // restart, or the setting looks broken until one happens.
    if (after.videosRoot !== before.videosRoot || after.audioRoot !== before.audioRoot) {
      refreshRoots();
      if (after.videosRoot) await restartServices();
    }

    return after;
  });

  ipcMain.handle('settings:pickFolder', async (_event, title: string) => {
    const window = getWindow();
    const options = {
      title: title || 'Choose a folder',
      properties: ['openDirectory' as const, 'createDirectory' as const],
    };

    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('library:rescan', async () => {
    await reconcile();
    return { ok: true };
  });

  // `trash`, `explorer.exe` and `start` were Windows-only shell-outs; these do
  // the same thing through Electron and work everywhere.
  ipcMain.handle('shell:showInFolder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    const error = await shell.openPath(filePath);
    return error ? { ok: false, error } : { ok: true };
  });

  ipcMain.handle('app:version', () => app.getVersion());

  // Push the watcher's findings to whatever window happens to be open.
  onServiceEvent((event) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('service:event', event);
  });
}
