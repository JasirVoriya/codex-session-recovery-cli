import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadCodexContext } from '../src/codex-home.js';

function createTempCodexHome({ configToml = '', authMode }) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-test-'));
  const codexHome = path.join(rootDir, '.codex');
  fs.mkdirSync(path.join(codexHome, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), configToml);
  fs.writeFileSync(path.join(codexHome, 'auth.json'), JSON.stringify({ auth_mode: authMode }) + '\n');

  return {
    codexHome,
    cleanup() {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  };
}

test('loadCodexContext infers openai provider from chatgpt auth mode when config is missing provider', () => {
  const fixture = createTempCodexHome({ authMode: 'chatgpt' });

  try {
    const context = loadCodexContext({ codexHome: fixture.codexHome });
    assert.equal(context.defaultProvider, 'openai');
  } finally {
    fixture.cleanup();
  }
});

test('loadCodexContext infers custom provider from apikey auth mode when config is missing provider', () => {
  const fixture = createTempCodexHome({ authMode: 'apikey' });

  try {
    const context = loadCodexContext({ codexHome: fixture.codexHome });
    assert.equal(context.defaultProvider, 'custom');
  } finally {
    fixture.cleanup();
  }
});
