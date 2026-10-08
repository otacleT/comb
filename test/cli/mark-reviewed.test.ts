import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, metaYaml } from '../helpers/fixtures.js';
import { makeProject } from '../helpers/project.js';

const files = {
  'comb/config.yaml': CONFIG_YAML,
  'comb/changes/c/.comb.yaml': metaYaml('c'),
  'comb/changes/c/specs/payment/spec.md': '---\nprefix: PAY\n---\n## Purpose\np\n\n## ADDED Requirements\n\n### Requirement: REQ-PAY-001 X\nx\n\n#### Scenario: s\n- **GIVEN** a\n',
};

describe('comb mark-reviewed', () => {
  it('stamps review.md with the current delta hash', async () => {
    const root = makeProject({ ...files, 'comb/changes/c/review.md': '# Review: c\n' });
    const r = await runCli(['mark-reviewed', '--change', 'c', '--json'], root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.data.reviewed).toMatch(/^sha256:[0-9a-f]{16}$/);
    const review = readFileSync(join(root, 'comb/changes/c/review.md'), 'utf8');
    expect(review).toContain(`reviewed: ${env.data.reviewed}`);
    expect(review).toContain('REQ-PAY-001: sha256:');
  });

  it('reports a missing review with exit 1', async () => {
    const r = await runCli(['mark-reviewed', '--change', 'c', '--json'], makeProject(files));
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('REVIEW_MISSING');
  });

  it('reports a broken frontmatter without touching the file', async () => {
    const root = makeProject({ ...files, 'comb/changes/c/review.md': '---\nlenses: [x]\n# R\n' });
    const r = await runCli(['mark-reviewed', '--change', 'c', '--json'], root);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.stdout).diagnostics[0];
    expect(d.code).toBe('SPEC_PARSE');
    expect(d.message).toContain('unterminated frontmatter');
    expect(d.fix).toBeDefined();
    expect(readFileSync(join(root, 'comb/changes/c/review.md'), 'utf8')).toBe('---\nlenses: [x]\n# R\n');
  });

  it('returns exit 2 for an unknown change', async () => {
    expect((await runCli(['mark-reviewed', '--change', 'nope', '--json'], makeProject(files))).code).toBe(2);
  });
});
