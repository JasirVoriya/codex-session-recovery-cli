import { Command } from 'commander';

import { runMigrate } from './commands/migrate.js';
import { runRepairState } from './commands/repair-state.js';
import { runRollback } from './commands/rollback.js';
import { runScan } from './commands/scan.js';
import { runUi } from './commands/ui.js';

function collectValues(value, previous = []) {
  previous.push(value);
  return previous;
}

function applySharedOptions(command) {
  return command.option('--codex-home <path>', 'override Codex home directory');
}

function deriveArchivedMode(options) {
  if (options.all) {
    return 'all';
  }
  if (options.archived) {
    return 'archived';
  }
  return 'active';
}

const program = new Command();
program
  .name('codex-session-recovery')
  .description('Analyze and repair Codex sidebar history using the real rollout + state DB rules.')
  .version('0.1.0');

applySharedOptions(
  program
    .command('scan')
    .description('Analyze sidebar visibility using rollout files and state_5.sqlite.')
    .option('--provider <provider>', 'filter by provider', collectValues, [])
    .option('--source-kind <kind>', 'filter by source kind', collectValues, [])
    .option('--archived', 'scan archived threads only')
    .option('--all', 'scan both active and archived threads')
    .option('--limit <count>', 'limit displayed sessions', (value) => Number.parseInt(value, 10), 30)
    .option('--json', 'print machine-readable JSON')
    .action(async (options) => {
      await runScan({
        codexHome: options.codexHome,
        modelProviders: options.provider.length > 0 ? options.provider : null,
        sourceKinds: options.sourceKind.length > 0 ? options.sourceKind : null,
        archivedMode: deriveArchivedMode(options),
        limit: options.limit,
        json: Boolean(options.json)
      });
    })
);

applySharedOptions(
  program
    .command('migrate')
    .description('Preview or apply a provider migration across rollout files and state DB.')
    .requiredOption('--from <provider>', 'source provider')
    .requiredOption('--to <provider>', 'target provider')
    .option('--thread <id>', 'limit migration to specific thread id', collectValues, [])
    .option('--archived', 'include archived threads only')
    .option('--all', 'include both active and archived threads')
    .option('--apply', 'perform the migration instead of dry-run preview')
    .option('--yes', 'skip confirmation prompt')
    .option('--json', 'print machine-readable JSON')
    .action(async (options) => {
      await runMigrate({
        codexHome: options.codexHome,
        fromProvider: options.from,
        toProvider: options.to,
        threadIds: options.thread,
        archivedMode: deriveArchivedMode(options),
        apply: Boolean(options.apply),
        yes: Boolean(options.yes),
        json: Boolean(options.json)
      });
    })
);

applySharedOptions(
  program
    .command('repair-state')
    .description('Repair state_5.sqlite from rollout metadata and current sidebar rules.')
    .option('--thread <id>', 'limit repair to specific thread id', collectValues, [])
    .option('--archived', 'repair archived threads only')
    .option('--all', 'repair both active and archived threads')
    .option('--apply', 'write state DB changes')
    .option('--yes', 'skip confirmation prompt')
    .option('--json', 'print machine-readable JSON')
    .action(async (options) => {
      await runRepairState({
        codexHome: options.codexHome,
        threadIds: options.thread,
        archivedMode: deriveArchivedMode(options),
        apply: Boolean(options.apply),
        yes: Boolean(options.yes),
        json: Boolean(options.json)
      });
    })
);

applySharedOptions(
  program
    .command('rollback <manifestOrDir>')
    .description('Preview or restore a previous backup manifest.')
    .option('--apply', 'restore files from backup')
    .option('--yes', 'skip confirmation prompt')
    .option('--json', 'print machine-readable JSON')
    .action(async (manifestOrDir, options) => {
      await runRollback({
        codexHome: options.codexHome,
        manifestOrDir,
        apply: Boolean(options.apply),
        yes: Boolean(options.yes),
        json: Boolean(options.json)
      });
    })
);

applySharedOptions(
  program
    .command('ui')
    .description('Launch the interactive terminal UI for session browsing and migration preview.')
    .action(async (options) => {
      await runUi({ codexHome: options.codexHome });
    })
);

program.parseAsync(process.argv).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
