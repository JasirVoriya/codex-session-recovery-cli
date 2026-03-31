import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const HEAD_RECORD_LIMIT = 200;

function listFilesRecursively(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const results = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  }

  return results.sort();
}

function parseTimestampFromFilename(filePath) {
  const basename = path.basename(filePath, '.jsonl');
  const match = basename.match(/^rollout-(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-/);
  if (!match) {
    return null;
  }

  const [, hourPrefix, minute, second] = match;
  return `${hourPrefix}:${minute}:${second}.000Z`;
}

function extractUserText(payload) {
  if (!payload || payload.type !== 'message' || payload.role !== 'user') {
    return null;
  }

  if (!Array.isArray(payload.content)) {
    return null;
  }

  for (const item of payload.content) {
    if (item?.type === 'input_text' && typeof item.text === 'string' && item.text.trim()) {
      return item.text.trim();
    }
  }

  return null;
}

function normalizeRolloutPath(filePath) {
  return path.resolve(filePath);
}

export function loadSessionIndexMap(sessionIndexPath) {
  const names = new Map();

  if (!fs.existsSync(sessionIndexPath)) {
    return names;
  }

  const lines = fs.readFileSync(sessionIndexPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const entry = JSON.parse(trimmed);
      if (entry?.id && typeof entry.thread_name === 'string' && entry.thread_name.trim()) {
        names.set(entry.id, entry.thread_name.trim());
      }
    } catch {
      // ignore malformed index rows
    }
  }

  return names;
}

export async function parseRolloutFile(filePath, { archived = false, sessionNames = new Map() } = {}) {
  const resolvedPath = normalizeRolloutPath(filePath);
  const stat = fs.statSync(resolvedPath);
  const summary = {
    id: null,
    rolloutPath: resolvedPath,
    archived,
    archivedAt: archived ? stat.mtime.toISOString() : null,
    createdAt: parseTimestampFromFilename(resolvedPath),
    updatedAt: stat.mtime.toISOString(),
    cwd: null,
    source: null,
    declaredProvider: null,
    cliVersion: null,
    firstUserMessage: null,
    sawSessionMeta: false,
    sawUserEvent: false,
    sessionIndexTitle: null,
    rolloutFiles: [resolvedPath],
    warnings: []
  };

  const stream = fs.createReadStream(resolvedPath, 'utf8');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let linesScanned = 0;
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      linesScanned += 1;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (typeof parsed.timestamp === 'string') {
        summary.updatedAt = parsed.timestamp;
        summary.createdAt ||= parsed.timestamp;
      }

      if (parsed.type === 'session_meta' && parsed.payload) {
        if (!summary.sawSessionMeta) {
          summary.sawSessionMeta = true;
          summary.id = parsed.payload.id || summary.id;
          summary.createdAt = parsed.payload.timestamp || summary.createdAt;
          summary.cwd = parsed.payload.cwd || summary.cwd;
          summary.source = parsed.payload.source || summary.source;
          summary.declaredProvider = parsed.payload.model_provider ?? summary.declaredProvider;
          summary.cliVersion = parsed.payload.cli_version || summary.cliVersion;
          if (summary.id && sessionNames.has(summary.id)) {
            summary.sessionIndexTitle = sessionNames.get(summary.id);
          }
        }
      }

      if (parsed.type === 'response_item') {
        const userText = extractUserText(parsed.payload);
        if (userText) {
          summary.sawUserEvent = true;
          summary.firstUserMessage ||= userText;
        }
      }

      if (parsed.type === 'event_msg' && parsed.payload?.type === 'user_message') {
        const message = parsed.payload.message?.trim();
        if (message) {
          summary.sawUserEvent = true;
          summary.firstUserMessage ||= message;
        }
      }

      if (summary.sawSessionMeta && summary.sawUserEvent && linesScanned >= 3) {
        break;
      }
      if (linesScanned >= HEAD_RECORD_LIMIT) {
        break;
      }
    }
  } finally {
    rl.close();
    stream.close();
  }

  if (summary.id && sessionNames.has(summary.id)) {
    summary.sessionIndexTitle = sessionNames.get(summary.id);
  }

  if (!summary.sawSessionMeta) {
    summary.warnings.push('missing_session_meta');
  }

  return summary;
}

function toUpdatedAtValue(summary) {
  const parsed = Date.parse(summary.updatedAt || summary.createdAt || '');
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  return 0;
}

function collapseThreadSummaries(summaries) {
  const merged = new Map();
  const passthrough = [];

  for (const summary of summaries) {
    if (!summary.id) {
      passthrough.push(summary);
      continue;
    }

    const existing = merged.get(summary.id);
    if (!existing) {
      merged.set(summary.id, {
        ...summary,
        rolloutFiles: [...(summary.rolloutFiles || [summary.rolloutPath])]
      });
      continue;
    }

    const useNextAsPrimary = toUpdatedAtValue(summary) >= toUpdatedAtValue(existing);
    const primary = useNextAsPrimary ? summary : existing;
    const secondary = useNextAsPrimary ? existing : summary;
    const createdAtValues = [existing.createdAt, summary.createdAt]
      .filter(Boolean)
      .map((value) => Date.parse(value))
      .filter((value) => !Number.isNaN(value));
    const createdAt =
      createdAtValues.length > 0
        ? new Date(Math.min(...createdAtValues)).toISOString()
        : primary.createdAt || secondary.createdAt || null;

    merged.set(summary.id, {
      ...primary,
      createdAt,
      updatedAt: primary.updatedAt || secondary.updatedAt,
      archived: primary.archived,
      archivedAt: primary.archivedAt || secondary.archivedAt || null,
      sawSessionMeta: primary.sawSessionMeta || secondary.sawSessionMeta,
      sawUserEvent: primary.sawUserEvent || secondary.sawUserEvent,
      sessionIndexTitle:
        primary.sessionIndexTitle || secondary.sessionIndexTitle || null,
      firstUserMessage:
        primary.firstUserMessage || secondary.firstUserMessage || null,
      warnings: [...new Set([...(existing.warnings || []), ...(summary.warnings || [])])],
      rolloutFiles: [
        ...new Set([
          ...(existing.rolloutFiles || [existing.rolloutPath]),
          ...(summary.rolloutFiles || [summary.rolloutPath])
        ])
      ]
    });
  }

  return [...merged.values(), ...passthrough];
}

export async function scanRollouts(context, options = {}) {
  const sessionNames = options.sessionNames || loadSessionIndexMap(context.sessionIndexPath);
  const files = [
    ...listFilesRecursively(context.sessionsDir).map((filePath) => ({ filePath, archived: false })),
    ...listFilesRecursively(context.archivedSessionsDir).map((filePath) => ({ filePath, archived: true }))
  ];

  const results = [];
  for (const entry of files) {
    results.push(await parseRolloutFile(entry.filePath, { archived: entry.archived, sessionNames }));
  }

  return collapseThreadSummaries(results);
}

export function rewriteRolloutProvider(filePath, nextProvider) {
  const contents = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let changed = false;

  const rewritten = contents.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || changed) {
      return line;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.type !== 'session_meta' || !parsed.payload) {
        return line;
      }
      parsed.payload.model_provider = nextProvider;
      changed = true;
      return JSON.stringify(parsed);
    } catch {
      return line;
    }
  });

  if (!changed) {
    throw new Error(`Could not locate session_meta in ${filePath}`);
  }

  fs.writeFileSync(filePath, `${rewritten.join('\n').replace(/\n+$/u, '')}\n`);
  return true;
}
