import type { Command } from 'commander';
import { buildInstructions, INSTRUCTION_ARTIFACTS, type InstructionArtifact, type Instructions } from '../../core/instructions/build.js';
import { loadAllChanges, loadProject } from '../../core/project/load.js';
import { TEMPLATES_DIR } from '../../templates-dir.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

const human = (i: Instructions): string =>
  [
    `# ${i.artifact} for ${i.change} → ${i.outputPath}${i.alsoWrite.length > 0 ? ` (also: ${i.alsoWrite.join(', ')})` : ''}`,
    i.instruction.trim(),
    i.rules.length > 0 ? `Rules:\n${i.rules.map((r) => `- ${r}`).join('\n')}` : '',
    `Read first:\n${i.context.readFiles.map((f) => `- ${f}`).join('\n') || '- (none)'}`,
    i.context.openQuestions.length > 0
      ? `Open questions:\n${i.context.openQuestions.map((q) => `- ${q.id} (${q.severity}) ${q.title}`).join('\n')}`
      : '',
    i.lenses.length > 0 ? i.lenses.map((l) => l.definition.trim()).join('\n\n') : '',
    `Next ids: ${JSON.stringify({ ...i.ids.nextRequirement, question: i.ids.nextQuestion, decision: i.ids.nextDecision })}`,
    `Template:\n${i.template.trim()}`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

export function registerInstructions(program: Command, ctx: CliContext): void {
  program
    .command('instructions <artifact>')
    .description(`instructions for an artifact (${INSTRUCTION_ARTIFACTS.join(', ')})`)
    .requiredOption('--change <id>', 'change id')
    .option('--json', 'JSON output')
    .action((artifact: string, opts: { change: string; json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'instructions', json);
      if (!root) return;
      if (!(INSTRUCTION_ARTIFACTS as readonly string[]).includes(artifact)) {
        usageError(ctx, 'instructions', json, 'UNKNOWN_ARTIFACT', `unknown artifact "${artifact}"`, `Use one of: ${INSTRUCTION_ARTIFACTS.join(', ')}`);
        return;
      }
      const all = loadAllChanges(root);
      const change = all.find((c) => c.id === opts.change);
      if (!change) {
        usageError(ctx, 'instructions', json, 'CHANGE_NOT_FOUND', `change "${opts.change}" not found`, 'Create it with "comb new change <id>"');
        return;
      }
      const ins = buildInstructions(artifact as InstructionArtifact, loadProject(root), change, all, TEMPLATES_DIR);
      finish(ctx, envelope('instructions', ins, []), json, human);
    });
}
