import type { Command } from 'commander';
import { buildInstructions, INSTRUCTION_ARTIFACTS, type InstructionArtifact, type Instructions } from '../../core/instructions/build.js';
import { loadDocs } from '../../core/docs/load.js';
import { buildDocsInstructions, type DocsInstructions } from '../../core/instructions/docs.js';
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

const describeDocsInstructions = (i: DocsInstructions): string =>
  [
    `# docs (${i.profile}) → ${i.dir}/`,
    i.instruction.trim(),
    `Outputs:\n${i.outputs.map((o) => `- ${o.path} (${o.state}): ${o.audience}`).join('\n')}`,
    `Read first:\n${i.context.readFiles.map((f) => `- ${f}`).join('\n') || '- (none)'}`,
    i.discipline.trim(),
  ].join('\n\n');

export function registerInstructions(program: Command, ctx: CliContext): void {
  program
    .command('instructions <artifact>')
    .description(`instructions for an artifact (${[...INSTRUCTION_ARTIFACTS, 'docs'].join(', ')})`)
    .option('--change <id>', 'change id (every artifact except docs)')
    .option('--json', 'JSON output')
    .action((artifact: string, opts: { change?: string; json?: boolean }) => {
      const json = opts.json === true;
      if (artifact !== 'docs' && !(INSTRUCTION_ARTIFACTS as readonly string[]).includes(artifact)) {
        usageError(ctx, 'instructions', json, 'UNKNOWN_ARTIFACT', `unknown artifact "${artifact}"`, `Use one of: ${[...INSTRUCTION_ARTIFACTS, 'docs'].join(', ')}`);
        return;
      }
      // Argument errors come before looking for the project (as with commander's own checks).
      if (artifact !== 'docs' && opts.change === undefined) {
        usageError(ctx, 'instructions', json, 'USAGE_ERROR', `--change <id> is required for ${artifact}`, `comb instructions ${artifact} --change <id>`);
        return;
      }
      const root = requireRoot(ctx, 'instructions', json);
      if (!root) return;
      if (artifact === 'docs') {
        const { context, diagnostics } = loadDocs(root, TEMPLATES_DIR);
        if (!context) {
          finish(ctx, envelope('instructions', null, diagnostics), json, () => '');
          return;
        }
        finish(ctx, envelope('instructions', buildDocsInstructions(context, TEMPLATES_DIR), []), json, describeDocsInstructions);
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
