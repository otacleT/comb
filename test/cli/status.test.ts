import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, metaYaml } from '../helpers/fixtures.js';
import { makeProject } from '../helpers/project.js';

describe('comb status', () => {
  const root = makeProject({
    'comb/config.yaml': CONFIG_YAML,
    'comb/changes/add-x/.comb.yaml': metaYaml('add-x'),
    'comb/changes/add-x/proposal.md': '# Change: x\n\n## Why\nw\n\n## What Changes\n- a\n\n## Impact\n- b\n',
  });

  it('shows one change in JSON', async () => {
    const r = await runCli(['status', '--change', 'add-x', '--json'], root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.data.change).toBe('add-x');
    expect(env.data.next).toBe('delta');
  });

  it('summarizes all changes for humans', async () => {
    const r = await runCli(['status'], root);
    expect(r.stdout.trim()).toBe('add-x  next: delta');
  });

  it('reports a broken config next to the status', async () => {
    const broken = makeProject({
      'comb/config.yaml': `${CONFIG_YAML}review:\n  lenses: [security]\n`,
      'comb/changes/add-x/.comb.yaml': metaYaml('add-x'),
    });
    for (const args of [['status'], ['status', '--change', 'add-x']]) {
      const r = await runCli([...args, '--json'], broken);
      expect(r.code).toBe(1);
      const env = JSON.parse(r.stdout);
      expect(env.diagnostics.map((d: { code: string }) => d.code)).toEqual(['CONFIG_INVALID']);
      expect(env.data).not.toBeNull();
    }
  });
});
