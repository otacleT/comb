import { describe, expect, it, vi } from 'vitest';
import { loadChange } from '../../../src/core/project/load.js';
import { changedSince, deltaHash, requirementHashes } from '../../../src/core/workflow/hash.js';
import { CONFIG_YAML, metaYaml } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const DELTA = `## ADDED Requirements\n\n### Requirement: REQ-ORDER-003 New\nx\n\n#### Scenario: s\n- **GIVEN** a\n\n## REMOVED Requirements\n\n### Requirement: REQ-ORDER-001\n**Reason:** r\n`;
const changeWith = (delta: string) =>
  loadChange(
    makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/changes/c/.comb.yaml': metaYaml('c'),
      'comb/changes/c/specs/order-lifecycle/spec.md': delta,
    }),
    'c',
  )!;

describe('deltaHash', () => {
  it('is stable across line endings and changes with the text', () => {
    const h = deltaHash(changeWith(DELTA));
    expect(h).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(deltaHash(changeWith(DELTA.replace(/\n/g, '\r\n')))).toBe(h);
    expect(deltaHash(changeWith(DELTA.replace('x\n', 'y\n')))).not.toBe(h);
  });

  it('ignores trailing whitespace at the end of a delta', () => {
    const h = deltaHash(changeWith(DELTA));
    expect(deltaHash(changeWith(DELTA.trimEnd()))).toBe(h);
    expect(deltaHash(changeWith(`${DELTA}\n\n`))).toBe(h);
  });
});

describe('requirementHashes / changedSince', () => {
  it('hashes added/modified blocks and marks removals', () => {
    const hashes = requirementHashes(changeWith(DELTA));
    expect(Object.keys(hashes).sort()).toEqual(['REQ-ORDER-001', 'REQ-ORDER-003']);
    expect(hashes['REQ-ORDER-001']).toBe('removed');
    expect(hashes['REQ-ORDER-003']).toMatch(/^sha256:/);
  });

  it('also hashes sections and the purpose, so an edit outside requirement blocks is located', () => {
    const withSection = `${DELTA}\n## MODIFIED Sections\n\n### Section: States\n| from | to |\n|---|---|\n| a | b |\n`;
    const before = requirementHashes(changeWith(withSection));
    expect(Object.keys(before)).toContain('order-lifecycle#States');
    const after = requirementHashes(changeWith(withSection.replace('| a | b |', '| a | b |\n| b | c |')));
    expect(changedSince(before, after)).toEqual(['order-lifecycle#States']);
    const withPurpose = (p: string) => requirementHashes(changeWith(`## Purpose\n\n${p}\n\n${DELTA}`));
    expect(changedSince(withPurpose('Orders.'), withPurpose('Orders and returns.'))).toEqual(['order-lifecycle#Purpose']);
  });

  it('lists ids whose hash changed, appeared or disappeared', () => {
    expect(changedSince(null, { 'REQ-A-001': 'x' })).toBeNull();
    expect(changedSince({ 'REQ-A-001': 'x', 'REQ-A-002': 'y' }, { 'REQ-A-001': 'x', 'REQ-A-003': 'z' })).toEqual(['REQ-A-002', 'REQ-A-003']);
  });
});

describe('deltaHash ordering', () => {
  it('orders the deltas by code point, independent of the locale', () => {
    const change = loadChange(
      makeProject({
        'comb/config.yaml': CONFIG_YAML,
        'comb/changes/c/.comb.yaml': metaYaml('c'),
        'comb/changes/c/specs/b-cap/spec.md': DELTA,
        'comb/changes/c/specs/a-cap/spec.md': DELTA,
      }),
      'c',
    )!;
    const spy = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
      throw new Error('locale-dependent ordering');
    });
    try {
      expect(deltaHash(change)).toMatch(/^sha256:[0-9a-f]{16}$/);
    } finally {
      spy.mockRestore();
    }
  });
});
