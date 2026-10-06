import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, metaYaml } from '../helpers/fixtures.js';
import { makeProject } from '../helpers/project.js';

describe('comb instructions', () => {
  const root = makeProject({ 'comb/config.yaml': CONFIG_YAML, 'comb/changes/a/.comb.yaml': metaYaml('a') });

  it('returns proposal instructions as JSON', async () => {
    const r = await runCli(['instructions', 'proposal', '--change', 'a', '--json'], root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).data.outputPath).toBe('comb/changes/a/proposal.md');
  });

  it('rejects an unknown artifact with exit 2', async () => {
    const r = await runCli(['instructions', 'nope', '--change', 'a', '--json'], root);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('UNKNOWN_ARTIFACT');
  });

  it('requires --change', async () => {
    expect((await runCli(['instructions', 'proposal'], root)).code).toBe(2);
  });
});
