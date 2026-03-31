import {
  applyMigration,
  applyRepair,
  applyRollback,
  listBackupEntries,
  loadBootstrap,
  previewMigration,
  previewRepair,
  previewRollback,
  scanGuiData
} from './service.js';

const actions = {
  bootstrap: loadBootstrap,
  scan: scanGuiData,
  previewMigration,
  applyMigration,
  previewRepair,
  applyRepair,
  listBackups: listBackupEntries,
  previewRollback,
  applyRollback
};

async function main() {
  const raw = process.argv[2];
  const request = raw ? JSON.parse(raw) : {};
  const action = request.action;

  if (!action || !actions[action]) {
    throw new Error(`Unsupported bridge action: ${action || 'undefined'}`);
  }

  const data = await actions[action](request.payload || {});
  process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
}

main().catch((error) => {
  const payload = {
    ok: false,
    error: {
      message: error.message,
      stack: error.stack || null
    }
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = 1;
});
