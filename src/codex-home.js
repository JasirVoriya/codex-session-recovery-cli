import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parse as parseToml } from 'smol-toml';

export const INTERACTIVE_SOURCES = ['cli', 'vscode', 'atlas', 'chatgpt'];

export function expandHome(inputPath) {
  if (!inputPath || inputPath === '~') {
    return os.homedir();
  }

  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

export function resolveCodexHome(inputPath) {
  return path.resolve(expandHome(inputPath || '~/.codex'));
}

export function readJsonFileSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function readTomlFileSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return parseToml(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function inferProviderFromAuthMode(authMode) {
  if (typeof authMode !== 'string') {
    return null;
  }

  if (authMode === 'chatgpt') {
    return 'openai';
  }

  if (authMode === 'apikey' || authMode === 'api_key' || authMode === 'api') {
    return 'custom';
  }

  return null;
}

export function loadCodexContext(options = {}) {
  const codexHome = resolveCodexHome(options.codexHome || process.env.CODEX_HOME || '~/.codex');
  const sessionsDir = path.join(codexHome, 'sessions');
  const archivedSessionsDir = path.join(codexHome, 'archived_sessions');
  const stateDbPath = path.join(codexHome, 'state_5.sqlite');
  const configPath = path.join(codexHome, 'config.toml');
  const authPath = path.join(codexHome, 'auth.json');
  const sessionIndexPath = path.join(codexHome, 'session_index.jsonl');
  const backupsDir = path.join(codexHome, 'migration-backups');
  const config = readTomlFileSafe(configPath) || {};
  const auth = readJsonFileSafe(authPath) || {};
  const inferredProvider = inferProviderFromAuthMode(auth.auth_mode);

  return {
    codexHome,
    sessionsDir,
    archivedSessionsDir,
    stateDbPath,
    configPath,
    authPath,
    sessionIndexPath,
    backupsDir,
    config,
    auth,
    defaultProvider:
      options.defaultProvider ||
      config.model_provider ||
      config.modelProvider ||
      inferredProvider ||
      null
  };
}

export function ensureCodexContext(context, { requireStateDb = true } = {}) {
  if (!fs.existsSync(context.codexHome)) {
    throw new Error(`Codex home not found: ${context.codexHome}`);
  }

  if (!fs.existsSync(context.sessionsDir) && !fs.existsSync(context.archivedSessionsDir)) {
    throw new Error(
      `No rollout directories found under ${context.codexHome} (expected sessions or archived_sessions)`
    );
  }

  if (requireStateDb && !fs.existsSync(context.stateDbPath)) {
    throw new Error(`State DB not found: ${context.stateDbPath}`);
  }

  if (!context.defaultProvider) {
    throw new Error(`Unable to resolve default provider from ${context.configPath}`);
  }
}
