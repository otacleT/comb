import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, DECISIONS_MD, metaYaml, MODIFY_PAYMENT_DELTA, ORDER_SPEC } from '../helpers/fixtures.js';
import { makeProject } from '../helpers/project.js';

const today = () => '2026-10-06';

describe('comb validate / new change', () => {
  it('fails with NOT_A_COMB_PROJECT and exit 2 outside a project', async () => {
    const r = await runCli(['validate', '--json'], makeProject({ 'x.txt': '' }));
    expect(r.code).toBe(2);
    const env = JSON.parse(r.stdout);
    expect(env.ok).toBe(false);
    expect(env.diagnostics[0].code).toBe('NOT_A_COMB_PROJECT');
  });

  it('passes on a valid project', async () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/decisions.md': DECISIONS_MD,
    });
    const r = await runCli(['validate'], root);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('checked 1 spec(s), 0 change(s)');
  });

  it('reports delta errors with exit 1', async () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/decisions.md': DECISIONS_MD,
      'comb/changes/a/.comb.yaml': metaYaml('a'),
      'comb/changes/a/specs/order-lifecycle/spec.md': '## REMOVED Requirements\n\n### Requirement: REQ-ORDER-077\n**Reason:** r\n',
    });
    const r = await runCli(['validate', '--change', 'a', '--json'], root);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics.map((d: { code: string }) => d.code)).toEqual(['DELTA_TARGET_MISSING']);
  });

  it('returns exit 2 for an unknown change', async () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML });
    const r = await runCli(['validate', '--change', 'nope', '--json'], root);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('CHANGE_NOT_FOUND');
  });

  it('creates a change from a nested directory', async () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML, 'src/a.ts': '' });
    const r = await runCli(['new', 'change', 'add-x', '--json'], join(root, 'src'), { today });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).data).toEqual({ change: 'add-x', path: 'comb/changes/add-x' });
    expect(existsSync(join(root, 'comb/changes/add-x/.comb.yaml'))).toBe(true);
  });

  it('exits 2 for an unknown command', async () => {
    const r = await runCli(['nope'], process.cwd());
    expect(r.code).toBe(2);
  });
});

describe('comb validate --change records the base (S1)', () => {
  it('records MODIFIED targets once and warns with BASE_DRIFT after the spec changes', async () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/decisions.md': DECISIONS_MD,
      'comb/changes/c/.comb.yaml': metaYaml('c'),
      'comb/changes/c/specs/order-lifecycle/spec.md': MODIFY_PAYMENT_DELTA,
    });
    const metaOf = () => parseYaml(readFileSync(join(root, 'comb/changes/c/.comb.yaml'), 'utf8')) as { base: Record<string, string> };
    const first = JSON.parse((await runCli(['validate', '--change', 'c', '--json'], root, { today })).stdout);
    expect(first.data.baseRecorded).toEqual(['REQ-ORDER-002']);
    const recorded = metaOf().base['REQ-ORDER-002'];
    expect(recorded).toMatch(/^sha256:[0-9a-f]{16}$/);

    writeFileSync(join(root, 'comb/specs/order-lifecycle/spec.md'), ORDER_SPEC.replace('Pay within 3 days.', 'Pay within 4 days.'));
    const second = await runCli(['validate', '--change', 'c', '--json'], root, { today });
    const env = JSON.parse(second.stdout);
    expect(second.code).toBe(0);
    expect(env.data.baseRecorded).toEqual([]);
    expect(env.diagnostics.map((d: { code: string }) => d.code)).toEqual(['BASE_DRIFT']);
    expect(metaOf().base['REQ-ORDER-002']).toBe(recorded);
  });
});
