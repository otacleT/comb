import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli/app.js';
import { loadChange } from '../src/core/project/load.js';

const ROOT = resolve('bench/order-lifecycle/project');

describe('E3 benchmark project', () => {
  it('is a valid change that adds the 18-requirement order-lifecycle capability', async () => {
    const r = await runCli(['validate', '--change', 'add-order-lifecycle', '--json'], ROOT);
    const env = JSON.parse(r.stdout);
    expect(env.diagnostics).toEqual([]);
    expect(r.code).toBe(0);
    const change = loadChange(ROOT, 'add-order-lifecycle')!;
    const delta = change.deltas[0]!.delta;
    expect(delta.prefix).toBe('ORDER');
    expect(delta.added.map((x) => x.id)).toEqual(Array.from({ length: 18 }, (_, i) => `REQ-ORDER-${String(i + 1).padStart(3, '0')}`));
    expect(delta.addedSections.map((s) => s.heading)).toEqual(['Conventions', 'States', 'Open Questions']);
  });
});
