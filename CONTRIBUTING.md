# Contributing

Thanks for improving `codex-session-recovery-cli`.

## Before you start

- Open an issue for significant changes so the scope is clear before code lands.
- Keep changes focused. Small, reviewable pull requests are easier to validate.
- Preserve the safety model: every write path must keep backups and support rollback.

## Development setup

```bash
npm install
npm run check
```

Useful commands:

```bash
npm test
npm run smoke
npm run gui
```

## Project expectations

- Use Node.js 20 or newer.
- Match the existing ESM style and two-space indentation.
- Add or update tests for behavior changes, especially for migration, repair, backup, or rollback flows.
- Keep CLI help text and README examples aligned with the implementation.

## Pull request checklist

- Explain the user-facing problem and the chosen fix.
- Call out safety implications for migrations or rollback behavior.
- Add or update tests when behavior changes.
- Run `npm run check` before asking for review.

## Reporting bugs

When filing a bug, include:

- Codex version if known
- OS and Node.js version
- Reproduction steps
- Whether the affected session is active or archived
- Whether the problem is in rollout files, `state_5.sqlite`, filtering, or the GUI

## Scope guidance

High-value contributions include:

- New explanation or diagnosis features in `scan`
- More precise repair and migration previews
- Better rollback ergonomics
- Cross-platform packaging and CI improvements
- Documentation and reproducible fixtures
