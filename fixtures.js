import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

function toNestedRolloutPath(rootDir, isoTimestamp, id) {
  const date = new Date(isoTimestamp);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const fileTimestamp = isoTimestamp
    .slice(0, 19)
    .replace(/:/g, '-')
    .replace('.000Z', '');
  return path.join(rootDir, year, month, day, `rollout-${fileTimestamp}-${id}.jsonl`);
}

export function createFixture(options = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-recovery-'));
  const codexHome = path.join(rootDir, '.codex');
  const sessionsDir = path.join(codexHome, 'sessions');
  const archivedSessionsDir = path.join(codexHome, 'archived_sessions');
  const stateDbPath = path.join(codexHome, 'state_5.sqlite');

  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(archivedSessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    `model_provider = "${options.defaultProvider || 'aixj_vip'}"\n`
  );
  fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"auth_mode":"apikey"}\n');
  fs.writeFileSync(path.join(codexHome, 'session_index.jsonl'), '');

  const db = new Database(stateDbPath);
  db.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      model_provider TEXT NOT NULL,
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      sandbox_policy TEXT NOT NULL,
      approval_mode TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      has_user_event INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at INTEGER,
      git_sha TEXT,
      git_branch TEXT,
      git_origin_url TEXT,
      cli_version TEXT NOT NULL DEFAULT '',
      first_user_message TEXT NOT NULL DEFAULT '',
      agent_nickname TEXT,
      agent_role TEXT,
      memory_mode TEXT NOT NULL DEFAULT 'enabled',
      model TEXT,
      reasoning_effort TEXT,
      agent_path TEXT
    );
  `);
  db.close();

  return {
    rootDir,
    codexHome,
    sessionsDir,
    archivedSessionsDir,
    stateDbPath,
    cleanup() {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  };
}

export function writeRollout(options) {
  const timestamp = options.timestamp || '2026-03-30T10:00:00.000Z';
  const rolloutRoot = options.archived ? options.archivedSessionsDir : options.sessionsDir;
  const rolloutPath = toNestedRolloutPath(rolloutRoot, timestamp, options.id);
  fs.mkdirSync(path.dirname(rolloutPath), { recursive: true });

  const payload = {
    id: options.id,
    timestamp,
    cwd: options.cwd || '/tmp/project',
    originator: 'Codex Desktop',
    cli_version: options.cliVersion || '0.107.0-alpha.5',
    source: options.source || 'vscode'
  };
  if (typeof options.provider !== 'undefined') {
    payload.model_provider = options.provider;
  }

  const lines = [
    JSON.stringify({ timestamp, type: 'session_meta', payload }),
    JSON.stringify({
      timestamp,
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: options.userMessage || 'hello world' }]
      }
    }),
    JSON.stringify({
      timestamp,
      type: 'event_msg',
      payload: { type: 'user_message', message: options.userMessage || 'hello world' }
    })
  ];

  fs.writeFileSync(rolloutPath, `${lines.join('\n')}\n`);
  if (options.threadName) {
    fs.appendFileSync(
      path.join(options.codexHome, 'session_index.jsonl'),
      `${JSON.stringify({ id: options.id, thread_name: options.threadName, updated_at: timestamp })}\n`
    );
  }
  return rolloutPath;
}

export function insertThread(stateDbPath, options) {
  const db = new Database(stateDbPath);
  const statement = db.prepare(`
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
  `);

  statement.run({
    id: options.id,
    rollout_path: options.rolloutPath,
    created_at: options.createdAt || 1711792800,
    updated_at: options.updatedAt || 1711792800,
    source: options.source || 'vscode',
    model_provider: options.provider || 'openai',
    cwd: options.cwd || '/tmp/project',
    title: options.title || 'Thread title',
    sandbox_policy: 'workspace-write',
    approval_mode: 'never',
    tokens_used: 0,
    has_user_event: 1,
    archived: options.archived ? 1 : 0,
    archived_at: options.archived ? 1711792800 : null,
    git_sha: null,
    git_branch: null,
    git_origin_url: null,
    cli_version: options.cliVersion || '0.107.0-alpha.5',
    first_user_message: options.firstUserMessage || 'hello world',
    agent_nickname: null,
    agent_role: null,
    memory_mode: 'enabled',
    model: null,
    reasoning_effort: null,
    agent_path: null
  });
  db.close();
}

export function readThread(stateDbPath, id) {
  const db = new Database(stateDbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare('SELECT * FROM threads WHERE id = ?').get(id);
  } finally {
    db.close();
  }
}

export function readSessionMetaProvider(rolloutPath) {
  const firstLine = fs.readFileSync(rolloutPath, 'utf8').split(/\r?\n/)[0];
  return JSON.parse(firstLine).payload.model_provider;
}
