import type { Command } from 'commander';
import { validateChange } from '../../core/change/validate-change.js';
import { loadAllChanges, loadProject } from '../../core/project/load.js';
import { computeStatus, type ChangeStatus } from '../../core/workflow/status.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

const detailOf = (s: ChangeStatus): string =>
  [
    ...s.artifacts.map((a) => `${a.id.padEnd(9)}${a.state}${a.detail ? ` (${a.detail})` : ''}`),
    `next: ${s.next}`,
  ].join('\n');

export function registerStatus(program: Command, ctx: CliContext): void {
  program
    .command('status')
    .description('show artifact states and the next step')
    .option('--change <id>', 'one change in detail')
    .option('--json', 'JSON output')
    .action((opts: { change?: string; json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'status', json);
      if (!root) return;
      const project = loadProject(root);
      const all = loadAllChanges(root);
      const statusOf = (id: string): ChangeStatus | null => {
        const c = all.find((x) => x.id === id);
        return c ? computeStatus(c, validateChange(project, c, all)) : null;
      };
      if (opts.change !== undefined) {
        const s = statusOf(opts.change);
        if (!s) {
          usageError(ctx, 'status', json, 'CHANGE_NOT_FOUND', `change "${opts.change}" not found`);
          return;
        }
        finish(ctx, envelope('status', s, []), json, detailOf);
        return;
      }
      const list = all.map((c) => statusOf(c.id) as ChangeStatus);
      finish(ctx, envelope('status', list, []), json, (l) =>
        l.length === 0 ? 'no active changes' : l.map((s) => `${s.change}  next: ${s.next}`).join('\n'),
      );
    });
}
