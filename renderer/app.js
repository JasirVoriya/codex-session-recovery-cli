const refs = {
  scanForm: document.querySelector('#scan-form'),
  codexHome: document.querySelector('#codex-home'),
  archivedMode: document.querySelector('#archived-mode'),
  providerFilter: document.querySelector('#provider-filter'),
  sourceFilter: document.querySelector('#source-filter'),
  sessionFilter: document.querySelector('#session-filter'),
  sessionSearch: document.querySelector('#session-search'),
  sessionList: document.querySelector('#session-list'),
  sessionSubtitle: document.querySelector('#session-subtitle'),
  sessionDetail: document.querySelector('#session-detail'),
  detailSubtitle: document.querySelector('#detail-subtitle'),
  summaryProvider: document.querySelector('#summary-provider'),
  summaryVisible: document.querySelector('#summary-visible'),
  summaryHidden: document.querySelector('#summary-hidden'),
  summaryStateOnly: document.querySelector('#summary-state-only'),
  previewMigrate: document.querySelector('#preview-migrate'),
  applyMigrate: document.querySelector('#apply-migrate'),
  previewRepair: document.querySelector('#preview-repair'),
  applyRepair: document.querySelector('#apply-repair'),
  operationPreview: document.querySelector('#operation-preview'),
  refreshBackups: document.querySelector('#refresh-backups'),
  backupList: document.querySelector('#backup-list'),
  backupDetail: document.querySelector('#backup-detail'),
  previewRollback: document.querySelector('#preview-rollback'),
  applyRollback: document.querySelector('#apply-rollback'),
  statusBanner: document.querySelector('#status-banner')
};

const state = {
  scan: null,
  backups: null,
  sessionFilter: 'all',
  selectedSessionId: null,
  selectedBackupPath: null,
  sessionSearch: '',
  lastMigrationRequest: null,
  lastMigrationPreview: null,
  lastRepairRequest: null,
  lastRepairPreview: null,
  lastRollbackPreview: null,
  busy: false
};

function parseCsv(value) {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatCount(value) {
  return typeof value === 'number' ? value.toLocaleString() : '0';
}

function setBusy(nextBusy, message, isError = false) {
  state.busy = nextBusy;
  refs.scanForm
    .querySelectorAll('button, input, select')
    .forEach((element) => {
      element.disabled = nextBusy;
    });
  refs.previewRepair.disabled = nextBusy;
  refs.refreshBackups.disabled = nextBusy;
  refs.sessionFilter.disabled = nextBusy;
  refs.sessionSearch.disabled = nextBusy;
  refs.statusBanner.className = isError ? 'status-error' : nextBusy ? '' : 'status-ok';
  refs.statusBanner.textContent = message;
  syncActionButtons();
}

function currentScanRequest() {
  return {
    codexHome: refs.codexHome.value.trim() || undefined,
    archivedMode: refs.archivedMode.value,
    modelProviders: parseCsv(refs.providerFilter.value),
    sourceKinds: parseCsv(refs.sourceFilter.value)
  };
}

function getCurrentSessions() {
  const sessions = state.scan?.report?.sessions || [];
  const filterMode = state.sessionFilter;
  const search = state.sessionSearch.trim().toLowerCase();

  return sessions.filter((session) => {
    if (filterMode === 'visible' && !session.visible) {
      return false;
    }
    if (filterMode === 'hidden' && session.visible) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      session.title,
      session.id,
      session.effectiveProvider,
      session.source,
      ...(session.reasons || []).map((reason) => reason.code)
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });
}

function selectedSession() {
  const sessions = state.scan?.report?.sessions || [];
  return sessions.find((session) => session.id === state.selectedSessionId) || null;
}

function selectedBackup() {
  const items = state.backups?.items || [];
  return items.find((item) => item.manifestPath === state.selectedBackupPath) || null;
}

function syncSummary() {
  const report = state.scan?.report;
  refs.summaryProvider.textContent = state.scan?.context?.defaultProvider || '—';
  refs.summaryVisible.textContent = formatCount(report?.totals?.visible);
  refs.summaryHidden.textContent = formatCount(report?.totals?.hidden);
  refs.summaryStateOnly.textContent = formatCount(report?.totals?.stateOnly);

  if (report) {
    refs.sessionSubtitle.textContent =
      `${formatCount(report.totals.scanned)} scanned • ` +
      `${formatCount(report.reasonGroups.length)} reason groups`;
  } else {
    refs.sessionSubtitle.textContent = 'Browse visible and hidden sessions.';
  }
}

function renderSessionList() {
  const sessions = getCurrentSessions();
  refs.sessionList.innerHTML = '';

  if (sessions.length === 0) {
    refs.sessionList.innerHTML =
      '<div class="detail-card empty-state">No sessions match the current filters.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const session of sessions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `session-item${session.id === state.selectedSessionId ? ' selected' : ''}`;
    button.innerHTML = `
      <div class="item-topline">
        <span class="session-title">${escapeHtml(session.title || session.id)}</span>
        <span class="pill ${session.visible ? 'visible' : 'hidden'}">
          ${session.visible ? 'visible' : 'hidden'}
        </span>
      </div>
      <div class="item-subline">
        <span>${escapeHtml(session.id)}</span>
      </div>
      <div class="tag-row">
        <span class="badge">${escapeHtml(session.effectiveProvider || 'unknown')}</span>
        <span class="badge">${escapeHtml(session.source || 'unknown')}</span>
        <span class="badge">${session.archived ? 'archived' : 'active'}</span>
      </div>
      <div class="item-subline">
        ${
          session.visible
            ? 'No blocking reasons'
            : escapeHtml((session.reasons || []).map((reason) => reason.code).join(', '))
        }
      </div>
    `;
    button.addEventListener('click', () => {
      state.selectedSessionId = session.id;
      renderAll();
    });
    fragment.appendChild(button);
  }

  refs.sessionList.appendChild(fragment);
}

function renderSessionDetail() {
  const session = selectedSession();
  refs.detailSubtitle.textContent = session
    ? `Inspecting ${session.id}`
    : 'Select a session to inspect recovery clues.';

  if (!session) {
    refs.sessionDetail.className = 'detail-card empty-state';
    refs.sessionDetail.textContent = 'Select a session to inspect rollout and state details.';
    return;
  }

  refs.sessionDetail.className = 'detail-card';
  refs.sessionDetail.innerHTML = `
    <div class="detail-grid">
      <div>
        <h3>${escapeHtml(session.title || session.id)}</h3>
        <div class="tag-row">
          <span class="pill ${session.visible ? 'visible' : 'hidden'}">
            ${session.visible ? 'visible' : 'hidden'}
          </span>
          <span class="badge">${escapeHtml(session.effectiveProvider || 'unknown')}</span>
          <span class="badge">${escapeHtml(session.source || 'unknown')}</span>
          <span class="badge">${session.archived ? 'archived' : 'active'}</span>
        </div>
      </div>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">Thread ID</div>
          <div class="meta-value"><code>${escapeHtml(session.id)}</code></div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Default provider</div>
          <div class="meta-value">${escapeHtml(
            state.scan?.context?.defaultProvider || 'unknown'
          )}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Declared provider</div>
          <div class="meta-value">${escapeHtml(session.declaredProvider || '—')}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Updated at</div>
          <div class="meta-value">${escapeHtml(formatDate(session.updatedAt))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Rollout path</div>
          <div class="meta-value"><code>${escapeHtml(session.rolloutPath || '—')}</code></div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Working directory</div>
          <div class="meta-value"><code>${escapeHtml(session.cwd || '—')}</code></div>
        </div>
      </div>
      <div>
        <div class="meta-label">Blocking reasons</div>
        <div class="reason-list">
          ${
            session.reasons?.length
              ? session.reasons
                  .map(
                    (reason) =>
                      `<span class="badge warning reason">${escapeHtml(
                        `${reason.code}: ${reason.message}`
                      )}</span>`
                  )
                  .join('')
              : '<span class="badge success">No blocking reasons</span>'
          }
        </div>
      </div>
      <div>
        <div class="meta-label">Advisories</div>
        <div class="advisory-list">
          ${
            session.advisories?.length
              ? session.advisories
                  .map(
                    (advisory) =>
                      `<span class="badge advisory">${escapeHtml(
                        `${advisory.code}: ${advisory.message}`
                      )}</span>`
                  )
                  .join('')
              : '<span class="badge">No advisories</span>'
          }
        </div>
      </div>
      <div class="meta-card">
        <div class="meta-label">First user message</div>
        <div class="meta-value">${escapeHtml(session.firstUserMessage || '—')}</div>
      </div>
    </div>
  `;
}

function renderOperationPreview() {
  const preview =
    state.lastMigrationPreview || state.lastRepairPreview || state.lastRollbackPreview;

  if (!preview) {
    refs.operationPreview.className = 'detail-card empty-state';
    refs.operationPreview.textContent = 'Operation previews appear here.';
    return;
  }

  refs.operationPreview.className = 'detail-card';

  if (preview.plan?.summary && preview.plan?.targetSessions) {
    refs.operationPreview.innerHTML = `
      <div class="preview-block">
        <h3>Migration preview</h3>
        <div class="tag-row">
          <span class="badge">${escapeHtml(preview.plan.fromProvider || 'unknown')} → ${escapeHtml(
            preview.plan.toProvider || 'unknown'
          )}</span>
          <span class="badge">${formatCount(preview.plan.summary.rolloutSessions)} sessions</span>
          <span class="badge">${formatCount(
            preview.plan.summary.rolloutFilesToRewrite
          )} rollout files</span>
        </div>
        <pre>${escapeHtml(
          JSON.stringify(
            {
              warnings: preview.plan.warnings,
              summary: preview.plan.summary,
              targetSessions: preview.plan.targetSessions.map((session) => ({
                id: session.id,
                declaredProvider: session.declaredProvider,
                archived: session.archived
              }))
            },
            null,
            2
          )
        )}</pre>
      </div>
    `;
    return;
  }

  if (preview.plan?.updates) {
    refs.operationPreview.innerHTML = `
      <div class="preview-block">
        <h3>Repair preview</h3>
        <div class="tag-row">
          <span class="badge">${formatCount(preview.plan.summary.updatesNeeded)} updates</span>
          <span class="badge">${formatCount(
            preview.plan.summary.orphanStateRows
          )} orphan rows</span>
        </div>
        <pre>${escapeHtml(
          JSON.stringify(
            {
              warnings: preview.plan.warnings,
              summary: preview.plan.summary,
              updates: preview.plan.updates.map((entry) => ({
                id: entry.session.id,
                changes: Object.keys(entry.changes)
              }))
            },
            null,
            2
          )
        )}</pre>
      </div>
    `;
    return;
  }

  if (preview.plan?.manifest) {
    refs.operationPreview.innerHTML = `
      <div class="preview-block">
        <h3>Rollback preview</h3>
        <div class="tag-row">
          <span class="badge">${escapeHtml(preview.plan.summary.operation)}</span>
          <span class="badge">${formatCount(
            preview.plan.summary.rolloutFiles
          )} rollout files</span>
          <span class="badge">${
            preview.plan.summary.hasStateDb ? 'includes state DB' : 'no state DB'
          }</span>
        </div>
        <pre>${escapeHtml(JSON.stringify(preview.plan.summary, null, 2))}</pre>
      </div>
    `;
  }
}

function renderBackups() {
  const items = state.backups?.items || [];
  refs.backupList.innerHTML = '';

  if (items.length === 0) {
    refs.backupList.innerHTML =
      '<div class="detail-card empty-state">No backups found in the migration-backups directory.</div>';
  } else {
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `backup-item${item.manifestPath === state.selectedBackupPath ? ' selected' : ''}`;
      button.innerHTML = `
        <div class="item-topline">
          <span class="backup-title">${escapeHtml(item.operation)}</span>
          <span class="badge">${escapeHtml(formatDate(item.createdAt))}</span>
        </div>
        <div class="item-subline">
          <code>${escapeHtml(item.manifestPath)}</code>
        </div>
        <div class="tag-row">
          <span class="badge">${formatCount(item.threadIds.length)} threads</span>
          <span class="badge">${formatCount(item.rolloutFiles)} files</span>
          <span class="badge">${item.hasStateDb ? 'state DB' : 'files only'}</span>
        </div>
      `;
      button.addEventListener('click', () => {
        state.selectedBackupPath = item.manifestPath;
        renderAll();
      });
      fragment.appendChild(button);
    }
    refs.backupList.appendChild(fragment);
  }

  const backup = selectedBackup();
  if (!backup) {
    refs.backupDetail.className = 'detail-card empty-state';
    refs.backupDetail.textContent = 'Select a backup manifest to inspect rollback metadata.';
    return;
  }

  refs.backupDetail.className = 'detail-card';
  refs.backupDetail.innerHTML = `
    <div class="detail-grid">
      <h3>${escapeHtml(backup.operation)}</h3>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">Created</div>
          <div class="meta-value">${escapeHtml(formatDate(backup.createdAt))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Manifest</div>
          <div class="meta-value"><code>${escapeHtml(backup.manifestPath)}</code></div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Backup dir</div>
          <div class="meta-value"><code>${escapeHtml(backup.backupDir)}</code></div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Threads</div>
          <div class="meta-value">${escapeHtml(
            backup.threadIds.length > 0 ? backup.threadIds.join(', ') : '—'
          )}</div>
        </div>
      </div>
    </div>
  `;
}

function syncActionButtons() {
  const session = selectedSession();
  const backup = selectedBackup();
  const canPreviewMigrate =
    !state.busy &&
    Boolean(session?.declaredProvider) &&
    session.declaredProvider !== state.scan?.context?.defaultProvider;

  refs.previewMigrate.disabled = !canPreviewMigrate;
  refs.applyMigrate.disabled = !state.lastMigrationRequest || state.busy;
  refs.applyRepair.disabled = !state.lastRepairRequest || state.busy;
  refs.previewRollback.disabled = !backup || state.busy;
  refs.applyRollback.disabled = !state.lastRollbackPreview || state.busy;
}

function renderAll() {
  syncSummary();
  renderSessionList();
  renderSessionDetail();
  renderOperationPreview();
  renderBackups();
  syncActionButtons();
}

async function runTask(message, task, successMessage) {
  setBusy(true, message);
  try {
    const result = await task();
    setBusy(false, successMessage || 'Done.');
    return result;
  } catch (error) {
    setBusy(false, error.message, true);
    return null;
  }
}

async function refreshBackups(preferLatest = false) {
  const data = await runTask(
    'Refreshing backup list…',
    () => window.codexRecovery.listBackups({ codexHome: refs.codexHome.value.trim() || undefined }),
    'Backup list updated.'
  );
  if (!data) {
    return;
  }

  state.backups = data;
  if ((preferLatest || !selectedBackup()) && data.items[0]) {
    state.selectedBackupPath = data.items[0].manifestPath;
  }
  renderAll();
}

async function loadBootstrap() {
  const payload = currentScanRequest();
  const data = await runTask(
    'Scanning Codex history…',
    () => window.codexRecovery.bootstrap(payload),
    'Scan complete.'
  );
  if (!data) {
    return;
  }

  state.scan = data.scan;
  state.backups = data.backups;
  state.lastMigrationRequest = null;
  state.lastMigrationPreview = null;
  state.lastRepairRequest = null;
  state.lastRepairPreview = null;
  state.lastRollbackPreview = null;

  if (!refs.codexHome.value.trim()) {
    refs.codexHome.value = data.scan.context.codexHome;
  }

  const firstSession = getCurrentSessions()[0] || state.scan.report.sessions[0] || null;
  state.selectedSessionId = firstSession?.id || null;
  state.selectedBackupPath = data.backups.items[0]?.manifestPath || null;
  renderAll();
}

async function previewMigrationForSelected() {
  const session = selectedSession();
  if (!session) {
    return;
  }

  const request = {
    codexHome: refs.codexHome.value.trim() || undefined,
    fromProvider: session.declaredProvider,
    toProvider: state.scan.context.defaultProvider,
    threadIds: [session.id],
    archivedMode: session.archived ? 'archived' : 'active'
  };

  const preview = await runTask(
    'Preparing migration preview…',
    () => window.codexRecovery.previewMigration(request),
    'Migration preview ready.'
  );
  if (!preview) {
    return;
  }

  state.lastMigrationRequest = request;
  state.lastMigrationPreview = preview;
  state.lastRepairPreview = null;
  state.lastRollbackPreview = null;
  renderAll();
}

async function applyMigrationFromPreview() {
  const request = state.lastMigrationRequest;
  if (!request) {
    return;
  }

  const result = await runTask(
    'Applying migration…',
    () => window.codexRecovery.applyMigration(request),
    'Migration applied.'
  );
  if (!result) {
    return;
  }

  state.lastMigrationPreview = result;
  state.scan = result.refreshed;
  const selectedId = state.selectedSessionId;
  await refreshBackups(true);
  state.selectedSessionId = selectedId;
  renderAll();
}

async function previewRepairFromSelection() {
  const session = selectedSession();
  const request = {
    codexHome: refs.codexHome.value.trim() || undefined,
    threadIds: session ? [session.id] : [],
    archivedMode: session ? (session.archived ? 'archived' : 'active') : 'all'
  };

  const preview = await runTask(
    'Preparing state repair preview…',
    () => window.codexRecovery.previewRepair(request),
    'Repair preview ready.'
  );
  if (!preview) {
    return;
  }

  state.lastRepairRequest = request;
  state.lastRepairPreview = preview;
  state.lastMigrationPreview = null;
  state.lastRollbackPreview = null;
  renderAll();
}

async function applyRepairFromPreview() {
  const request = state.lastRepairRequest;
  if (!request) {
    return;
  }

  const result = await runTask(
    'Applying state repair…',
    () => window.codexRecovery.applyRepair(request),
    'State repair applied.'
  );
  if (!result) {
    return;
  }

  state.lastRepairPreview = result;
  state.scan = result.refreshed;
  const selectedId = state.selectedSessionId;
  await refreshBackups(true);
  state.selectedSessionId = selectedId;
  renderAll();
}

async function previewRollbackForSelectedBackup() {
  const backup = selectedBackup();
  if (!backup) {
    return;
  }

  const preview = await runTask(
    'Preparing rollback preview…',
    () =>
      window.codexRecovery.previewRollback({
        codexHome: refs.codexHome.value.trim() || undefined,
        manifestOrDir: backup.manifestPath
      }),
    'Rollback preview ready.'
  );
  if (!preview) {
    return;
  }

  state.lastRollbackPreview = preview;
  state.lastMigrationPreview = null;
  state.lastRepairPreview = null;
  renderAll();
}

async function applyRollbackFromPreview() {
  const backup = selectedBackup();
  if (!backup) {
    return;
  }

  const result = await runTask(
    'Applying rollback…',
    () =>
      window.codexRecovery.applyRollback({
        codexHome: refs.codexHome.value.trim() || undefined,
        manifestOrDir: backup.manifestPath
      }),
    'Rollback applied.'
  );
  if (!result) {
    return;
  }

  state.lastRollbackPreview = result;
  state.scan = result.refreshed;
  await refreshBackups(true);
  renderAll();
}

refs.scanForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadBootstrap();
});

refs.sessionFilter.addEventListener('change', () => {
  state.sessionFilter = refs.sessionFilter.value;
  renderAll();
});

refs.sessionSearch.addEventListener('input', () => {
  state.sessionSearch = refs.sessionSearch.value;
  renderAll();
});

refs.previewMigrate.addEventListener('click', previewMigrationForSelected);
refs.applyMigrate.addEventListener('click', applyMigrationFromPreview);
refs.previewRepair.addEventListener('click', previewRepairFromSelection);
refs.applyRepair.addEventListener('click', applyRepairFromPreview);
refs.refreshBackups.addEventListener('click', refreshBackups);
refs.previewRollback.addEventListener('click', previewRollbackForSelectedBackup);
refs.applyRollback.addEventListener('click', applyRollbackFromPreview);

await loadBootstrap();
