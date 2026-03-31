import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { execFile, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const electronDir = path.dirname(currentFile);
const rootDir = path.resolve(electronDir, '..');
const preloadPath = path.join(electronDir, 'preload.mjs');
const indexHtmlPath = path.join(rootDir, 'renderer', 'index.html');
const bridgePath = path.join(rootDir, 'src', 'gui', 'bridge.js');

function detectNodeBinary() {
  const candidates = [
    process.env.CSR_NODE_BIN,
    process.env.npm_node_execpath,
    process.env.NODE
  ].filter(Boolean);

  if (candidates.length > 0) {
    return candidates[0];
  }

  const locator = process.platform === 'win32' ? 'where' : 'which';
  const lookup = spawnSync(locator, ['node'], { encoding: 'utf8' });
  if (lookup.status === 0) {
    const firstLine = lookup.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (firstLine) {
      return firstLine;
    }
  }

  return null;
}

function runBridge(action, payload = {}) {
  const nodeBinary = detectNodeBinary();
  if (!nodeBinary) {
    throw new Error(
      'Node.js runtime not found. Launch with `npm run gui` or set CSR_NODE_BIN.'
    );
  }

  const request = JSON.stringify({ action, payload });
  return new Promise((resolve, reject) => {
    execFile(
      nodeBinary,
      [bridgePath, request],
      {
        cwd: rootDir,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        let parsed = null;
        try {
          parsed = JSON.parse((stdout || '').trim() || '{}');
        } catch {
          parsed = null;
        }

        if (parsed?.ok) {
          resolve(parsed.data);
          return;
        }

        const message =
          parsed?.error?.message || stderr?.trim() || error?.message || 'Unknown bridge error';
        reject(new Error(message));
      }
    );
  });
}

async function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    title: 'Codex Session Recovery',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await mainWindow.loadFile(indexHtmlPath);
}

ipcMain.handle('csr:invoke', async (_event, request) => {
  return runBridge(request.action, request.payload || {});
});

app.whenReady().then(async () => {
  try {
    await createMainWindow();
  } catch (error) {
    dialog.showErrorBox('Codex Session Recovery', error.message);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
