import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readJson = (p: string): Record<string, any> => JSON.parse(readFileSync(p, 'utf8'));

const minVersion = (range: string | undefined): number[] | null => {
  const m = range ? />=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range) : null;
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
};

const compare = (a: number[], b: number[]): number => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;

describe('package.json', () => {
  it('declares a Node floor that every runtime dependency supports', () => {
    const pkg = readJson('package.json');
    const ours = minVersion(pkg.engines.node);
    expect(ours).not.toBeNull();
    for (const dep of Object.keys(pkg.dependencies)) {
      const theirs = minVersion(readJson(`node_modules/${dep}/package.json`).engines?.node);
      if (theirs) expect(compare(ours!, theirs), `${dep} needs node >=${theirs.join('.')}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('is @otaclet/comb 0.1.0 with a changelog entry, a license and a build before packing', () => {
    const pkg = readJson('package.json');
    expect(pkg.name).toBe('@otaclet/comb');
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.scripts.prepack).toContain('npm run build');
    expect(pkg.publishConfig).toEqual({ access: 'public' });
    expect(readFileSync('CHANGELOG.md', 'utf8')).toContain('## 0.1.0');
    expect(readFileSync('LICENSE', 'utf8')).toContain('MIT License');
  });

  it('packs only the CLI, the templates and the files a user reads', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const files: string[] = JSON.parse(out.slice(out.indexOf('[')))[0].files.map((f: { path: string }) => f.path);
    const allowed = /^(dist\/|templates\/|package\.json$|README\.md$|LICENSE$|CHANGELOG\.md$)/;
    expect(files.filter((f) => !allowed.test(f))).toEqual([]);
    for (const f of ['templates/skills/archive.md', 'templates/lenses/formalization.md', 'LICENSE', 'CHANGELOG.md', 'README.md']) {
      expect(files).toContain(f);
    }
  }, 30000);

  it('does not pack source maps and cleans dist before building', () => {
    const pkg = readJson('package.json');
    expect(pkg.scripts.prepack).toContain('rmSync');
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const files: string[] = JSON.parse(out.slice(out.indexOf('[')))[0].files.map((f: { path: string }) => f.path);
    expect(files.filter((f) => f.endsWith('.map'))).toEqual([]);
  }, 30000);
});
