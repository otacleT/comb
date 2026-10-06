import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { diag, type Diagnostic } from '../diagnostics.js';
import type { ChangeMeta } from '../project/load.js';
import { paths, rel } from '../project/paths.js';

export const CHANGE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createChange(root: string, id: string, today: string): { path: string | null; diagnostics: Diagnostic[] } {
  if (!CHANGE_ID_RE.test(id) || id === 'archive') {
    return {
      path: null,
      diagnostics: [diag('error', 'CHANGE_ID_INVALID', `invalid change id "${id}"`, undefined, 'Use kebab-case, e.g. add-auto-cancel')],
    };
  }
  const dir = paths.change(root, id);
  if (existsSync(dir)) {
    return { path: null, diagnostics: [diag('error', 'CHANGE_EXISTS', `change "${id}" already exists`, { file: rel(root, dir) })] };
  }
  mkdirSync(join(dir, 'specs'), { recursive: true });
  const meta: ChangeMeta = { schema: 'comb.change/v1', id, created: today, base: {} };
  writeFileSync(paths.changeMeta(root, id), stringify(meta));
  return { path: rel(root, dir), diagnostics: [] };
}
