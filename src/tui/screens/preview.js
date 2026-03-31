export function renderMigrationPreview(plan) {
  if (!plan || !plan.targetSessions) {
    return 'No migration preview available.';
  }

  const lines = [
    `Migration preview`,
    `from=${plan.fromProvider} to=${plan.toProvider}`,
    `targets=${plan.targetSessions.length}`,
    ''
  ];

  for (const session of plan.targetSessions.slice(0, 20)) {
    lines.push(`- ${session.id} ${session.title || session.sessionIndexTitle || session.firstUserMessage || ''}`);
  }

  if (plan.targetSessions.length > 20) {
    lines.push(`- ... ${plan.targetSessions.length - 20} more`);
  }

  lines.push('');
  lines.push('Press y to apply this migration, Esc to cancel.');
  return lines.join('\n');
}
