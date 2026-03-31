import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFixture } from '../fixtures.js';
import { parseRolloutFile } from '../src/rollouts.js';

test('parseRolloutFile keeps the first session_meta when later lines include another session_meta', async (t) => {
  const fixture = createFixture({ defaultProvider: 'aixj_vip' });
  t.after(() => fixture.cleanup());

  const rolloutPath = path.join(
    fixture.sessionsDir,
    '2026',
    '03',
    '30',
    'rollout-2026-03-30T17-53-36-019d3e29-be2d-7751-a2b0-085dd8b85d34.jsonl'
  );
  fs.mkdirSync(path.dirname(rolloutPath), { recursive: true });
  fs.writeFileSync(
    rolloutPath,
    [
      JSON.stringify({
        timestamp: '2026-03-30T09:53:37.643Z',
        type: 'session_meta',
        payload: {
          id: 'child-thread',
          timestamp: '2026-03-30T09:53:36.306Z',
          cwd: '/tmp/child',
          source: { subagent: { thread_spawn: { parent_thread_id: 'parent-thread' } } },
          model_provider: 'aixj_vip',
          cli_version: '0.118.0-alpha.2'
        }
      }),
      JSON.stringify({
        timestamp: '2026-03-30T09:53:37.646Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'worker task' }]
        }
      }),
      JSON.stringify({
        timestamp: '2026-03-30T09:53:37.700Z',
        type: 'session_meta',
        payload: {
          id: 'parent-thread',
          timestamp: '2026-03-30T06:43:20.031Z',
          cwd: '/tmp/parent',
          source: 'vscode',
          model_provider: 'openai',
          cli_version: '0.118.0-alpha.2'
        }
      })
    ].join('\n') + '\n'
  );

  const summary = await parseRolloutFile(rolloutPath);
  assert.equal(summary.id, 'child-thread');
  assert.equal(summary.declaredProvider, 'aixj_vip');
  assert.equal(typeof summary.source, 'object');
});
