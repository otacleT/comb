import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { VERSION } from '../../src/version.js';

describe('runCli', () => {
  it('prints the version and exits 0', async () => {
    const r = await runCli(['--version'], process.cwd());
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(VERSION);
  });

  it('answers usage errors with a JSON envelope when --json is given', async () => {
    const r = await runCli(['instructions', 'proposal', '--json'], process.cwd());
    expect(r.code).toBe(2);
    const env = JSON.parse(r.stdout);
    expect(env).toMatchObject({ schema: 'comb.v1', command: 'instructions', ok: false, data: null });
    expect(env.diagnostics[0].code).toBe('USAGE_ERROR');
    expect(env.diagnostics[0].message).toContain('--change');
  });
});
