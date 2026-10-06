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
});
