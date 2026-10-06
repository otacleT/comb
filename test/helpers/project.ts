import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'comb-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const p = join(root, relPath);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}
