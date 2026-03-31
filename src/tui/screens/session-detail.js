function formatReasons(items) {
  if (!items || items.length === 0) {
    return '- none';
  }
  return items.map((item) => `- ${item.code}: ${item.message}`).join('\n');
}

export function renderSessionDetail(session) {
  if (!session) {
    return 'No session selected.';
  }

  return [
    `Title: ${session.title}`,
    `ID: ${session.id}`,
    `Visible: ${session.visible}`,
    `Provider: declared=${session.declaredProvider || '∅'} effective=${session.effectiveProvider || '∅'}`,
    `Source: ${session.source}`,
    `Archived: ${session.archived}`,
    `CWD: ${session.cwd || '∅'}`,
    `Rollout: ${session.rolloutPath || '∅'}`,
    '',
    'Blocking reasons:',
    formatReasons(session.reasons),
    '',
    'Advisories:',
    formatReasons(session.advisories)
  ].join('\n');
}
