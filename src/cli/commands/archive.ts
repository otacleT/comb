import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { executeArchive } from '../../core/change/archive-execute.js';
import { planArchive, type ArchivePlan, type CapabilitySummary } from '../../core/change/archive-plan.js';
import { loadAllChanges, loadProject } from '../../core/project/load.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

export interface ArchiveSummary {
  change: string;
  archivedTo: string;
  decisions: { local: string; permanent: string }[];
  capabilities: CapabilitySummary[];
  files: string[];
  /** False when the change folder moved but a canonical file could not be replaced (see the ARCHIVE_IO_FAILED diagnostic). */
  complete: boolean;
}

const summarize = (plan: ArchivePlan, complete: boolean): ArchiveSummary => ({
  change: plan.change,
  archivedTo: plan.to,
  decisions: plan.decisions,
  capabilities: plan.capabilities,
  files: plan.writes.map((w) => (w.file.startsWith(`${plan.from}/`) ? `${plan.to}${w.file.slice(plan.from.length)}` : w.file)),
  complete,
});

const human = (id: string) => (d: ArchiveSummary | null): string => {
  if (!d) return `not archived: ${id}`;
  const caps = d.capabilities.map((c) => {
    const parts = [...c.added.map((x) => `+${x}`), ...c.modified.map((x) => `~${x}`), ...c.removed.map((x) => `-${x}`), ...c.sections.map((s) => `§${s}`)];
    return `${c.capability}${c.created ? ' (new)' : ''}: ${parts.join(' ')}`;
  });
  const decisions = d.decisions.length > 0 ? [`decisions: ${d.decisions.map((x) => `${x.local} → ${x.permanent}`).join(', ')}`] : [];
  const headline = d.complete ? `archived ${d.change} → ${d.archivedTo}` : `archive incomplete: ${d.change} was moved to ${d.archivedTo}, but not every file was replaced (see below)`;
  return [headline, ...caps, ...decisions].join('\n');
};

export function registerArchive(program: Command, ctx: CliContext): void {
  program
    .command('archive <id>')
    .description('merge a change into the specs and the decision log, then move it to changes/archive')
    .option('--yes', 'archive with unfinished tasks or without a review')
    .option('--allow-dropped-scenarios', 'accept MODIFIED requirements that drop scenarios')
    .option('--allow-base-drift', 'accept requirements that changed in the spec after the proposal')
    .option('--json', 'JSON output')
    .action((id: string, opts: { yes?: boolean; allowDroppedScenarios?: boolean; allowBaseDrift?: boolean; json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'archive', json);
      if (!root) return;
      const all = loadAllChanges(root);
      const change = all.find((c) => c.id === id);
      if (!change) {
        usageError(ctx, 'archive', json, 'CHANGE_NOT_FOUND', `change "${id}" not found`, 'Archived changes are in comb/changes/archive/');
        return;
      }
      const options = { yes: opts.yes === true, allowDroppedScenarios: opts.allowDroppedScenarios === true, allowBaseDrift: opts.allowBaseDrift === true };
      const { plan, diagnostics } = planArchive(loadProject(root), change, all, options, ctx.today());
      if (!plan) {
        finish(ctx, envelope<ArchiveSummary | null>('archive', null, diagnostics), json, human(id));
        return;
      }
      const failed = executeArchive(root, plan);
      // After the folder has moved, report what was done even if a later rename failed: the decision ids are needed to recover.
      const moved = existsSync(join(root, plan.to)) && !existsSync(join(root, plan.from));
      const data = failed.length === 0 ? summarize(plan, true) : moved ? summarize(plan, false) : null;
      finish(ctx, envelope<ArchiveSummary | null>('archive', data, [...diagnostics, ...failed]), json, human(id));
    });
}
