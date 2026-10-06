import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { makeProject } from '../helpers/project.js';

describe('comb init', () => {
  it('initializes a project that then validates cleanly', async () => {
    const root = makeProject({});
    const init = await runCli(['init', '--language', 'ja', '--json'], root);
    expect(init.code).toBe(0);
    expect(JSON.parse(init.stdout).data.created).toContain('.claude/commands/comb/propose.md');
    const v = await runCli(['validate'], root);
    expect(v.code).toBe(0);
  });

  it('rejects an unknown agent', async () => {
    const r = await runCli(['init', '--agent', 'nope', '--json'], makeProject({}));
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('UNKNOWN_AGENT');
  });
});
