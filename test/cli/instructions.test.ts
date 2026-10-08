import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, DECISIONS_MD, ORDER_SPEC, metaYaml } from '../helpers/fixtures.js';
import { TIGHTEN_QUESTIONS } from '../helpers/archive.js';
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

describe('comb instructions docs', () => {
  const root = makeProject({
    'comb/config.yaml': CONFIG_YAML,
    'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
    'comb/decisions.md': DECISIONS_MD,
    'comb/changes/archive/2026-10-06-tighten-payment/questions.md': TIGHTEN_QUESTIONS,
  });

  it('works without --change and serves the profile, its rules and the files to read', async () => {
    const r = await runCli(['instructions', 'docs', '--json'], root);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.stdout).data;
    expect(d.artifact).toBe('docs');
    expect(d.dir).toBe('docs');
    expect(d.outputs.map((o: { path: string; state: string }) => [o.path, o.state])).toEqual([
      ['docs/product.md', 'missing'],
      ['docs/features.md', 'missing'],
      ['docs/screens.md', 'missing'],
      ['docs/flows.md', 'missing'],
      ['docs/decisions.md', 'missing'],
      ['docs/open-questions.md', 'missing'],
    ]);
    expect(d.outputs[0].template).toContain('## Gaps');
    expect(d.discipline).toContain('#Q-');
    expect(d.context.readFiles).toEqual([
      'comb/config.yaml',
      'comb/specs/order-lifecycle/spec.md',
      'comb/decisions.md',
      'comb/changes/archive/2026-10-06-tighten-payment/questions.md',
    ]);
    expect(d.instruction).toContain('docs/');
    expect(d.instruction).toContain('comb docs stamp');
  });

  it('still requires --change for the other artifacts', async () => {
    const r = await runCli(['instructions', 'review', '--json'], root);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('USAGE_ERROR');
  });
});
