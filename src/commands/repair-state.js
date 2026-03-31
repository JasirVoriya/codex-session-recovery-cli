import { loadSidebarAnalysis } from '../analysis.js';
import { createBackup } from '../backup.js';
import { renderChangeList, renderPlanSummary, confirmAction } from '../reporting.js';
import { buildDesiredThreadRecord, diffTrackedFields, upsertSessions } from '../state-db.js';

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

export async function createRepairPlan(options = {}) {
  const data = await loadSidebarAnalysis({
    codexHome: options.codexHome,
    archivedMode: 'all'
  });

  const stateById = new Map(data.stateRows.map((row) => [row.id, row]));
  const rolloutIds = new Set(data.rollouts.filter((session) => session.id).map((session) => session.id));
  const updates = [];

  for (const session of data.rollouts) {
    if (!session.id || !matchesArchivedMode(session, options.archivedMode || 'all')) {
      continue;
    }
    if (!matchesThreadIds(session, options.threadIds)) {
      continue;
    }

    const existingRow = stateById.get(session.id) || null;
    const desired = buildDesiredThreadRecord(session, data.context.defaultProvider, existingRow);
    const changes = diffTrackedFields(existingRow, desired);
    if (Object.keys(changes).length > 0) {
      updates.push({ session, existingRow, desired, changes });
    }
  }

  const orphanStateRows = data.stateRows.filter((row) => !rolloutIds.has(row.id));
  return {
    ...data,
    updates,
    orphanStateRows,
    warnings: [
      ...(updates.length === 0 ? ['State DB is already in sync for the selected rollout set.'] : []),
      ...(orphanStateRows.length > 0
        ? [`${orphanStateRows.length} state-only rows remain untouched because rollout files are missing.`]
        : [])
    ],
    summary: {
      rolloutSessions: data.rollouts.length,
      updatesNeeded: updates.length,
      orphanStateRows: orphanStateRows.length,
      archivedMode: options.archivedMode || 'all'
    }
  };
}

export function applyRepairPlan(plan) {
  const manifest = createBackup({
    codexHome: plan.context.codexHome,
    backupsDir: plan.context.backupsDir,
    stateDbPath: plan.context.stateDbPath,
    rolloutPaths: [],
    label: 'repair-state',
    metadata: {
      operation: 'repair-state',
      threadIds: plan.updates.map((entry) => entry.session.id)
    }
  });

  const changedRows = upsertSessions(
    plan.context.stateDbPath,
    plan.updates.map((entry) => entry.session),
    {
      defaultProvider: plan.context.defaultProvider,
      existingRows: new Map(plan.stateRows.map((row) => [row.id, row]))
    }
  );

  return {
    manifestPath: manifest.manifestPath,
    backupDir: manifest.backupDir,
    changedRows
  };
}

export async function runRepairState(options = {}) {
  const plan = await createRepairPlan(options);

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }

  console.log(renderPlanSummary('State DB repair plan', plan));
  console.log(
    renderChangeList(plan.updates, (entry) => {
      const keys = Object.keys(entry.changes).join(', ');
      return `${entry.session.id} fix [${keys}]`;
    })
  );

  if (!options.apply || plan.updates.length === 0) {
    return plan;
  }

  const confirmed = options.yes
    ? true
    : await confirmAction(`Repair ${plan.updates.length} state DB rows from rollout metadata?`);
  if (!confirmed) {
    console.log('Cancelled.');
    return plan;
  }

  const result = applyRepairPlan(plan);
  console.log('');
  console.log('State repair complete');
  console.log(`- backupDir: ${result.backupDir}`);
  console.log(`- manifest: ${result.manifestPath}`);
  console.log(`- changedRows: ${result.changedRows}`);
  return result;
}
