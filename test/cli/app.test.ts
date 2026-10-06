import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { VERSION } from '../../src/version.js';

describe('runCli', () => {
  it('prints the version and exits 0', async () => {
    const r = await runCli(['--version'], process.cwd());
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(VERSION);
  });
});
