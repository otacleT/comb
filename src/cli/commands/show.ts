import type { Command } from 'commander';
import { validateChange } from '../../core/change/validate-change.js';
import { loadAllChanges, loadProject } from '../../core/project/load.js';
import { showItem, type ShowData } from '../../core/project/lookup.js';
import { computeStatus } from '../../core/workflow/status.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';
import { describeStatus } from './status.js';

const human = (d: ShowData): string => {
  if (d.kind === 'change') return [d.id, ...d.files.map((f) => `  ${f}`), describeStatus(d.status)].join('\n');
  const notes = [
    `${d.file}:${d.line}`,
    ...(d.kind === 'requirement' && d.pendingChanges.length > 0 ? [`changed by ${d.pendingChanges.join(', ')}`] : []),
    ...(d.kind === 'decision' && d.supersededBy ? [`superseded by ${d.supersededBy}`] : []),
  ];
  return `${d.text}\n\n(${notes.join('; ')})`;
};

export function registerShow(program: Command, ctx: CliContext): void {
  program
    .command('show <id>')
    .description('show a requirement (REQ-…), a decision (D-NNN) or a change by id')
    .option('--json', 'JSON output')
    .action((key: string, opts: { json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'show', json);
      if (!root) return;
      const project = loadProject(root);
      const all = loadAllChanges(root);
      const item = showItem(project, all, key, (c) => computeStatus(c, validateChange(project, c, all)));
      if (!item) {
        usageError(ctx, 'show', json, 'ID_NOT_FOUND', `nothing found for "${key}"`,
          'Use a requirement id (REQ-…), a decision id from comb/decisions.md (D-NNN) or an active change id');
        return;
      }
      finish(ctx, envelope('show', item, []), json, human);
    });
}
