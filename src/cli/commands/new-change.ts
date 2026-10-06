import type { Command } from 'commander';
import { createChange } from '../../core/change/new-change.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot } from './shared.js';

export function registerNewChange(program: Command, ctx: CliContext): void {
  const group = program.command('new').description('create Comb objects');
  group
    .command('change <id>')
    .description('create a change folder with .comb.yaml')
    .option('--json', 'JSON output')
    .action((id: string, opts: { json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'new change', json);
      if (!root) return;
      const { path, diagnostics } = createChange(root, id, ctx.today());
      finish(ctx, envelope('new change', { change: id, path }, diagnostics), json, (d) => (d.path ? `created ${d.path}` : ''));
    });
}
