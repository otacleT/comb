import type { Command } from 'commander';
import { recordBase } from '../../core/change/base.js';
import { validateChange, validateProject } from '../../core/change/validate-change.js';
import { loadAllChanges, loadProject } from '../../core/project/load.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

export function registerValidate(program: Command, ctx: CliContext): void {
  program
    .command('validate')
    .description('check specs and changes')
    .option('--change <id>', 'only this change')
    .option('--json', 'JSON output')
    .action((opts: { change?: string; json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'validate', json);
      if (!root) return;
      const project = loadProject(root);
      const all = loadAllChanges(root);
      let targets = all;
      if (opts.change !== undefined) {
        const one = all.find((c) => c.id === opts.change);
        if (!one) {
          usageError(ctx, 'validate', json, 'CHANGE_NOT_FOUND', `change "${opts.change}" not found`);
          return;
        }
        targets = [one];
      }
      const diagnostics = validateProject(project);
      for (const c of targets) diagnostics.push(...validateChange(project, c, all));
      const baseRecorded = opts.change !== undefined && targets[0] ? recordBase(project, targets[0]) : [];
      const data = { specs: project.specs.size, changes: targets.map((c) => c.id), baseRecorded };
      finish(ctx, envelope('validate', data, diagnostics), json, (d) => `checked ${d.specs} spec(s), ${d.changes.length} change(s)`);
    });
}
