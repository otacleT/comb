import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { diag, type Diagnostic } from '../diagnostics.js';
import { restoreTextStyle } from '../markdown/text.js';
import type { ArchivePlan } from './archive-plan.js';

const TMP = '.comb-tmp';

/**
 * DESIGN §5.3 step 7: write every file to a temp file, move the change folder into the archive,
 * then rename the temp files into place. If anything fails before the move, the canonical files are untouched.
 */
export function executeArchive(root: string, plan: ArchivePlan): Diagnostic[] {
  const abs = (file: string): string => join(root, file);
  if (existsSync(abs(plan.to))) {
    return [diag('error', 'ARCHIVE_TARGET_EXISTS', `${plan.to} already exists`, { file: plan.to }, 'Move or remove that folder, then archive again')];
  }
  const temps: string[] = [];
  try {
    for (const w of plan.writes) {
      const target = abs(w.file);
      const raw = existsSync(target) ? readFileSync(target, 'utf8') : null;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(`${target}${TMP}`, raw === null ? w.text : restoreTextStyle(raw, w.text));
      temps.push(`${target}${TMP}`);
    }
    mkdirSync(dirname(abs(plan.to)), { recursive: true });
    renameSync(abs(plan.from), abs(plan.to));
  } catch (e) {
    for (const t of temps) rmSync(t, { force: true });
    throw e;
  }
  const moved = (file: string): string => (file.startsWith(`${plan.from}/`) ? `${plan.to}${file.slice(plan.from.length)}` : file);
  for (const w of plan.writes) renameSync(`${abs(moved(w.file))}${TMP}`, abs(moved(w.file)));
  return [];
}
