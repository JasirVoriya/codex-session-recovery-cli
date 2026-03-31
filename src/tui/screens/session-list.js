function reasonLabel(session) {
  if (session.visible) {
    return 'visible';
  }
  return session.reasons[0]?.code || 'hidden';
}

export function buildSessionItems(report, filterMode = 'all') {
  return report.sessions
    .filter((session) => {
      if (filterMode === 'visible') {
        return session.visible;
      }
      if (filterMode === 'hidden') {
        return !session.visible;
      }
      return true;
    })
    .map((session) => ({
      session,
      label: `${session.visible ? '✓' : '✗'} ${session.title} [${session.effectiveProvider}] (${reasonLabel(session)})`
    }));
}

export function buildStatusLine(report, filterMode) {
  return [
    `provider=${report.defaultProvider}`,
    `visible=${report.totals.visible}`,
    `hidden=${report.totals.hidden}`,
    `filter=${filterMode}`
  ].join('  ');
}
