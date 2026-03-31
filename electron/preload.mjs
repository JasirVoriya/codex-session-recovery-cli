import { contextBridge, ipcRenderer } from 'electron';

function invoke(action, payload = {}) {
  return ipcRenderer.invoke('csr:invoke', { action, payload });
}

contextBridge.exposeInMainWorld('codexRecovery', {
  bootstrap: (payload) => invoke('bootstrap', payload),
  scan: (payload) => invoke('scan', payload),
  previewMigration: (payload) => invoke('previewMigration', payload),
  applyMigration: (payload) => invoke('applyMigration', payload),
  previewRepair: (payload) => invoke('previewRepair', payload),
  applyRepair: (payload) => invoke('applyRepair', payload),
  listBackups: (payload) => invoke('listBackups', payload),
  previewRollback: (payload) => invoke('previewRollback', payload),
  applyRollback: (payload) => invoke('applyRollback', payload)
});
