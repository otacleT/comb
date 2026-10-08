import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { docHeader, stampDoc } from '../../core/docs/header.js';
import { loadDocs, type DocsContext } from '../../core/docs/load.js';
import type { DocsStatus } from '../../core/docs/status.js';
import { normalizeText, restoreTextStyle } from '../../core/markdown/text.js';
import { TEMPLATES_DIR } from '../../templates-dir.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

interface StampResult {
  stamped: string[];
  skipped: { path: string; reason: string }[];
}

const describeDocs = (s: DocsStatus): string =>
  [
    `docs (${s.profile}) in ${s.dir}/`,
    ...s.outputs.map((o) => `  ${o.path.padEnd(32)}${o.state}`),
    ...(s.uncovered.length > 0 ? [`not cited by any document: ${s.uncovered.join(', ')}`] : []),
  ].join('\n');

const describeStamp = (r: StampResult): string =>
  [...r.stamped.map((p) => `stamped  ${p}`), ...r.skipped.map((s) => `skipped  ${s.path} (${s.reason})`)].join('\n');

/** Stamps documents written for the current sources (their marker carries that hash). Everything else is left alone. */
function stamp(root: string, docs: DocsContext): StampResult {
  const result: StampResult = { stamped: [], skipped: [] };
  for (const o of docs.status.outputs) {
    const file = join(root, o.path);
    if (o.state === 'missing' || !existsSync(file)) {
      result.skipped.push({ path: o.path, reason: 'missing' });
      continue;
    }
    if (o.state === 'user-owned') {
      result.skipped.push({ path: o.path, reason: 'user-owned' });
      continue;
    }
    const raw = readFileSync(file, 'utf8');
    const header = docHeader(normalizeText(raw));
    if (!header.generated) {
      result.skipped.push({ path: o.path, reason: 'user-owned' });
      continue;
    }
    if (header.hash !== null) {
      result.skipped.push({ path: o.path, reason: header.hash === o.sourceHash ? 'already stamped' : 'stale: rewrite it with /comb:docs first' });
      continue;
    }
    // Only a document written for the sources as they are now may be stamped; anything else would hide staleness.
    if (header.writtenFor !== o.sourceHash) {
      result.skipped.push({
        path: o.path,
        reason: header.writtenFor === null ? 'not written for the current sources: rewrite it with /comb:docs' : 'sources changed since it was written: rewrite it with /comb:docs',
      });
      continue;
    }
    writeFileSync(file, restoreTextStyle(raw, stampDoc(normalizeText(raw), o.sourceHash)));
    result.stamped.push(o.path);
  }
  return result;
}

export function registerDocs(program: Command, ctx: CliContext): void {
  program
    .command('docs [action]')
    .description('check the generated product docs; "comb docs stamp" records the sources of freshly written ones')
    .option('--json', 'JSON output')
    .action((action: string | undefined, opts: { json?: boolean }) => {
      const json = opts.json === true;
      if (action !== undefined && action !== 'stamp') {
        usageError(ctx, 'docs', json, 'USAGE_ERROR', `unknown action "${action}"`, 'Use "comb docs" or "comb docs stamp"');
        return;
      }
      const root = requireRoot(ctx, 'docs', json);
      if (!root) return;
      const { context, diagnostics } = loadDocs(root, TEMPLATES_DIR);
      if (!context) {
        finish(ctx, envelope('docs', null, diagnostics), json, () => '');
        return;
      }
      if (action === 'stamp') {
        finish(ctx, envelope('docs', stamp(root, context), []), json, describeStamp);
        return;
      }
      finish(ctx, envelope('docs', context.status, context.diagnostics), json, describeDocs);
    });
}
