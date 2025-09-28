import { app, BrowserWindow, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import 'reflect-metadata';
import { AppDataSource, VIDEOS_ROOT as SERVER_VIDEOS_ROOT } from './datasource';
import { registerClipIpc } from './modules/ipc-clips';
import { registerCustomProtocols } from './modules/protocols';

// Register custom schemes before app ready so they work in the renderer
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } as any },
  { scheme: 'thumb', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } as any },
]);

function getClientIndexHtmlPath() {
  return path.join(__dirname, '../../client/dist/index.html');
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.js'),
      devTools: true,
    },
  });

  win.setMenu(null);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    const index = getClientIndexHtmlPath();
    if (!fs.existsSync(index)) {
      await win.loadURL('data:text/html,Build the client first.');
    } else {
      await win.loadFile(index);
    }
  }
}

app.setAppUserModelId('com.filmpje.app');

app.whenReady().then(async () => {
  process.env.VIDEOS_ROOT ||= SERVER_VIDEOS_ROOT;

  await AppDataSource.initialize();

  registerCustomProtocols();
  registerClipIpc();

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


