# Codex Session Recovery CLI

`codex-session-recovery-cli` explains why Codex threads are hidden, previews
safe fixes, rewrites provider metadata when needed, repairs SQLite state drift,
and rolls every write back from a generated backup manifest.

It uses the same local data sources as the Codex sidebar:

- rollout files in `sessions/` and `archived_sessions/`
- `state_5.sqlite`
- provider filtering
- interactive source filtering
- archived state rules

## Why this exists

Codex history can look "missing" for a few different reasons:

- the current provider filter does not match the session provider
- the session source is filtered out
- rollout files and SQLite state drift apart
- archived state is not what the sidebar expects

This project gives you a single recovery workflow for diagnosis, migration,
repair, rollback, terminal UI, and desktop GUI.

## Features

- Sidebar-faithful analysis of rollout files and `state_5.sqlite`
- Hidden-session explanations such as `provider_mismatch`
- Provider migration previews and apply flows
- State DB repair from rollout metadata
- Automatic backups before every write
- Rollback from backup manifest or backup directory
- Terminal UI for keyboard-driven inspection
- Electron GUI for desktop workflows

## Safety model

- Every write operation creates a backup manifest first.
- Rollout files and SQLite state are changed together.
- Rollback is a first-class command, not a manual recovery recipe.
- The tool operates on local files only.

## Requirements

- Node.js 20 or newer
- A local Codex home directory, typically `~/.codex`

## Install

### Run from a clone

```bash
git clone <your-fork-or-repo-url>
cd codex-session-recovery-cli
npm install
node ./src/cli.js --help
```

### Use the wrapper

The wrapper bootstraps dependencies on first run:

```bash
./bin/codex-session-recovery.js --help
```

### Optional local command install

If you want a local shell command while developing:

```bash
npm link
codex-session-recovery --help
```

## Quick start

Inspect what the sidebar would show right now:

```bash
codex-session-recovery scan
```

Preview a provider migration:

```bash
codex-session-recovery migrate --from openai --to aixj_vip --all
```

Apply a provider migration:

```bash
codex-session-recovery migrate --from openai --to aixj_vip --all --apply --yes
```

Repair stale SQLite state from rollout metadata:

```bash
codex-session-recovery repair-state --all --apply --yes
```

Roll back a previous write:

```bash
codex-session-recovery rollback ~/.codex/migration-backups/<backup-dir> --apply --yes
```

## Using this tool with AI

The simplest prompt is often enough:

```text
用codex-session-recovery-cli工具，把会话都迁移到当前账号
```

English version:

```text
Use codex-session-recovery-cli to migrate all sessions to my current account.
```

This project works well with coding agents and chat assistants that can run
shell commands on your machine. A good pattern is:

1. let the AI run `scan` first
2. ask it to explain the hidden reasons
3. ask it to preview `migrate` or `repair-state`
4. only then let it run an `--apply` command

Recommended agent workflow:

- start with read-only commands such as `scan --json`
- ask the AI to summarize what it found before changing anything
- require explicit confirmation before `--apply`
- keep the generated backup manifest so the AI can roll back if needed

Example prompt for Codex or another terminal-capable agent:

```text
Use codex-session-recovery-cli to inspect my Codex history.
First run a scan and explain why sessions are hidden.
Do not apply any writes yet.
If provider mismatch is the main issue, preview the migrate command I should run.
```

Example prompt when you want the AI to repair state drift safely:

```text
Use codex-session-recovery-cli to check whether rollout files and state_5.sqlite
are out of sync. Preview any repair-state changes first, summarize the risks,
and only apply them after showing me the exact command.
```

Example prompt when you already know the migration you want:

```text
Use codex-session-recovery-cli to migrate all sessions from provider openai to
aixj_vip. Show me the preview first. If the plan looks safe, apply it and then
tell me where the backup manifest was written.
```

If your AI assistant cannot execute shell commands directly, ask it to generate
the exact command sequence for you and then run the commands yourself.

When sharing output with an AI system, prefer:

- `scan` summaries over full raw JSON when possible
- redacting sensitive `firstUserMessage`, `cwd`, or local path data
- sharing backup manifest paths instead of full manifest contents

## Command reference

### `scan`

Analyze sidebar visibility using rollout files and `state_5.sqlite`.

```bash
codex-session-recovery scan
codex-session-recovery scan --provider openai --all
codex-session-recovery scan --json
```

### `migrate`

Preview or apply a provider migration across rollout files and state DB rows.

```bash
codex-session-recovery migrate --from openai --to aixj_vip
codex-session-recovery migrate --from openai --to aixj_vip --apply --yes
```

### `repair-state`

Repair stale SQLite state when rollout metadata is the source of truth.

```bash
codex-session-recovery repair-state
codex-session-recovery repair-state --apply --yes
```

### `rollback`

Restore a previous backup manifest or backup directory.

```bash
codex-session-recovery rollback ~/.codex/migration-backups/provider-openai-to-aixj_vip-YYYYMMDD-HHMMSS
codex-session-recovery rollback /path/to/manifest.json --apply --yes
```

### `ui`

Launch the interactive terminal UI.

```bash
codex-session-recovery ui
```

## Interactive UI

The `ui` subcommand opens a two-pane terminal screen.

- `↑` and `↓` move through sessions
- `f` cycles `all`, `visible`, and `hidden`
- `m` previews migration for the selected mismatched session
- `y` applies the previewed migration
- `r` reloads the screen
- `q` quits

## Desktop GUI

The Electron GUI opens a three-column desktop layout.

- Point at a different `codexHome`, archived mode, provider filter, or source
  filter from the top bar
- Browse visible and hidden sessions in the left column
- Inspect reasons, advisories, rollout paths, and provider drift in the middle
  column
- Preview and apply migration or repair actions from the action bar
- Review backups and apply rollback from the right column

Start the GUI with:

```bash
npm run gui
```

If Node is not on your `PATH`, set `CSR_NODE_BIN` before launching the GUI.

## Backup layout

Every write creates a backup under `~/.codex/migration-backups`.

- `manifest.json` stores the operation, thread IDs, and restore targets
- `files/...` stores backed-up rollout files
- `state/state_5.sqlite` stores the SQLite snapshot

## Development

Install dependencies:

```bash
npm install
```

Run the full local verification suite:

```bash
npm run check
```

Available development commands:

```bash
npm test
npm run smoke
npm run gui
npm run dist:mac
npm run dist:win
```

## Testing

The automated test suite covers:

- rollout parsing
- sidebar filtering rules
- provider migration
- state repair
- backup creation
- rollback behavior
- GUI service flows

## Packaging

Desktop build entry points:

```bash
npm run dist:mac
npm run dist:win
```

These commands prepare unsigned build output only. They do not handle signing,
notarization, or auto-update.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, expectations, and PR
guidelines.

## Security

See [SECURITY.md](./SECURITY.md) for reporting guidance and project-specific
safety boundaries.

## License

[MIT](./LICENSE)
