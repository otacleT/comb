import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { executeArchive } from '../../../src/core/change/archive-execute.js';
import { planArchive } from '../../../src/core/change/archive-plan.js';
import { loadAllChanges, loadProject } from '../../../src/core/project/load.js';
import { readyProject } from '../../helpers/archive.js';

const fail = vi.hoisted(() => ({ target: '' }));

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    renameSync: (from: import('node:fs').PathLike, to: import('node:fs').PathLike): void => {
      if (fail.target !== '' && String(to).endsWith(fail.target)) throw new Error('EACCES: permission denied');
      real.renameSync(from, to);
    },
  };
});

describe('executeArchive', () => {
  it('reports what is left when a file cannot be replaced after the move', () => {
    const root = readyProject();
    const all = loadAllChanges(root);
    const { plan } = planArchive(loadProject(root), all[0]!, all, { yes: false, allowDroppedScenarios: false, allowBaseDrift: false }, '2026-10-06');
    fail.target = join('comb', 'decisions.md');
    const ds = executeArchive(root, plan!);
    fail.target = '';
    expect(ds.map((d) => d.code)).toEqual(['ARCHIVE_IO_FAILED']);
    expect(ds[0]!.message).toContain('Not yet replaced: comb/decisions.md');
    expect(existsSync(join(root, 'comb/decisions.md.comb-tmp'))).toBe(true);
    expect(existsSync(join(root, 'comb/changes/archive/2026-10-06-tighten-payment'))).toBe(true);
    expect(readFileSync(join(root, 'comb/specs/order-lifecycle/spec.md'), 'utf8')).toContain('(D-022)');
  });
});
