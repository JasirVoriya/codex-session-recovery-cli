# Codex session recovery CLI

This tool analyzes Codex local history using the same data path as the left
sidebar: rollout files, `state_5.sqlite`, provider filtering, interactive
source filtering, and archived state. It helps you explain why a thread is not
visible, migrate provider metadata, repair SQLite state drift, roll back any
write operation from a generated backup manifest, and inspect the same workflow
through a desktop GUI.

## What it does

- Scans `sessions`, `archived_sessions`, and `state_5.sqlite` together.
- Applies the real sidebar defaults: current provider and interactive sources.
- Explains hidden threads with reason codes such as `provider_mismatch`.
- Migrates provider metadata in both rollout files and the state DB.
- Repairs stale SQLite rows from rollout metadata.
- Creates a backup manifest before every write.
- Exposes a friendly `ui` subcommand for interactive terminal browsing.
- Exposes an Electron desktop GUI for macOS and Windows workflows.

## Install

Run the wrapper once. It installs Node dependencies automatically.

```bash
/Users/voriyajasir/code/skills/codex-session-recovery-cli/bin/codex-session-recovery.js --help
```

## Common commands

Use `scan` to inspect what the sidebar would show right now.

```bash
codex-session-recovery scan
codex-session-recovery scan --provider openai --all
codex-session-recovery scan --json
```

Use `migrate` to preview or apply a provider migration.

```bash
codex-session-recovery migrate --from openai --to aixj_vip
codex-session-recovery migrate --from openai --to aixj_vip --apply --yes
```

Use `repair-state` when rollout files are correct but `state_5.sqlite` is stale.

```bash
codex-session-recovery repair-state
codex-session-recovery repair-state --apply --yes
```

Use `rollback` with a manifest path or backup directory.

```bash
codex-session-recovery rollback ~/.codex/migration-backups/provider-openai-to-aixj_vip-YYYYMMDD-HHMMSS
codex-session-recovery rollback /path/to/manifest.json --apply --yes
```

Launch the terminal UI when you want a keyboard-driven workflow.

```bash
codex-session-recovery ui
```

Launch the desktop GUI when you want a visual recovery workflow.

```bash
npm run gui
```

## Interactive UI

The `ui` subcommand opens a two-pane terminal screen.

- Use `↑` and `↓` to move through sessions.
- Press `f` to cycle `all`, `visible`, and `hidden` filters.
- Press `m` on a mismatched session to preview migration to the current default provider.
- Press `y` on the preview screen to apply the migration.
- Press `r` to reload after changes.
- Press `q` to quit.

## Desktop GUI

The Electron GUI opens a three-column desktop layout.

- Use the top bar to point at a different `codexHome`, archived mode, provider
  filters, or source filters.
- Browse visible and hidden sessions in the left column.
- Inspect reasons, advisories, rollout paths, and provider drift in the middle
  column.
- Preview and apply migration or repair actions from the action bar.
- Review backups and apply rollback from the right column.

The GUI uses the same Node.js recovery core as the CLI. It launches a helper
bridge with the local Node runtime, so the easiest way to start it is:

```bash
npm install
npm run gui
```

If Node is not on your `PATH`, set `CSR_NODE_BIN` before launching the GUI.

### Desktop packaging

You can prepare desktop build output with these commands:

```bash
npm run dist:mac
npm run dist:win
```

These commands provide Electron build entry points for macOS and Windows. They
do not handle signing, notarization, or auto-update.

## Backup layout

Every write creates a backup under `~/.codex/migration-backups`.

- `manifest.json` stores the operation, thread ids, and restore targets.
- `files/...` stores backed-up rollout files.
- `state/state_5.sqlite` stores the SQLite snapshot.

## Next steps

Start with `scan` or `npm run gui`, then decide whether you need `migrate`,
`repair-state`, or `rollback`.
