import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

function toEpochSeconds(value) {
  if (!value) {
    return Math.floor(Date.now() / 1000);
  }

  if (typeof value === 'number') {
    return value;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return Math.floor(Date.now() / 1000);
  }
  return Math.floor(timestamp / 1000);
}

function normalizeTitle(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed) {
    return trimmed;
  }
  return fallback;
}

function truncateText(value, maxLength = 80) {
  if (!value) {
    return '';
  }

  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1)}…`;
}

function normalizeSourceValue(value, fallback = 'unknown') {
  if (typeof value === 'string' && value) {
    return value;
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function desiredThreadRecord(session, defaultProvider, existingRow = null) {
  const effectiveProvider = session.declaredProvider || defaultProvider;
  const titleFallback = truncateText(session.firstUserMessage, 72) || session.id || 'Untitled thread';
  const title = normalizeTitle(session.sessionIndexTitle || existingRow?.title, titleFallback);
  const rolloutPath = path.resolve(session.rolloutPath || existingRow?.rollout_path || '');
  const createdAt = toEpochSeconds(existingRow?.created_at || session.createdAt);
  const updatedAt = toEpochSeconds(session.updatedAt || existingRow?.updated_at || session.createdAt);
  const archivedAt = session.archived
    ? toEpochSeconds(session.archivedAt || session.updatedAt || session.createdAt)
    : null;

  return {
    id: session.id,
    rollout_path: rolloutPath,
    created_at: createdAt,
    updated_at: updatedAt,
    source: normalizeSourceValue(session.source, existingRow?.source || 'unknown'),
    model_provider: effectiveProvider,
    cwd: session.cwd || existingRow?.cwd || '',
    title,
    sandbox_policy: existingRow?.sandbox_policy || 'workspace-write',
    approval_mode: existingRow?.approval_mode || 'never',
    tokens_used: existingRow?.tokens_used || 0,
    has_user_event: session.sawUserEvent ? 1 : existingRow?.has_user_event || 0,
    archived: session.archived ? 1 : 0,
    archived_at: archivedAt,
    git_sha: existingRow?.git_sha || null,
    git_branch: existingRow?.git_branch || null,
    git_origin_url: existingRow?.git_origin_url || null,
    cli_version: session.cliVersion || existingRow?.cli_version || '',
    first_user_message: session.firstUserMessage || existingRow?.first_user_message || '',
    agent_nickname: existingRow?.agent_nickname || null,
    agent_role: existingRow?.agent_role || null,
    memory_mode: existingRow?.memory_mode || 'enabled',
    model: existingRow?.model || null,
    reasoning_effort: existingRow?.reasoning_effort || null,
    agent_path: existingRow?.agent_path || null
  };
}

function normalizeRow(row) {
  return {
    ...row,
    archived: Boolean(row.archived),
    rollout_path: row.rollout_path ? path.resolve(row.rollout_path) : null
  };
}

export function listThreads(stateDbPath) {
  if (!fs.existsSync(stateDbPath)) {
    return [];
  }

  const db = new Database(stateDbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare('SELECT * FROM threads ORDER BY updated_at DESC, id DESC').all();
    return rows.map(normalizeRow);
  } finally {
    db.close();
  }
}

export function listThreadsById(stateDbPath) {
  return new Map(listThreads(stateDbPath).map((row) => [row.id, row]));
}

export function upsertSessions(stateDbPath, sessions, { defaultProvider, existingRows = new Map() }) {
  const db = new Database(stateDbPath, { fileMustExist: false });
  const upsert = db.prepare(`
    INSERT INTO threads (
      id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
      sandbox_policy, approval_mode, tokens_used, has_user_event, archived, archived_at,
      git_sha, git_branch, git_origin_url, cli_version, first_user_message, agent_nickname,
      agent_role, memory_mode, model, reasoning_effort, agent_path
    ) VALUES (
      @id, @rollout_path, @created_at, @updated_at, @source, @model_provider, @cwd, @title,
      @sandbox_policy, @approval_mode, @tokens_used, @has_user_event, @archived, @archived_at,
      @git_sha, @git_branch, @git_origin_url, @cli_version, @first_user_message, @agent_nickname,
      @agent_role, @memory_mode, @model, @reasoning_effort, @agent_path
    )
    ON CONFLICT(id) DO UPDATE SET
      rollout_path = excluded.rollout_path,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      source = excluded.source,
      model_provider = excluded.model_provider,
      cwd = excluded.cwd,
      title = excluded.title,
      sandbox_policy = excluded.sandbox_policy,
      approval_mode = excluded.approval_mode,
      tokens_used = excluded.tokens_used,
      has_user_event = excluded.has_user_event,
      archived = excluded.archived,
      archived_at = excluded.archived_at,
      git_sha = excluded.git_sha,
      git_branch = excluded.git_branch,
      git_origin_url = excluded.git_origin_url,
      cli_version = excluded.cli_version,
      first_user_message = excluded.first_user_message,
      agent_nickname = excluded.agent_nickname,
      agent_role = excluded.agent_role,
      memory_mode = excluded.memory_mode,
      model = excluded.model,
      reasoning_effort = excluded.reasoning_effort,
      agent_path = excluded.agent_path
  `);

  const transaction = db.transaction((targetSessions) => {
    let changed = 0;
    for (const session of targetSessions) {
      const record = desiredThreadRecord(session, defaultProvider, existingRows.get(session.id) || null);
      const result = upsert.run(record);
      changed += result.changes;
    }
    return changed;
  });

  try {
    return transaction(sessions);
  } finally {
    db.close();
  }
}

export function applyProviderMigration(stateDbPath, sessions, { defaultProvider }) {
  const existingRows = listThreadsById(stateDbPath);
  return upsertSessions(stateDbPath, sessions, { defaultProvider, existingRows });
}

export function diffTrackedFields(existingRow, desiredRecord) {
  if (!existingRow) {
    return { missing_in_state_db: { from: null, to: desiredRecord.id } };
  }

  const keys = [
    'rollout_path',
    'source',
    'model_provider',
    'cwd',
    'title',
    'archived',
    'archived_at',
    'cli_version',
    'first_user_message'
  ];

  const changes = {};
  for (const key of keys) {
    const currentValue = existingRow[key] ?? null;
    const desiredValue = desiredRecord[key] ?? null;
    if (currentValue !== desiredValue) {
      changes[key] = { from: currentValue, to: desiredValue };
    }
  }
  return changes;
}

export function buildDesiredThreadRecord(session, defaultProvider, existingRow) {
  return desiredThreadRecord(session, defaultProvider, existingRow);
}
