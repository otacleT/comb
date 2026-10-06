import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChange } from '../../../src/core/change/new-change.js';
import { validateChange, validateProject } from '../../../src/core/change/validate-change.js';
import { loadAllChanges, loadChange, loadProject } from '../../../src/core/project/load.js';
import { CONFIG_YAML, metaYaml, ORDER_SPEC } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const scenario = '\n#### Scenario: s\n- **GIVEN** a\n';
const addDelta = (id: string) => `## ADDED Requirements\n\n### Requirement: ${id} New\nx\n${scenario}`;

describe('createChange', () => {
  it('creates the folder and .comb.yaml', () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML });
    const r = createChange(root, 'add-auto-cancel', '2026-10-06');
    expect(r).toEqual({ path: 'comb/changes/add-auto-cancel', diagnostics: [] });
    expect(loadChange(root, 'add-auto-cancel')!.meta).toEqual({
      schema: 'comb.change/v1',
      id: 'add-auto-cancel',
      created: '2026-10-06',
      base: {},
    });
    expect(existsSync(join(root, 'comb/changes/add-auto-cancel/specs'))).toBe(true);
  });

  it('rejects invalid or existing ids without creating anything', () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML });
    for (const bad of ['Add_X', 'archive', '-x', 'x--y', '']) {
      expect(createChange(root, bad, '2026-10-06').diagnostics[0]!.code).toBe('CHANGE_ID_INVALID');
    }
    expect(existsSync(join(root, 'comb/changes'))).toBe(false);
    createChange(root, 'a', '2026-10-06');
    expect(createChange(root, 'a', '2026-10-06').diagnostics[0]!.code).toBe('CHANGE_EXISTS');
    expect(readdirSync(join(root, 'comb/changes'))).toEqual(['a']);
  });
});

describe('validation across a project', () => {
  it('detects a requirement id defined in two capabilities', () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/specs/other/spec.md': ORDER_SPEC,
    });
    // `other` repeats both requirements of order-lifecycle (each id reported once on the second spec)
    // and shares its prefix (reported once).
    expect(validateProject(loadProject(root)).map((d) => d.code)).toEqual(['REQ_ID_DUPLICATE', 'REQ_ID_DUPLICATE', 'REQ_ID_PREFIX']);
  });

  it('rejects a new capability that reuses another capability\'s prefix or requirement ids', () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/changes/c/.comb.yaml': metaYaml('c'),
      'comb/changes/c/specs/order-refunds/spec.md': `---\nprefix: ORDER\n---\n## Purpose\np\n\n${addDelta('REQ-ORDER-001')}`,
    });
    const all = loadAllChanges(root);
    expect(validateChange(loadProject(root), all[0]!, all).map((d) => d.code).sort()).toEqual(['REQ_ID_DUPLICATE', 'REQ_ID_PREFIX']);
  });

  it('rejects two canonical specs that share a prefix', () => {
    const refunds = ORDER_SPEC.replace(/REQ-ORDER-001/g, 'REQ-ORDER-021').replace(/REQ-ORDER-002/g, 'REQ-ORDER-022');
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/specs/order-refunds/spec.md': refunds,
    });
    expect(validateProject(loadProject(root)).map((d) => d.code)).toEqual(['REQ_ID_PREFIX']);
  });

  it('validates deltas against the base and other changes', () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/changes/a/.comb.yaml': metaYaml('a'),
      'comb/changes/a/specs/order-lifecycle/spec.md': addDelta('REQ-ORDER-003'),
      'comb/changes/b/.comb.yaml': metaYaml('b'),
      'comb/changes/b/specs/order-lifecycle/spec.md': `${addDelta('REQ-ORDER-003')}\n## REMOVED Requirements\n\n### Requirement: REQ-ORDER-077\n**Reason:** r\n`,
    });
    const project = loadProject(root);
    const all = loadAllChanges(root);
    const b = all.find((c) => c.id === 'b')!;
    expect(validateChange(project, b, all).map((d) => d.code).sort()).toEqual(['DELTA_TARGET_MISSING', 'REQ_ID_DUPLICATE']);
    const a = all.find((c) => c.id === 'a')!;
    expect(validateChange(project, a, [a])).toEqual([]);
  });
});
