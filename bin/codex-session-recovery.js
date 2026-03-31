#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const mainScript = path.join(projectDir, 'src', 'cli.js');
const commanderPackage = path.join(projectDir, 'node_modules', 'commander', 'package.json');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectDir,
    stdio: 'inherit',
    ...options
  });

  if (typeof result.status === 'number') {
    return result.status;
  }
  if (result.error) {
    throw result.error;
  }
  return 1;
}

function ensureNpm() {
  const result = spawnSync('npm', ['--version'], {
    cwd: projectDir,
    stdio: 'ignore'
  });

  if (result.status !== 0) {
    throw new Error('npm is required for first-run bootstrap');
  }
}

function ensureDependencies() {
  if (fs.existsSync(commanderPackage)) {
    return;
  }

  ensureNpm();
  console.error('[codex-session-recovery] Installing Node dependencies...');
  const status = run('npm', ['install', '--no-fund', '--no-audit']);
  if (status !== 0) {
    process.exit(status);
  }
}

function main() {
  ensureDependencies();
  const status = run(process.execPath, [mainScript, ...process.argv.slice(2)]);
  process.exit(status);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
