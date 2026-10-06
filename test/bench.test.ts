import { readFileSync } from 'node:fs';
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

describe('subscription-billing benchmark project', () => {
  const root = resolve('bench/subscription-billing/project');

  it('is a valid change that adds the subscription-billing capability', async () => {
    const r = await runCli(['validate', '--change', 'add-subscription-billing', '--json'], root);
    expect(JSON.parse(r.stdout).diagnostics).toEqual([]);
    expect(r.code).toBe(0);
    const delta = loadChange(root, 'add-subscription-billing')!.deltas[0]!.delta;
    expect(delta.prefix).toBe('SUB');
    expect(delta.added.length).toBeGreaterThanOrEqual(12);
  });

  it('has an answer key and a pass bar of at least 70% of it', () => {
    const keys = [...readFileSync('bench/subscription-billing/expected-highs.md', 'utf8').matchAll(/^\|\s*(SB-\d+)\s*\|/gm)];
    const { pass } = JSON.parse(readFileSync('bench/subscription-billing/bench.json', 'utf8'));
    expect(keys.length).toBeGreaterThanOrEqual(5);
    expect(pass).toBe(Math.ceil(keys.length * 0.7));
  });
});
