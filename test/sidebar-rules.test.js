import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSidebarAnalysis } from '../src/sidebar-rules.js';

function baseSession(overrides = {}) {
  return {
    id: 'thread-1',
    rolloutPath: '/tmp/thread-1.jsonl',
    archived: false,
    archivedAt: null,
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-03-30T10:00:00.000Z',
    cwd: '/tmp/project',
    source: 'vscode',
    declaredProvider: 'aixj_vip',
    cliVersion: '0.1.0',
    firstUserMessage: 'hello world',
    sawSessionMeta: true,
    sawUserEvent: true,
    sessionIndexTitle: 'Recovered thread',
    warnings: [],
    ...overrides
  };
}

test('uses default provider when rollout provider is missing', () => {
  const report = buildSidebarAnalysis({
    rollouts: [baseSession({ declaredProvider: null })],
    stateRows: [],
    defaultProvider: 'aixj_vip',
    filters: { modelProviders: null, sourceKinds: null, archivedMode: 'active' }
  });

  assert.equal(report.totals.visible, 1);
  assert.equal(report.sessions[0].effectiveProvider, 'aixj_vip');
});

test('marks provider mismatch as hidden', () => {
  const report = buildSidebarAnalysis({
    rollouts: [baseSession({ declaredProvider: 'openai' })],
    stateRows: [],
    defaultProvider: 'aixj_vip',
    filters: { modelProviders: null, sourceKinds: null, archivedMode: 'active' }
  });

  assert.equal(report.totals.hidden, 1);
  assert.match(report.sessions[0].reasons[0].code, /provider_mismatch/);
});

test('defaults to interactive sources only', () => {
  const report = buildSidebarAnalysis({
    rollouts: [baseSession({ source: 'exec' })],
    stateRows: [],
    defaultProvider: 'aixj_vip',
    filters: { modelProviders: [], sourceKinds: null, archivedMode: 'active' }
  });

  assert.equal(report.totals.hidden, 1);
  assert.ok(report.sessions[0].reasons.some((reason) => reason.code === 'source_filtered'));
});

test('hides archived sessions in active mode', () => {
  const report = buildSidebarAnalysis({
    rollouts: [baseSession({ archived: true, archivedAt: '2026-03-30T11:00:00.000Z' })],
    stateRows: [],
    defaultProvider: 'aixj_vip',
    filters: { modelProviders: [], sourceKinds: null, archivedMode: 'active' }
  });

  assert.equal(report.totals.hidden, 1);
  assert.ok(report.sessions[0].reasons.some((reason) => reason.code === 'archived_hidden'));
});
