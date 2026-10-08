import type { Command } from 'commander';
import { AGENTS } from '../../agents/registry.js';
import { hasErrors } from '../../core/diagnostics.js';
import { loadProject } from '../../core/project/load.js';
import { updateAgentFiles } from '../../core/project/init.js';
import { TEMPLATES_DIR } from '../../templates-dir.js';
import { VERSION } from '../../version.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { describeInit } from './init.js';
import { finish, requireRoot, usageError } from './shared.js';

export function registerUpdate(program: Command, ctx: CliContext): void {
  program
    .command('update')
    .description('regenerate the agent skills and commands for the installed comb version')
    .option('--json', 'JSON output')
    .action((opts: { json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'update', json);
      if (!root) return;
      const project = loadProject(root);
      if (hasErrors(project.diagnostics)) {
        finish(ctx, envelope('update', null, project.diagnostics), json, () => '');
        return;
      }
      const unknown = project.config.agents.find((id) => AGENTS[id] === undefined);
      if (unknown !== undefined) {
        usageError(ctx, 'update', json, 'UNKNOWN_AGENT', `unknown agent "${unknown}" in comb/config.yaml`, `Use one of: ${Object.keys(AGENTS).join(', ')}`);
        return;
      }
      const agents = project.config.agents.map((id) => AGENTS[id]!);
      const describe = agents.length === 0 ? () => 'no agents configured in comb/config.yaml (agents: [])' : describeInit;
      finish(ctx, envelope('update', updateAgentFiles(root, { version: VERSION, templatesDir: TEMPLATES_DIR, agents }), []), json, describe);
    });
}
