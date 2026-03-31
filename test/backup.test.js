import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createBackup, listBackups } from '../src/backup.js';
import { createFixture, writeRollout } from '../fixtures.js';

test('listBackups returns manifest summaries in reverse chronological order', async (t) => {
  const fixture = createFixture({ defaultProvider: 'openai' });
  t.after(() => fixture.cleanup());

  const firstRollout = writeRollout({
    codexHome: fixture.codexHome,
    sessionsDir: fixture.sessionsDir,
    archivedSessionsDir: fixture.archivedSessionsDir,
    id: 'thread-one',
    provider: 'openai'
  });

  const first = createBackup({
    codexHome: fixture.codexHome,
    backupsDir: path.join(fixture.codexHome, 'migration-backups'),
    stateDbPath: fixture.stateDbPath,
    rolloutPaths: [firstRollout],
    label: 'provider-openai-to-custom',
    metadata: {
      operation: 'provider-migration',
      fromProvider: 'openai',
      toProvider: 'custom',
      threadIds: ['thread-one']
    }
  });

  const second = createBackup({
    codexHome: fixture.codexHome,
    backupsDir: path.join(fixture.codexHome, 'migration-backups'),
    stateDbPath: fixture.stateDbPath,
    rolloutPaths: [firstRollout],
    label: 'repair-state',
    metadata: {
      operation: 'repair-state',
      threadIds: ['thread-one']
    }
  });

  const firstManifest = JSON.parse(fs.readFileSync(first.manifestPath, 'utf8'));
  firstManifest.createdAt = '2026-03-31T10:00:00.000Z';
  fs.writeFileSync(first.manifestPath, `${JSON.stringify(firstManifest, null, 2)}\n`);

  const secondManifest = JSON.parse(fs.readFileSync(second.manifestPath, 'utf8'));
  secondManifest.createdAt = '2026-03-31T11:00:00.000Z';
  fs.writeFileSync(second.manifestPath, `${JSON.stringify(secondManifest, null, 2)}\n`);

  const backups = listBackups(path.join(fixture.codexHome, 'migration-backups'));
  assert.equal(backups.length, 2);
  assert.equal(backups[0].operation, 'repair-state');
  assert.equal(backups[1].operation, 'provider-migration');
  assert.equal(backups[1].fromProvider, 'openai');
  assert.equal(backups[1].toProvider, 'custom');
});
