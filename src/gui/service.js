import { loadSidebarAnalysis } from '../analysis.js';
import { listBackups } from '../backup.js';
import { loadCodexContext } from '../codex-home.js';
import { applyMigrationPlan, createMigrationPlan } from '../commands/migrate.js';
import { applyRepairPlan, createRepairPlan } from '../commands/repair-state.js';
import { applyRollbackPlan, createRollbackPlan } from '../commands/rollback.js';

function buildContextSummary(context) {
  return {
    codexHome: context.codexHome,
    sessionsDir: context.sessionsDir,
    archivedSessionsDir: context.archivedSessionsDir,
    stateDbPath: context.stateDbPath,
    backupsDir: context.backupsDir,
    defaultProvider: context.defaultProvider,
    authMode: context.auth?.auth_mode || null
  };
}

export async function scanGuiData(options = {}) {
  const data = await loadSidebarAnalysis(options);
  return {
    context: buildContextSummary(data.context),
    report: data.report
  };
}

export async function previewMigration(options = {}) {
  const plan = await createMigrationPlan(options);
  return {
    context: buildContextSummary(plan.context),
    plan
  };
}

export async function applyMigration(options = {}) {
  const preview = await previewMigration(options);
  const result = applyMigrationPlan(preview.plan);
  return {
    ...preview,
    result,
    refreshed: await scanGuiData({ codexHome: options.codexHome, archivedMode: 'active' })
  };
}

export async function previewRepair(options = {}) {
  const plan = await createRepairPlan(options);
  return {
    context: buildContextSummary(plan.context),
    plan
  };
}

export async function applyRepair(options = {}) {
  const preview = await previewRepair(options);
  const result = applyRepairPlan(preview.plan);
  return {
    ...preview,
    result,
    refreshed: await scanGuiData({ codexHome: options.codexHome, archivedMode: 'active' })
  };
}

export async function listBackupEntries(options = {}) {
  const context = loadCodexContext(options);
  return {
    context: buildContextSummary(context),
    items: listBackups(context.backupsDir)
  };
}

export async function previewRollback(options = {}) {
  return {
    plan: createRollbackPlan(options)
  };
}

export async function applyRollback(options = {}) {
  const preview = await previewRollback(options);
  const result = applyRollbackPlan(preview.plan);
  return {
    ...preview,
    result,
    refreshed: await scanGuiData({ codexHome: options.codexHome, archivedMode: 'active' })
  };
}

export async function loadBootstrap(options = {}) {
  const [scan, backups] = await Promise.all([scanGuiData(options), listBackupEntries(options)]);
  return { scan, backups };
}
