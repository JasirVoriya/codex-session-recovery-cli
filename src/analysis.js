import { ensureCodexContext, loadCodexContext } from './codex-home.js';
import { scanRollouts } from './rollouts.js';
import { listThreads } from './state-db.js';
import { buildSidebarAnalysis } from './sidebar-rules.js';

export async function loadSidebarAnalysis(options = {}) {
  const context = loadCodexContext(options);
  ensureCodexContext(context, { requireStateDb: false });

  const rollouts = await scanRollouts(context, options);
  const stateRows = listThreads(context.stateDbPath);

  return {
    context,
    rollouts,
    stateRows,
    report: buildSidebarAnalysis({
      rollouts,
      stateRows,
      defaultProvider: context.defaultProvider,
      filters: {
        modelProviders: options.modelProviders,
        sourceKinds: options.sourceKinds,
        archivedMode: options.archivedMode
      }
    })
  };
}
