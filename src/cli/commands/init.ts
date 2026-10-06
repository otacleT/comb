import type { Command } from 'commander';
import { AGENTS } from '../../agents/registry.js';
import { initProject, type InitResult } from '../../core/project/init.js';
import { TEMPLATES_DIR } from '../../templates-dir.js';
import { VERSION } from '../../version.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, usageError } from './shared.js';

const human = (r: InitResult): string =>
  [
    ...r.created.map((f) => `created  ${f}`),
    ...r.updated.map((f) => `updated  ${f}`),
    ...r.skipped.map((f) => `kept     ${f}`),
    ...r.modified.map((f) => `kept     ${f} (edited by you; not updated)`),
  ].join('\n');

export function registerInit(program: Command, ctx: CliContext): void {
  program
    .command('init')
    .description('set up comb/ and agent skills in the current directory')
    .option('--language <lang>', 'language of artifact prose', 'en')
    .option('--agent <id>', 'agent to install skills for', 'claude-code')
    .option('--json', 'JSON output')
    .action((opts: { language: string; agent: string; json?: boolean }) => {
      const json = opts.json === true;
      const agent = AGENTS[opts.agent];
      if (!agent) {
        usageError(ctx, 'init', json, 'UNKNOWN_AGENT', `unknown agent "${opts.agent}"`, `Use one of: ${Object.keys(AGENTS).join(', ')}`);
        return;
      }
      const result = initProject(ctx.cwd, { language: opts.language, version: VERSION, templatesDir: TEMPLATES_DIR, agents: [agent] });
      finish(ctx, envelope('init', result, []), json, human);
    });
}
