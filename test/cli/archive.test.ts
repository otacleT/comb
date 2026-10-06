import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { readyProject, stampReviewed, TIGHTEN_DELTA } from '../helpers/archive.js';
import { DECISIONS_MD, ORDER_SPEC } from '../helpers/fixtures.js';

const today = () => '2026-10-06';
const SPEC = 'comb/specs/order-lifecycle/spec.md';
const ARCHIVED = 'comb/changes/archive/2026-10-06-tighten-payment';
const read = (root: string, p: string) => readFileSync(join(root, p), 'utf8');
const codes = (stdout: string) => (JSON.parse(stdout).diagnostics as { code: string }[]).map((d) => d.code);

describe('comb archive', () => {
  it('merges the change, assigns permanent ids and moves the change folder', async () => {
    const root = readyProject();
    const r = await runCli(['archive', 'tighten-payment', '--json'], root, { today });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).data).toMatchObject({
      change: 'tighten-payment',
      archivedTo: ARCHIVED,
      decisions: [{ local: 'D-1', permanent: 'D-022' }],
    });
    expect(read(root, SPEC)).toContain('Pay within 2 days (D-022).');
    expect(read(root, 'comb/decisions.md')).toContain('## D-022: Payment window is two days');
    expect(existsSync(join(root, 'comb/changes/tighten-payment'))).toBe(false);
    expect(read(root, `${ARCHIVED}/specs/order-lifecycle/spec.md`)).toContain('(D-022)');
    expect(read(root, `${ARCHIVED}/questions.md`)).toContain('- **Decision:** D-022');
    expect(existsSync(join(root, ARCHIVED, 'review.md'))).toBe(true);
    expect(existsSync(join(root, `${ARCHIVED}/questions.md.comb-tmp`))).toBe(false);
    expect((await runCli(['validate'], root)).code).toBe(0);
  });

  it('is a no-op when run again', async () => {
    const root = readyProject();
    await runCli(['archive', 'tighten-payment'], root, { today });
    const spec = read(root, SPEC);
    const log = read(root, 'comb/decisions.md');
    const again = await runCli(['archive', 'tighten-payment', '--json'], root, { today });
    expect(again.code).toBe(2);
    expect(codes(again.stdout)).toEqual(['CHANGE_NOT_FOUND']);
    expect(read(root, SPEC)).toBe(spec);
    expect(read(root, 'comb/decisions.md')).toBe(log);
  });

  it('produces the same bytes for the same input', async () => {
    const a = readyProject();
    const b = readyProject();
    expect((await runCli(['archive', 'tighten-payment'], a, { today })).code).toBe(0);
    expect((await runCli(['archive', 'tighten-payment'], b, { today })).code).toBe(0);
    expect(read(a, SPEC)).toBe(read(b, SPEC));
    expect(read(a, 'comb/decisions.md')).toBe(read(b, 'comb/decisions.md'));
  });

  it('writes nothing when blocked', async () => {
    const root = readyProject({ 'comb/changes/tighten-payment/tasks.md': '- [ ] 1.1 not yet\n' });
    const r = await runCli(['archive', 'tighten-payment', '--json'], root, { today });
    expect(r.code).toBe(1);
    expect(codes(r.stdout)).toEqual(['ARCHIVE_BLOCKED']);
    expect(read(root, SPEC)).toBe(ORDER_SPEC);
    expect(read(root, 'comb/decisions.md')).toBe(DECISIONS_MD);
    expect(existsSync(join(root, 'comb/changes/tighten-payment'))).toBe(true);
  });

  it('refuses to overwrite an existing archive folder', async () => {
    const root = readyProject();
    mkdirSync(join(root, ARCHIVED), { recursive: true });
    const r = await runCli(['archive', 'tighten-payment', '--json'], root, { today });
    expect(r.code).toBe(1);
    expect(codes(r.stdout)).toEqual(['ARCHIVE_TARGET_EXISTS']);
    expect(read(root, SPEC)).toBe(ORDER_SPEC);
    expect(existsSync(join(root, `${SPEC}.comb-tmp`))).toBe(false);
  });

  it('keeps the BOM and CRLF line endings of an existing spec', async () => {
    const root = readyProject({ [SPEC]: `\uFEFF${ORDER_SPEC.replace(/\n/g, '\r\n')}` });
    expect((await runCli(['archive', 'tighten-payment'], root, { today })).code).toBe(0);
    const raw = read(root, SPEC);
    expect(raw.startsWith('\uFEFF')).toBe(true);
    expect(raw.replace(/\r\n/g, '')).not.toContain('\n');
    expect(raw).toContain('Pay within 2 days (D-022).\r\n');
    expect(raw.slice(0, raw.indexOf('### Requirement: REQ-ORDER-002'))).toBe(
      `\uFEFF${ORDER_SPEC.slice(0, ORDER_SPEC.indexOf('### Requirement: REQ-ORDER-002')).replace(/\n/g, '\r\n')}`,
    );
  });

  it('detects a spec that moved under another change (BASE_DRIFT)', async () => {
    const root = readyProject({
      'comb/changes/relax-payment/.comb.yaml': 'schema: comb.change/v1\nid: relax-payment\ncreated: 2026-10-06\nbase: {}\n',
      'comb/changes/relax-payment/specs/order-lifecycle/spec.md': TIGHTEN_DELTA.replace('Pay within 2 days (D-1).', 'Pay within 5 days.'),
      'comb/changes/relax-payment/tasks.md': '- [x] 1.1 Relax the payment window (REQ-ORDER-002)\n',
    });
    stampReviewed(root, 'relax-payment');
    expect((await runCli(['validate', '--change', 'relax-payment'], root, { today })).code).toBe(0);
    expect((await runCli(['archive', 'tighten-payment'], root, { today })).code).toBe(0);
    expect(codes((await runCli(['validate', '--change', 'relax-payment', '--json'], root, { today })).stdout)).toEqual(['BASE_DRIFT']);
    const blocked = JSON.parse((await runCli(['archive', 'relax-payment', '--json'], root, { today })).stdout);
    expect(blocked.diagnostics.find((d: { code: string }) => d.code === 'ARCHIVE_BLOCKED').fix).toContain('--allow-base-drift');
    expect((await runCli(['archive', 'relax-payment', '--allow-base-drift'], root, { today })).code).toBe(0);
    expect(read(root, SPEC)).toContain('Pay within 5 days.');
  });
});
