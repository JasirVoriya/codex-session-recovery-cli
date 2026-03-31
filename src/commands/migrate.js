import { loadSidebarAnalysis } from '../analysis.js';
import { createBackup } from '../backup.js';
import { renderChangeList, renderPlanSummary, confirmAction } from '../reporting.js';
import { rewriteRolloutProvider } from '../rollouts.js';
import { applyProviderMigration } from '../state-db.js';

function matchesArchivedMode(session, archivedMode) {
  if (archivedMode === 'all') {
    return true;
  }
  if (archivedMode === 'archived') {
    return Boolean(session.archived);
  }
  return !session.archived;
}

function matchesThreadIds(session, threadIds) {
  if (!threadIds || threadIds.length === 0) {
    return true;
  }
  return threadIds.includes(session.id);
}

export async function createMigrationPlan(options = {}) {
  const data = await loadSidebarAnalysis({
    codexHome: options.codexHome,
    archivedMode: 'all'
  });

  const stateRowsById = new Map(data.stateRows.map((row) => [row.id, row]));
  const requestedIds = new Set(options.threadIds || []);
  const targetSessions = data.rollouts.filter((session) => {
    if (!session.id || !session.declaredProvider) {
      return false;
    }
    return (
      session.declaredProvider === options.fromProvider &&
      matchesArchivedMode(session, options.archivedMode || 'all') &&
      matchesThreadIds(session, options.threadIds)
    );
  });

  const matchedIds = new Set(targetSessions.map((session) => session.id));
  const missingRequestedThreads = [...requestedIds].filter((threadId) => !matchedIds.has(threadId));
  const stateRowsTouched = targetSessions.filter((session) => stateRowsById.has(session.id)).length;
  const stateRowsMissing = targetSessions.length - stateRowsTouched;
  const rolloutFilesToRewrite = targetSessions.reduce(
    (count, session) => count + (session.rolloutFiles?.length || 1),
    0
  );

  return {
    ...data,
    fromProvider: options.fromProvider,
    toProvider: options.toProvider,
    targetSessions,
    warnings: [
      ...(targetSessions.length === 0 ? ['No rollout sessions matched the provider filter.'] : []),
      ...(stateRowsMissing > 0 ? [`${stateRowsMissing} sessions are missing from state DB and will be upserted.`] : []),
      ...(missingRequestedThreads.length > 0
        ? [`Requested thread ids not found: ${missingRequestedThreads.join(', ')}`]
        : [])
    ],
    summary: {
      rolloutSessions: targetSessions.length,
      rolloutFilesToRewrite,
      stateRowsTouched,
      stateRowsMissing,
      archivedMode: options.archivedMode || 'all'
    }
  };
}

export function applyMigrationPlan(plan) {
  const manifest = createBackup({
    codexHome: plan.context.codexHome,
    backupsDir: plan.context.backupsDir,
    stateDbPath: plan.context.stateDbPath,
    rolloutPaths: plan.targetSessions.flatMap((session) => session.rolloutFiles || [session.rolloutPath]),
    label: `provider-${plan.fromProvider}-to-${plan.toProvider}`,
    metadata: {
      operation: 'provider-migration',
      fromProvider: plan.fromProvider,
      toProvider: plan.toProvider,
      threadIds: plan.targetSessions.map((session) => session.id)
    }
  });

  for (const session of plan.targetSessions) {
    for (const rolloutFile of session.rolloutFiles || [session.rolloutPath]) {
      rewriteRolloutProvider(rolloutFile, plan.toProvider);
    }
    session.declaredProvider = plan.toProvider;
  }

  const changedRows = applyProviderMigration(plan.context.stateDbPath, plan.targetSessions, {
    defaultProvider: plan.context.defaultProvider
  });

  return {
    manifestPath: manifest.manifestPath,
    backupDir: manifest.backupDir,
    changedRows,
    rewrittenRollouts: plan.summary.rolloutFilesToRewrite
  };
}

export async function runMigrate(options = {}) {
  const plan = await createMigrationPlan(options);

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }

  console.log(renderPlanSummary('Provider migration plan', plan));
  console.log(
    renderChangeList(
      plan.targetSessions,
      (session) =>
        `${session.id} files=${session.rolloutFiles?.length || 1} ${plan.fromProvider} -> ${plan.toProvider}`
    )
  );

  if (!options.apply || plan.targetSessions.length === 0) {
    return plan;
  }

  const confirmed = options.yes
    ? true
    : await confirmAction(
        `Apply provider migration for ${plan.targetSessions.length} sessions and rewrite state DB?`
      );
  if (!confirmed) {
    console.log('Cancelled.');
    return plan;
  }

  const result = applyMigrationPlan(plan);
  console.log('');
  console.log('Migration complete');
  console.log(`- backupDir: ${result.backupDir}`);
  console.log(`- manifest: ${result.manifestPath}`);
  console.log(`- rewrittenRollouts: ${result.rewrittenRollouts}`);
  console.log(`- changedRows: ${result.changedRows}`);
  return result;
}
