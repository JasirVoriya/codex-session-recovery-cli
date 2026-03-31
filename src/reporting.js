import process from 'node:process';
import readline from 'node:readline/promises';

import chalk from 'chalk';

function pad(value, width) {
  const text = String(value ?? '');
  if (text.length >= width) {
    return text;
  }
  return `${text}${' '.repeat(width - text.length)}`;
}

function sessionRow(session) {
  const status = session.visible ? chalk.green('visible') : chalk.yellow('hidden');
  const provider = session.effectiveProvider || 'unknown';
  const title = session.title || session.id;
  const reasonText = session.visible
    ? '—'
    : session.reasons.map((reason) => reason.code).join(', ');

  return `${pad(status, 9)} ${pad(provider, 14)} ${pad(session.source, 11)} ${pad(session.archived ? 'archived' : 'active', 9)} ${pad(session.id, 36)} ${title} (${reasonText})`;
}

export function renderScanReport(report, { limit = 30 } = {}) {
  const lines = [];
  lines.push(chalk.bold('Codex sidebar scan'));
  lines.push(
    `defaultProvider=${report.defaultProvider} filters.providers=${report.filters.modelProviders.join(',') || 'ALL'} filters.sources=${report.filters.sourceKinds.join(',')} archivedMode=${report.filters.archivedMode}`
  );
  lines.push(
    `scanned=${report.totals.scanned} visible=${report.totals.visible} hidden=${report.totals.hidden} stateOnly=${report.totals.stateOnly}`
  );

  if (report.reasonGroups.length > 0) {
    lines.push('');
    lines.push(chalk.bold('Hidden reasons'));
    for (const group of report.reasonGroups) {
      lines.push(`- ${group.code}: ${group.count}`);
    }
  }

  lines.push('');
  lines.push(chalk.bold(`Sessions (top ${Math.min(limit, report.sessions.length)})`));
  for (const session of report.sessions.slice(0, limit)) {
    lines.push(sessionRow(session));
    for (const advisory of session.advisories) {
      lines.push(`  advisory: ${advisory.code} - ${advisory.message}`);
    }
  }

  return lines.join('\n');
}

export function renderPlanSummary(title, plan) {
  const lines = [chalk.bold(title)];
  for (const [key, value] of Object.entries(plan.summary || {})) {
    lines.push(`- ${key}: ${value}`);
  }

  if (plan.warnings?.length) {
    lines.push('');
    lines.push(chalk.bold('Warnings'));
    for (const warning of plan.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join('\n');
}

export function renderChangeList(items, formatter) {
  if (!items || items.length === 0) {
    return 'No changes.';
  }
  return items.map((item) => `- ${formatter(item)}`).join('\n');
}

export async function confirmAction(message) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`${message} Use --yes to continue in non-interactive mode.`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}
