import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMigration,
  applyRepair,
  applyRollback,
  listBackupEntries,
  previewMigration,
  previewRepair,
  previewRollback,
  scanGuiData
} from '../src/gui/service.js';
import {
  createFixture,
  insertThread,
  readSessionMetaProvider,
  readThread,
  writeRollout
} from '../fixtures.js';

test('GUI service scans, migrates, and rolls back sessions', async (t) => {
  const fixture = createFixture({ defaultProvider: 'aixj_vip' });
  t.after(() => fixture.cleanup());

  const rolloutPath = writeRollout({
    codexHome: fixture.codexHome,
    sessionsDir: fixture.sessionsDir,
    archivedSessionsDir: fixture.archivedSessionsDir,
    id: 'thread-gui-migrate',
    provider: 'openai',
    threadName: 'GUI migrate thread'
  });
  insertThread(fixture.stateDbPath, {
    id: 'thread-gui-migrate',
    rolloutPath,
    provider: 'openai',
    title: 'GUI migrate thread'
  });

  const scanBefore = await scanGuiData({ codexHome: fixture.codexHome, archivedMode: 'active' });
  assert.equal(scanBefore.report.totals.hidden, 1);

  const migrationPreview = await previewMigration({
    codexHome: fixture.codexHome,
    fromProvider: 'openai',
    toProvider: 'aixj_vip',
    threadIds: ['thread-gui-migrate'],
    archivedMode: 'all'
  });
  assert.equal(migrationPreview.plan.summary.rolloutSessions, 1);

  const migrationResult = await applyMigration({
    codexHome: fixture.codexHome,
    fromProvider: 'openai',
    toProvider: 'aixj_vip',
    threadIds: ['thread-gui-migrate'],
    archivedMode: 'all'
  });
  assert.equal(readSessionMetaProvider(rolloutPath), 'aixj_vip');
  assert.equal(readThread(fixture.stateDbPath, 'thread-gui-migrate').model_provider, 'aixj_vip');
  assert.equal(migrationResult.refreshed.report.totals.visible, 1);

  const backups = await listBackupEntries({ codexHome: fixture.codexHome });
  assert.equal(backups.items.length, 1);

  const rollbackPreview = await previewRollback({
    manifestOrDir: backups.items[0].manifestPath
  });
  assert.equal(rollbackPreview.plan.summary.operation, 'provider-migration');

  const rollbackResult = await applyRollback({
    codexHome: fixture.codexHome,
    manifestOrDir: backups.items[0].manifestPath
  });
  assert.equal(rollbackResult.result.restoredRollouts, 1);
  assert.equal(readSessionMetaProvider(rolloutPath), 'openai');
});

test('GUI service previews and applies repair-state fixes', async (t) => {
  const fixture = createFixture({ defaultProvider: 'openai' });
  t.after(() => fixture.cleanup());

  const rolloutPath = writeRollout({
    codexHome: fixture.codexHome,
    sessionsDir: fixture.sessionsDir,
    archivedSessionsDir: fixture.archivedSessionsDir,
    id: 'thread-gui-repair',
    provider: 'openai',
    source: 'vscode',
    threadName: 'GUI repair thread'
  });

  insertThread(fixture.stateDbPath, {
    id: 'thread-gui-repair',
    rolloutPath: '/broken/rollout-path.jsonl',
    provider: 'custom',
    source: 'cli',
    title: 'Out of sync title'
  });

  const repairPreview = await previewRepair({
    codexHome: fixture.codexHome,
    threadIds: ['thread-gui-repair'],
    archivedMode: 'all'
  });
  assert.equal(repairPreview.plan.summary.updatesNeeded, 1);

  const repairResult = await applyRepair({
    codexHome: fixture.codexHome,
    threadIds: ['thread-gui-repair'],
    archivedMode: 'all'
  });

  const repaired = readThread(fixture.stateDbPath, 'thread-gui-repair');
  assert.equal(repaired.rollout_path, rolloutPath);
  assert.equal(repaired.model_provider, 'openai');
  assert.equal(repairResult.refreshed.report.sessions[0].advisories.length, 0);
});
