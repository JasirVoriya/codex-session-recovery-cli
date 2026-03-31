import { INTERACTIVE_SOURCES } from './codex-home.js';

function normalizeSource(source) {
  if (!source) {
    return 'unknown';
  }

  const normalized = String(source).trim().toLowerCase();
  if (normalized === 'mcp' || normalized === 'app_server' || normalized === 'app-server') {
    return 'app-server';
  }
  if (normalized.startsWith('subagent')) {
    return 'subagent';
  }
  return normalized;
}

function normalizeSourceKinds(sourceKinds) {
  if (!sourceKinds || sourceKinds.length === 0) {
    return new Set(INTERACTIVE_SOURCES);
  }
  return new Set(sourceKinds.map(normalizeSource));
}

function normalizeProviderFilter(modelProviders, defaultProvider) {
  if (modelProviders === null || typeof modelProviders === 'undefined') {
    return defaultProvider ? [defaultProvider] : [];
  }
  if (modelProviders.length === 0) {
    return [];
  }
  return [...new Set(modelProviders.filter(Boolean))];
}

function providerMatches(providerFilter, sessionProvider, defaultProvider) {
  if (!providerFilter || providerFilter.length === 0) {
    return true;
  }

  if (sessionProvider) {
    return providerFilter.includes(sessionProvider);
  }

  return providerFilter.includes(defaultProvider);
}

function buildReason(code, message) {
  return { code, message, blocking: true };
}

function buildAdvisory(code, message) {
  return { code, message, blocking: false };
}

function chooseTitle(session, stateRow) {
  return (
    session.sessionIndexTitle ||
    stateRow?.title ||
    session.firstUserMessage?.replace(/\s+/g, ' ').trim().slice(0, 72) ||
    session.id ||
    'Untitled thread'
  );
}

function analyzeRolloutSession(session, stateRow, filters, defaultProvider) {
  const providerFilter = normalizeProviderFilter(filters.modelProviders, defaultProvider);
  const sourceFilter = normalizeSourceKinds(filters.sourceKinds);
  const archivedMode = filters.archivedMode || 'active';
  const normalizedSource = normalizeSource(session.source || stateRow?.source);
  const effectiveProvider = session.declaredProvider || defaultProvider;
  const reasons = [];
  const advisories = [];

  if (!session.sawSessionMeta || !session.id) {
    reasons.push(buildReason('missing_session_meta', 'Rollout 缺少 session_meta，左侧列表无法识别线程。'));
  }

  if (!session.sawUserEvent) {
    reasons.push(buildReason('missing_user_event', 'Rollout 没有用户消息事件，不满足线程列表的最小条件。'));
  }

  if (archivedMode === 'active' && session.archived) {
    reasons.push(buildReason('archived_hidden', '当前按左侧默认 active 历史规则过滤，archived 会话不会显示。'));
  }

  if (archivedMode === 'archived' && !session.archived) {
    reasons.push(buildReason('active_hidden', '当前只查看 archived 会话，active 会话被过滤。'));
  }

  if (!providerMatches(providerFilter, session.declaredProvider, defaultProvider)) {
    reasons.push(
      buildReason(
        'provider_mismatch',
        `会话 provider 与当前列表 provider 过滤不匹配。effective=${effectiveProvider}`
      )
    );
  }

  if (!sourceFilter.has(normalizedSource)) {
    reasons.push(
      buildReason(
        'source_filtered',
        `当前 source 过滤不包含 ${normalizedSource}。默认左侧历史只看 interactive sources。`
      )
    );
  }

  if (!stateRow) {
    advisories.push(buildAdvisory('state_missing', 'State DB 中没有对应线程，建议执行 repair-state。'));
  } else {
    if ((stateRow.model_provider || null) !== effectiveProvider) {
      advisories.push(
        buildAdvisory(
          'state_provider_out_of_sync',
          `State DB provider=${stateRow.model_provider}，但 rollout effective provider=${effectiveProvider}。`
        )
      );
    }

    if (Boolean(stateRow.archived) !== Boolean(session.archived)) {
      advisories.push(buildAdvisory('state_archived_out_of_sync', 'State DB archived 标记与 rollout 不一致。'));
    }

    if (stateRow.rollout_path && stateRow.rollout_path !== session.rolloutPath) {
      advisories.push(buildAdvisory('state_rollout_path_out_of_sync', 'State DB rollout_path 与实际文件路径不一致。'));
    }
  }

  return {
    kind: 'rollout',
    id: session.id,
    title: chooseTitle(session, stateRow),
    visible: reasons.length === 0,
    reasons,
    advisories,
    archived: session.archived,
    source: normalizedSource,
    declaredProvider: session.declaredProvider,
    effectiveProvider,
    rolloutPath: session.rolloutPath,
    stateRow,
    cwd: session.cwd || stateRow?.cwd || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    firstUserMessage: session.firstUserMessage,
    sessionIndexTitle: session.sessionIndexTitle || null,
    sawSessionMeta: session.sawSessionMeta,
    sawUserEvent: session.sawUserEvent
  };
}

function analyzeStateOnlyThread(stateRow) {
  return {
    kind: 'state-only',
    id: stateRow.id,
    title: stateRow.title || stateRow.first_user_message || stateRow.id,
    visible: false,
    reasons: [
      buildReason('missing_rollout_file', 'State DB 存在记录，但 rollout 文件不存在或未扫描到。')
    ],
    advisories: [],
    archived: Boolean(stateRow.archived),
    source: normalizeSource(stateRow.source),
    declaredProvider: stateRow.model_provider,
    effectiveProvider: stateRow.model_provider,
    rolloutPath: stateRow.rollout_path,
    stateRow,
    cwd: stateRow.cwd,
    createdAt: stateRow.created_at,
    updatedAt: stateRow.updated_at,
    firstUserMessage: stateRow.first_user_message,
    sessionIndexTitle: stateRow.title || null,
    sawSessionMeta: false,
    sawUserEvent: Boolean(stateRow.has_user_event)
  };
}

function sortByUpdatedAtDescending(left, right) {
  const leftValue = Date.parse(left.updatedAt || 0) || Number(left.updatedAt || 0) || 0;
  const rightValue = Date.parse(right.updatedAt || 0) || Number(right.updatedAt || 0) || 0;
  return rightValue - leftValue;
}

export function buildSidebarAnalysis({ rollouts, stateRows, defaultProvider, filters = {} }) {
  const stateById = new Map(stateRows.map((row) => [row.id, row]));
  const matchedIds = new Set();
  const sessions = [];

  for (const rollout of rollouts) {
    const stateRow = rollout.id ? stateById.get(rollout.id) || null : null;
    if (rollout.id) {
      matchedIds.add(rollout.id);
    }
    sessions.push(analyzeRolloutSession(rollout, stateRow, filters, defaultProvider));
  }

  for (const stateRow of stateRows) {
    if (!matchedIds.has(stateRow.id)) {
      sessions.push(analyzeStateOnlyThread(stateRow));
    }
  }

  sessions.sort(sortByUpdatedAtDescending);

  const reasonGroups = new Map();
  let visibleCount = 0;
  let hiddenCount = 0;
  let stateOnlyCount = 0;

  for (const session of sessions) {
    if (session.kind === 'state-only') {
      stateOnlyCount += 1;
    }
    if (session.visible) {
      visibleCount += 1;
      continue;
    }
    hiddenCount += 1;
    for (const reason of session.reasons) {
      reasonGroups.set(reason.code, (reasonGroups.get(reason.code) || 0) + 1);
    }
  }

  return {
    defaultProvider,
    filters: {
      modelProviders: normalizeProviderFilter(filters.modelProviders, defaultProvider),
      sourceKinds: [...normalizeSourceKinds(filters.sourceKinds)],
      archivedMode: filters.archivedMode || 'active'
    },
    totals: {
      scanned: sessions.length,
      visible: visibleCount,
      hidden: hiddenCount,
      stateOnly: stateOnlyCount,
      rollout: rollouts.length
    },
    reasonGroups: [...reasonGroups.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
    sessions
  };
}

export function getEffectiveProvider(session, defaultProvider) {
  return session.declaredProvider || defaultProvider;
}
