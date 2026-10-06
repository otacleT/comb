import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { readyProject } from '../helpers/archive.js';

const json = async (args: string[], root: string) => {
  const r = await runCli([...args, '--json'], root, { today: () => '2026-10-06' });
  return { code: r.code, env: JSON.parse(r.stdout) };
};

describe('comb list / show', () => {
  it('lists capabilities with their requirements, the decisions and the changes', async () => {
    const { code, env } = await json(['list'], readyProject());
    expect(code).toBe(0);
    expect(env.data).toEqual({
      specs: [
        {
          capability: 'order-lifecycle',
          prefix: 'ORDER',
          file: 'comb/specs/order-lifecycle/spec.md',
          requirements: [
            { id: 'REQ-ORDER-001', title: '注文の作成' },
            { id: 'REQ-ORDER-002', title: 'Payment' },
          ],
        },
      ],
      decisions: [{ id: 'D-021', title: 'Price is fixed when the order is created', supersededBy: null }],
      changes: ['tighten-payment'],
      archived: [],
    });
  });

  it('lists archived changes after an archive', async () => {
    const root = readyProject();
    await runCli(['archive', 'tighten-payment'], root, { today: () => '2026-10-06' });
    const { env } = await json(['list'], root);
    expect(env.data.changes).toEqual([]);
    expect(env.data.archived).toEqual(['2026-10-06-tighten-payment']);
    expect(env.data.decisions.map((d: { id: string }) => d.id)).toEqual(['D-021', 'D-022']);
  });

  it('shows a requirement with the changes that modify it', async () => {
    const { env } = await json(['show', 'REQ-ORDER-002'], readyProject());
    expect(env.data).toMatchObject({ kind: 'requirement', capability: 'order-lifecycle', title: 'Payment', pendingChanges: ['tighten-payment'] });
    expect(env.data.text).toContain('Pay within 3 days.');
  });

  it('shows a decision and a change', async () => {
    const root = readyProject();
    expect((await json(['show', 'D-021'], root)).env.data).toMatchObject({
      kind: 'decision',
      file: 'comb/decisions.md',
      title: 'Price is fixed when the order is created',
      supersededBy: null,
    });
    const change = (await json(['show', 'tighten-payment'], root)).env.data;
    expect(change.kind).toBe('change');
    expect(change.status.next).toBe('archive');
    expect(change.files).toContain('comb/changes/tighten-payment/review.md');
  });

  it('fails with ID_NOT_FOUND (exit 2), also for a heading inside a code fence', async () => {
    const { code, env } = await json(['show', 'REQ-ORDER-999'], readyProject());
    expect(code).toBe(2);
    expect(env.diagnostics[0].code).toBe('ID_NOT_FOUND');
  });
});
