import { loadManifest, restoreBackup } from '../backup.js';
import { confirmAction, renderPlanSummary } from '../reporting.js';

export function createRollbackPlan(options = {}) {
  const loaded = loadManifest(options.manifestOrDir);
  return {
    manifestPath: loaded.manifestPath,
    manifest: loaded.manifest,
    warnings: [],
    summary: {
      backupDir: loaded.manifest.backupDir,
      rolloutFiles: (loaded.manifest.files || []).length,
      hasStateDb: Boolean(loaded.manifest.stateDb),
      operation: loaded.manifest.metadata?.operation || 'unknown'
    }
  };
}

export function applyRollbackPlan(plan) {
  return restoreBackup(plan.manifest);
}

export async function runRollback(options = {}) {
  const plan = createRollbackPlan(options);

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }

  console.log(renderPlanSummary('Rollback plan', plan));
  console.log(`- manifestPath: ${plan.manifestPath}`);

  if (!options.apply) {
    return plan;
  }

  const confirmed = options.yes
    ? true
    : await confirmAction(`Restore backup from ${plan.manifest.backupDir}?`);
  if (!confirmed) {
    console.log('Cancelled.');
    return plan;
  }

  const result = applyRollbackPlan(plan);
  console.log('');
  console.log('Rollback complete');
  console.log(`- restoredRollouts: ${result.restoredRollouts}`);
  console.log(`- restoredStateDb: ${result.restoredStateDb}`);
  return result;
}
