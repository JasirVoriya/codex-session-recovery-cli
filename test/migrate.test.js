import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { applyMigrationPlan, createMigrationPlan } from '../src/commands/migrate.js';
import { applyRepairPlan, createRepairPlan } from '../src/commands/repair-state.js';
import {
  createFixture,
  insertThread,
  readSessionMetaProvider,
  readThread,
  writeRollout
} from '../fixtures.js';

test('migrate previews and applies rollout + sqlite provider changes', async (t) => {
  const fixture = createFixture({ defaultProvider: 'aixj_vip' });
  t.after(() => fixture.cleanup());

  const rolloutPath = writeRollout({
    codexHome: fixture.codexHome,
    sessionsDir: fixture.sessionsDir,
    archivedSessionsDir: fixture.archivedSessionsDir,
    id: 'thread-openai',
    provider: 'openai',
    threadName: 'OpenAI thread'
  });
  insertThread(fixture.stateDbPath, {
    id: 'thread-openai',
    rolloutPath,
    provider: 'openai',
    title: 'OpenAI thread'
  });

  const plan = await createMigrationPlan({
    codexHome: fixture.codexHome,
    fromProvider: 'openai',
    toProvider: 'aixj_vip',
    archivedMode: 'all'
  });

  assert.equal(plan.summary.rolloutSessions, 1);
  assert.equal(readSessionMetaProvider(rolloutPath), 'openai');
  assert.equal(readThread(fixture.stateDbPath, 'thread-openai').model_provider, 'openai');

  const result = applyMigrationPlan(plan);
  assert.ok(fs.existsSync(result.manifestPath));
  assert.equal(readSessionMetaProvider(rolloutPath), 'aixj_vip');
  assert.equal(readThread(fixture.stateDbPath, 'thread-openai').model_provider, 'aixj_vip');
});

test('repair-state rebuilds stale sqlite metadata from rollout', async (t) => {
  const fixture = createFixture({ defaultProvider: 'aixj_vip' });
  t.after(() => fixture.cleanup());

  const rolloutPath = writeRollout({
    codexHome: fixture.codexHome,
    sessionsDir: fixture.sessionsDir,
    archivedSessionsDir: fixture.archivedSessionsDir,
    id: 'thread-repair',
    provider: 'aixj_vip',
    source: 'vscode',
    threadName: 'Repair me'
  });
  insertThread(fixture.stateDbPath, {
    id: 'thread-repair',
    rolloutPath: '/wrong/path.jsonl',
    provider: 'openai',
    title: 'Old title'
  });

  const plan = await createRepairPlan({
    codexHome: fixture.codexHome,
    archivedMode: 'all'
  });
  assert.equal(plan.summary.updatesNeeded, 1);

  const result = applyRepairPlan(plan);
  assert.ok(fs.existsSync(result.manifestPath));
  const repaired = readThread(fixture.stateDbPath, 'thread-repair');
  assert.equal(repaired.model_provider, 'aixj_vip');
  assert.equal(repaired.rollout_path, rolloutPath);
  assert.equal(repaired.title, 'Repair me');
});

test('repair-state serializes object source values before writing sqlite', async (t) => {
  const fixture = createFixture({ defaultProvider: 'openai' });
  t.after(() => fixture.cleanup());

  const rolloutPath = writeRollout({
    codexHome: fixture.codexHome,
    sessionsDir: fixture.sessionsDir,
    archivedSessionsDir: fixture.archivedSessionsDir,
    id: 'thread-object-source',
    provider: 'openai',
    source: { subagent: { thread_spawn: { parent_thread_id: 'parent-thread' } } },
    threadName: 'Object source thread'
  });
  insertThread(fixture.stateDbPath, {
    id: 'thread-object-source',
    rolloutPath,
    provider: 'aixj_vip',
    title: 'Old title'
  });

  const plan = await createRepairPlan({
    codexHome: fixture.codexHome,
    archivedMode: 'all'
  });
  assert.equal(plan.summary.updatesNeeded, 1);

  applyRepairPlan(plan);
  const repaired = readThread(fixture.stateDbPath, 'thread-object-source');
  assert.equal(repaired.model_provider, 'openai');
  assert.equal(
    repaired.source,
    JSON.stringify({ subagent: { thread_spawn: { parent_thread_id: 'parent-thread' } } })
  );
});
