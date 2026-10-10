import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import { AGENTS } from '../../agents/registry.js';
import { diag } from '../../core/diagnostics.js';
import { initProject, type InitResult } from '../../core/project/init.js';
import { loadProject } from '../../core/project/load.js';
import { paths } from '../../core/project/paths.js';
import { TEMPLATES_DIR } from '../../templates-dir.js';
import { VERSION } from '../../version.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, usageError } from './shared.js';

export const describeInit = (r: InitResult): string =>
  [
    ...r.created.map((f) => `created  ${f}`),
    ...r.updated.map((f) => `updated  ${f}`),
    ...r.skipped.map((f) => `kept     ${f}`),
    ...r.modified.map((f) => `kept     ${f} (edited by you; not updated)`),
    ...r.newer.map((f) => `kept     ${f} (made by a newer comb; upgrade comb to update it)`),
  ].join('\n');

export function registerInit(program: Command, ctx: CliContext): void {
  program
    .command('init')
    .description('set up comb/ and agent skills in the current directory')
    .option('--language <lang>', 'language of artifact prose (default: en)')
    .option('--agent <id>', 'agent to install skills for', 'claude-code')
    .option('--json', 'JSON output')
    .action((opts: { language?: string; agent: string; json?: boolean }) => {
      const json = opts.json === true;
      const agent = AGENTS[opts.agent];
      if (!agent) {
        usageError(ctx, 'init', json, 'UNKNOWN_AGENT', `unknown agent "${opts.agent}"`, `Use one of: ${Object.keys(AGENTS).join(', ')}`);
        return;
      }
      // init never overwrites the config, so a --language that differs from it would otherwise be dropped silently.
      const kept = existsSync(paths.config(ctx.cwd)) ? loadProject(ctx.cwd).config.language : null;
      const diagnostics =
        opts.language !== undefined && kept !== null && kept !== opts.language
          ? [diag('warning', 'CONFIG_KEPT', `comb/config.yaml already exists, so --language ${opts.language} was not applied (it has language: ${kept})`,
              { file: 'comb/config.yaml' }, 'Change "language" in comb/config.yaml')]
          : [];
      const result = initProject(ctx.cwd, { language: opts.language ?? 'en', version: VERSION, templatesDir: TEMPLATES_DIR, agents: [agent] });
      finish(ctx, envelope('init', result, diagnostics), json, (r) =>
        `${describeInit(r)}\n\nNext: open Claude Code here and run /comb:propose <idea> (or /comb:explore to think the idea through first).`);
    });
}
