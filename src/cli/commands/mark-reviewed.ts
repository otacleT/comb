import { writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import { diag } from '../../core/diagnostics.js';
import { loadChange } from '../../core/project/load.js';
import { paths, rel } from '../../core/project/paths.js';
import { deltaHash, requirementHashes } from '../../core/workflow/hash.js';
import { stampReview } from '../../core/workflow/review-stamp.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

export function registerMarkReviewed(program: Command, ctx: CliContext): void {
  program
    .command('mark-reviewed')
    .description('record that review.md reflects the current delta')
    .requiredOption('--change <id>', 'change id')
    .option('--json', 'JSON output')
    .action((opts: { change: string; json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'mark-reviewed', json);
      if (!root) return;
      const change = loadChange(root, opts.change);
      if (!change) {
        usageError(ctx, 'mark-reviewed', json, 'CHANGE_NOT_FOUND', `change "${opts.change}" not found`);
        return;
      }
      const path = paths.changeFile(root, change.id, 'review');
      const file = rel(root, path);
      if (change.files.review === undefined) {
        finish(ctx, envelope('mark-reviewed', null, [diag('error', 'REVIEW_MISSING', `${file} does not exist`, { file }, 'Run the review first')]), json, () => '');
        return;
      }
      const reviewed = deltaHash(change);
      const stamped = stampReview(change.files.review, reviewed, requirementHashes(change));
      if (stamped === null) {
        finish(ctx, envelope('mark-reviewed', null, [diag('error', 'SPEC_PARSE', 'review.md has a broken frontmatter', { file, line: 1 })]), json, () => '');
        return;
      }
      writeFileSync(path, stamped);
      finish(ctx, envelope('mark-reviewed', { change: change.id, reviewed }, []), json, (d) => `marked ${file} as reviewed (${d.reviewed})`);
    });
}
