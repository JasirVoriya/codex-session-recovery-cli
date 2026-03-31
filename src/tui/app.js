import blessed from 'blessed';

import { loadSidebarAnalysis } from '../analysis.js';
import { applyMigrationPlan, createMigrationPlan } from '../commands/migrate.js';
import { renderSessionDetail } from './screens/session-detail.js';
import { buildSessionItems, buildStatusLine } from './screens/session-list.js';
import { renderMigrationPreview } from './screens/preview.js';

function cycleFilter(mode) {
  if (mode === 'all') {
    return 'visible';
  }
  if (mode === 'visible') {
    return 'hidden';
  }
  return 'all';
}

export async function launchTui(options = {}) {
  let filterMode = 'all';
  let screenMode = 'browse';
  let previewPlan = null;
  let data = await loadSidebarAnalysis({ codexHome: options.codexHome, archivedMode: 'active' });

  const screen = blessed.screen({ smartCSR: true, title: 'Codex Session Recovery' });
  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: false,
    content: 'Codex Session Recovery  |  ↑↓ move  Enter inspect  f filter  m preview migrate  y apply  r reload  q quit',
    border: 'line'
  });

  const list = blessed.list({
    top: 3,
    left: 0,
    width: '42%',
    height: '100%-6',
    keys: true,
    mouse: true,
    border: 'line',
    label: ' Sessions ',
    vi: true,
    style: {
      selected: { bg: 'blue' }
    },
    scrollable: true,
    alwaysScroll: true
  });

  const detail = blessed.box({
    top: 3,
    left: '42%',
    width: '58%',
    height: '100%-6',
    keys: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    border: 'line',
    label: ' Detail ',
    content: 'Loading...'
  });

  const footer = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    border: 'line',
    content: ''
  });

  screen.append(header);
  screen.append(list);
  screen.append(detail);
  screen.append(footer);

  function currentItems() {
    return buildSessionItems(data.report, filterMode);
  }

  function selectedSession() {
    const items = currentItems();
    const selectedIndex = Math.max(0, list.selected);
    return items[selectedIndex]?.session || items[0]?.session || null;
  }

  function renderBrowse() {
    const items = currentItems();
    list.setItems(items.map((item) => item.label));
    if (items.length > 0) {
      list.select(Math.min(list.selected, items.length - 1));
    }
    detail.setContent(renderSessionDetail(selectedSession()));
    footer.setContent(buildStatusLine(data.report, filterMode));
    screen.render();
  }

  function renderPreview() {
    detail.setContent(renderMigrationPreview(previewPlan));
    footer.setContent(`preview targets=${previewPlan?.targetSessions.length || 0}`);
    screen.render();
  }

  async function reload() {
    data = await loadSidebarAnalysis({ codexHome: options.codexHome, archivedMode: 'active' });
    screenMode = 'browse';
    previewPlan = null;
    renderBrowse();
  }

  async function previewMigration() {
    const session = selectedSession();
    if (!session || !session.declaredProvider) {
      footer.setContent('Selected session has no declared provider; nothing to migrate.');
      screen.render();
      return;
    }
    if (session.declaredProvider === data.context.defaultProvider) {
      footer.setContent('Selected session already matches the current default provider.');
      screen.render();
      return;
    }

    previewPlan = await createMigrationPlan({
      codexHome: data.context.codexHome,
      fromProvider: session.declaredProvider,
      toProvider: data.context.defaultProvider,
      threadIds: [session.id],
      archivedMode: session.archived ? 'archived' : 'active'
    });
    screenMode = 'preview';
    renderPreview();
  }

  async function applyPreview() {
    if (!previewPlan || previewPlan.targetSessions.length === 0) {
      return;
    }
    const result = applyMigrationPlan(previewPlan);
    footer.setContent(`Applied migration. backup=${result.backupDir}`);
    await reload();
  }

  list.on('select item', () => {
    if (screenMode === 'browse') {
      detail.setContent(renderSessionDetail(selectedSession()));
      screen.render();
    }
  });

  list.key(['up', 'down', 'k', 'j', 'enter'], () => {
    if (screenMode === 'browse') {
      detail.setContent(renderSessionDetail(selectedSession()));
      screen.render();
    }
  });

  screen.key(['q', 'C-c'], () => process.exit(0));
  screen.key(['f'], () => {
    if (screenMode !== 'browse') {
      return;
    }
    filterMode = cycleFilter(filterMode);
    renderBrowse();
  });
  screen.key(['r'], async () => {
    footer.setContent('Reloading...');
    screen.render();
    await reload();
  });
  screen.key(['m'], async () => {
    if (screenMode === 'browse') {
      await previewMigration();
    }
  });
  screen.key(['y'], async () => {
    if (screenMode === 'preview') {
      await applyPreview();
    }
  });
  screen.key(['escape'], () => {
    if (screenMode === 'preview') {
      screenMode = 'browse';
      previewPlan = null;
      renderBrowse();
    }
  });

  renderBrowse();
  list.focus();
}
