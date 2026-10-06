import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, DECISIONS_MD, metaYaml, ORDER_SPEC } from '../helpers/fixtures.js';
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
