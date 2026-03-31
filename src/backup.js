import fs from 'node:fs';
import path from 'node:path';

function timestampFragment(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function createBackup({ codexHome, backupsDir, stateDbPath, rolloutPaths, label, metadata = {} }) {
  const backupDir = path.join(backupsDir, `${label}-${timestampFragment()}`);
  const filesDir = path.join(backupDir, 'files');
  ensureDir(filesDir);

  const files = [];
  for (const rolloutPath of [...new Set(rolloutPaths)]) {
    const relativePath = path.relative(codexHome, rolloutPath);
    const destination = path.join(filesDir, relativePath);
    ensureDir(path.dirname(destination));
    fs.copyFileSync(rolloutPath, destination);
    files.push({
      type: 'rollout',
      source: rolloutPath,
      backup: destination,
      relativePath
    });
  }

  let stateDb = null;
  if (stateDbPath && fs.existsSync(stateDbPath)) {
    const destination = path.join(backupDir, 'state', path.basename(stateDbPath));
    ensureDir(path.dirname(destination));
    fs.copyFileSync(stateDbPath, destination);
    stateDb = {
      source: stateDbPath,
      backup: destination
    };
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    codexHome,
    backupDir,
    files,
    stateDb,
    metadata
  };

  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...manifest, manifestPath };
}

export function loadManifest(manifestOrDir) {
  const manifestPath = manifestOrDir.endsWith('.json')
    ? manifestOrDir
    : path.join(manifestOrDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Backup manifest not found: ${manifestPath}`);
  }

  return {
    manifestPath,
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  };
}

export function restoreBackup(manifest) {
  for (const file of manifest.files || []) {
    ensureDir(path.dirname(file.source));
    fs.copyFileSync(file.backup, file.source);
  }

  if (manifest.stateDb?.source && manifest.stateDb?.backup) {
    ensureDir(path.dirname(manifest.stateDb.source));
    fs.copyFileSync(manifest.stateDb.backup, manifest.stateDb.source);
  }

  return {
    restoredRollouts: (manifest.files || []).length,
    restoredStateDb: Boolean(manifest.stateDb)
  };
}

export function summarizeManifest(manifestPath, manifest) {
  return {
    manifestPath,
    backupDir: manifest.backupDir,
    createdAt: manifest.createdAt,
    operation: manifest.metadata?.operation || 'unknown',
    fromProvider: manifest.metadata?.fromProvider || null,
    toProvider: manifest.metadata?.toProvider || null,
    threadIds: manifest.metadata?.threadIds || [],
    rolloutFiles: (manifest.files || []).length,
    hasStateDb: Boolean(manifest.stateDb)
  };
}

export function listBackups(backupsDir) {
  if (!backupsDir || !fs.existsSync(backupsDir)) {
    return [];
  }

  const summaries = [];
  for (const entry of fs.readdirSync(backupsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(backupsDir, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      summaries.push(summarizeManifest(manifestPath, manifest));
    } catch {
      // Ignore malformed backups so one broken manifest does not hide the rest.
    }
  }

  return summaries.sort((left, right) => {
    const leftValue = Date.parse(left.createdAt || '') || 0;
    const rightValue = Date.parse(right.createdAt || '') || 0;
    return rightValue - leftValue || right.manifestPath.localeCompare(left.manifestPath);
  });
}
