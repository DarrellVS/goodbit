import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';
import { basename, normalize } from 'node:path';
import { databasePath, loadSettings, saveSettings } from '../settings.js';
import { backupsDir, listBackups, takeBackup } from '../backup.js';
import { refreshRoots } from '../data-source.js';
import { onServiceEvent, reconcile, restartServices } from '../startup.js';
import { TITLEBAR_HEIGHT } from '@shared/index.js';
import { shareService } from '../services/share.js';

/**
 * The handlers behind the preload bridge.
 *
 * Only what main alone can do lives here for now, settings, folder pickers,
 * shell integration, service events. The library's own data still travels over
 * the loopback HTTP server until `services/*.ts` in the renderer moves across.
 */
/** Read the chosen files, skipping any that vanished between picking and now. */
async function readAll(paths: string[]): Promise<Array<{ name: string; data: Buffer }>> {
  const files: Array<{ name: string; data: Buffer }> = [];

  for (const path of paths ?? []) {
    try {
      files.push({ name: basename(path), data: await readFile(path) });
    } catch (error) {
      console.error(`[import] could not read ${path}:`, error);
    }
  }

  return files;
}

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

  /**
   * Move the library, rather than just look somewhere else.
   *
   * `settings:save` with a new `videosRoot` is the old behaviour and stays:
   * it repoints and rescans, leaving the clips where they are. This one takes
   * the clips with it, and takes their tags, notes, stars and dates too.
   */
  ipcMain.handle('library:move', async (_event, destination: string) => {
    const { MoveLibraryAction } = await import('../actions/MoveLibraryAction.js');
    return new MoveLibraryAction().execute({ destination, moveExisting: true });
  });

  /** What would go wrong, asked before anything is moved. */
  ipcMain.handle('library:canMove', async (_event, destination: string) => {
    const { whyNotMove } = await import('../actions/MoveLibraryAction.js');
    const { VIDEOS_ROOT } = await import('../data-source.js');
    const { obsIsRunning } = await import('../services/obs/paths.js');

    return {
      problem: whyNotMove(VIDEOS_ROOT, destination),
      obsRunning: await obsIsRunning(),
    };
  });

  /** Ask OBS to close, so a move can go ahead. Never forces it. */
  ipcMain.handle('obs:close', async (_event, force?: boolean) => {
    const { CloseObsAction } = await import('../actions/CloseObsAction.js');
    return new CloseObsAction().execute({ force: force === true });
  });

  ipcMain.handle('library:rescan', async () => {
    await reconcile();
    return { ok: true };
  });

  /**
   * Importing takes paths, not bytes.
   *
   * The web app posted files as multipart form data, which cannot cross the
   * contextBridge, uploads failed with "No files provided" once the transport
   * moved to IPC. It was the wrong shape for a desktop app anyway: the files
   * are already on this disk, so main reads them directly instead of streaming
   * them through the renderer's memory.
   */
  ipcMain.handle('files:pick', async (_event, kind: 'video' | 'audio') => {
    const window = getWindow();
    const filters =
      kind === 'audio'
        ? [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'] }]
        : [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv'] }];

    const options = {
      title: kind === 'audio' ? 'Choose music' : 'Choose clips',
      properties: ['openFile' as const, 'multiSelections' as const],
      filters,
    };

    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('audio:import', async (_event, paths: string[]) => {
    const files = await readAll(paths);
    const { ImportAudioFilesAction } = await import('../actions/ImportAudioFilesAction.js');
    return new ImportAudioFilesAction().execute({ files });
  });

  ipcMain.handle('clips:import', async (_event, paths: string[]) => {
    const files = await readAll(paths);
    const { ImportFilesAction } = await import('../actions/ImportFilesAction.js');
    const { ClipDTO } = await import('@shared/index.js');
    const result = await new ImportFilesAction().execute({
      files: files.map((f) => ({ ...f, size: f.data.byteLength })),
    });
    return { ...result, clips: result.clips.map((c) => ClipDTO.fromEntity(c)) };
  });

  // `trash`, `explorer.exe` and `start` were Windows-only shell-outs; these do
  // the same thing through Electron and work everywhere.
  ipcMain.handle('shell:showInFolder', (_event, filePath: string) => {
    // Normalised: these paths carry forward slashes, which the Windows shell
    // rejects.
    shell.showItemInFolder(normalize(filePath));
  });

  /**
   * Open a link in the person's own browser.
   *
   * Guarded to http and https on purpose: `shell.openExternal` will happily
   * launch `file:`, `ms-settings:` and anything else the OS has registered, so
   * a handler that forwards whatever it is given is a way to run things.
   */
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false };
      await shell.openExternal(parsed.toString());
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    const error = await shell.openPath(normalize(filePath));
    return error ? { ok: false, error } : { ok: true };
  });

  ipcMain.handle('app:version', () => app.getVersion());

  /**
   * Sharing a clip with a phone on the same network.
   *
   * The clip is named by id and the path comes from the database, so nothing
   * the renderer says can widen what gets served.
   */
  ipcMain.handle('share:start', async (_event, clipId: number) => {
    const { AppDataSource } = await import('../data-source.js');
    const { Clip } = await import('../entity/Clip.js');
    const clip = await AppDataSource.getRepository(Clip).findOneBy({ id: Number(clipId) });
    if (!clip) throw new Error('That clip is not in the library any more');

    return shareService.start(clip.id, normalize(clip.filePath));
  });

  ipcMain.handle('share:stop', () => {
    shareService.stop();
    return null;
  });

  ipcMain.handle('share:current', () => shareService.current());

  /**
   * Copies of the library.
   *
   * One is taken automatically whenever a new version boots, see `backup.ts`
   * for why, and this is the manual button plus the list of what exists.
   */
  ipcMain.handle('backup:list', () => listBackups());
  ipcMain.handle('backup:now', () => takeBackup(databasePath()));
  ipcMain.handle('backup:reveal', () => {
    const newest = listBackups()[0];
    if (newest) shell.showItemInFolder(normalize(newest.path));
    else shell.openPath(backupsDir());
  });

  /**
   * Recolour the native caption buttons when the theme changes.
   *
   * Windows draws minimise/maximise/close itself, so they keep whatever colour
   * they were given, light glyphs stay light on a light page and disappear.
   */
  ipcMain.handle('window:setOverlay', (_event, colors: { symbolColor?: string }) => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    try {
      window.setTitleBarOverlay({
        color: '#00000000',
        symbolColor: colors.symbolColor ?? '#a0a4ac',
        height: TITLEBAR_HEIGHT,
      });
    } catch {
      // Only supported where an overlay exists; nothing to do otherwise.
    }
  });

  ipcMain.handle('window:minimize', () => getWindow()?.minimize());
  ipcMain.handle('window:toggleMaximize', () => {
    const window = getWindow();
    if (!window) return false;
    window.isMaximized() ? window.unmaximize() : window.maximize();
    return window.isMaximized();
  });
  ipcMain.handle('window:close', () => getWindow()?.close());

  // Push the watcher's findings to whatever window happens to be open.
  onServiceEvent((event) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('service:event', event);
  });
}
