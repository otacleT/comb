import type { Command } from 'commander';
import { listArchivedIds, loadAllChanges, loadProject } from '../../core/project/load.js';
import { listProject, type ListData } from '../../core/project/lookup.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot } from './shared.js';

const human = (d: ListData): string => {
  const lines: string[] = [];
  for (const s of d.specs) {
    lines.push(`${s.capability} (${s.prefix ?? '?'}) — ${s.requirements.length} requirement(s)`);
    for (const r of s.requirements) lines.push(`  ${r.id} ${r.title}`);
  }
  if (d.decisions.length > 0) {
    lines.push('decisions:', ...d.decisions.map((x) => `  ${x.id} ${x.title}${x.supersededBy ? ` (superseded by ${x.supersededBy})` : ''}`));
  }
  lines.push(`changes: ${d.changes.join(', ') || '(none)'}`);
  if (d.archived.length > 0) lines.push(`archived: ${d.archived.join(', ')}`);
  return lines.join('\n');
};

export function registerList(program: Command, ctx: CliContext): void {
  program
    .command('list')
    .description('list capabilities with their requirements, decisions and changes')
    .option('--json', 'JSON output')
    .action((opts: { json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'list', json);
      if (!root) return;
      finish(ctx, envelope('list', listProject(loadProject(root), loadAllChanges(root), listArchivedIds(root)), []), json, human);
    });
}
