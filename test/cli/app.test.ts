import { describe, expect, it } from 'vitest';
import { runCli, localDate } from '../../src/cli/app.js';
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

  it('uses the local date, not UTC, for today', () => {
    expect(localDate(new Date(2026, 9, 6, 0, 30))).toBe('2026-10-06');
    expect(localDate(new Date(2026, 9, 6, 8, 30))).toBe('2026-10-06');
    expect(localDate(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
  });

  it('gives the local date at a fixed instant in a non-UTC time zone', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'Asia/Tokyo';
    try {
      expect(localDate(new Date('2026-10-05T23:30:00Z'))).toBe('2026-10-06');
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});
