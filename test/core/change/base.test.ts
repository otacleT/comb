import { describe, expect, it } from 'vitest';
import { baseDrift, unrecordedBase } from '../../../src/core/change/base.js';
import { loadChange, loadProject } from '../../../src/core/project/load.js';
import { blockHash } from '../../../src/core/workflow/hash.js';
import { CONFIG_YAML, DECISIONS_MD, MODIFY_PAYMENT_DELTA, ORDER_SPEC } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const setup = (base: string) => {
  const root = makeProject({
    'comb/config.yaml': CONFIG_YAML,
    'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
    'comb/decisions.md': DECISIONS_MD,
    'comb/changes/c/.comb.yaml': `schema: comb.change/v1\nid: c\ncreated: 2026-10-06\nbase: ${base}\n`,
    'comb/changes/c/specs/order-lifecycle/spec.md': MODIFY_PAYMENT_DELTA,
  });
  return { project: loadProject(root), change: loadChange(root, 'c')! };
};

describe('base hashes (S1)', () => {
  it('lists the MODIFIED and REMOVED targets that are not recorded yet', () => {
    const { project, change } = setup('{}');
    const current = project.specs.get('order-lifecycle')!.capability.requirements.find((r) => r.id === 'REQ-ORDER-002')!;
    expect(unrecordedBase(project, change)).toEqual({ 'REQ-ORDER-002': blockHash(current.block) });
    expect(baseDrift(project, change)).toEqual([]);
  });

  it('never re-records a target, and reports drift when the spec moved', () => {
    const { project, change } = setup('{ REQ-ORDER-002: "sha256:0000000000000000" }');
    expect(unrecordedBase(project, change)).toEqual({});
    expect(baseDrift(project, change).map((d) => [d.severity, d.code, d.target?.id])).toEqual([['warning', 'BASE_DRIFT', 'REQ-ORDER-002']]);
  });
});
