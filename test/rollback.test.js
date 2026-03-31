import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMigrationPlan, createMigrationPlan } from '../src/commands/migrate.js';
import { applyRollbackPlan, createRollbackPlan } from '../src/commands/rollback.js';
import {
  createFixture,
  insertThread,
  readSessionMetaProvider,
  readThread,
  writeRollout
} from '../fixtures.js';

test('rollback restores rollout files and sqlite snapshot from manifest', async (t) => {
  const fixture = createFixture({ defaultProvider: 'aixj_vip' });
  t.after(() => fixture.cleanup());

  const rolloutPath = writeRollout({
    codexHome: fixture.codexHome,
    sessionsDir: fixture.sessionsDir,
    archivedSessionsDir: fixture.archivedSessionsDir,
    id: 'thread-rollback',
    provider: 'openai',
    threadName: 'Rollback thread'
  });
  insertThread(fixture.stateDbPath, {
    id: 'thread-rollback',
    rolloutPath,
    provider: 'openai',
    title: 'Rollback thread'
  });

  const migrationPlan = await createMigrationPlan({
    codexHome: fixture.codexHome,
    fromProvider: 'openai',
    toProvider: 'aixj_vip',
    archivedMode: 'all'
  });
  const migrationResult = applyMigrationPlan(migrationPlan);

  assert.equal(readSessionMetaProvider(rolloutPath), 'aixj_vip');
  assert.equal(readThread(fixture.stateDbPath, 'thread-rollback').model_provider, 'aixj_vip');

  const rollbackPlan = createRollbackPlan({ manifestOrDir: migrationResult.manifestPath });
  const rollbackResult = applyRollbackPlan(rollbackPlan);

  assert.equal(rollbackResult.restoredRollouts, 1);
  assert.equal(readSessionMetaProvider(rolloutPath), 'openai');
  assert.equal(readThread(fixture.stateDbPath, 'thread-rollback').model_provider, 'openai');
});
