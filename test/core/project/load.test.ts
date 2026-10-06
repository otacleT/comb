import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRoot, listChangeIds, loadChange, loadProject } from '../../../src/core/project/load.js';
import { CONFIG_YAML, metaYaml, ORDER_SPEC } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

describe('project loading', () => {
  it('finds the root from a nested directory', () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML });
    mkdirSync(join(root, 'a', 'b'), { recursive: true });
    expect(findRoot(join(root, 'a', 'b'))).toBe(root);
  });

  it('returns null outside a project', () => {
    expect(findRoot(makeProject({ 'x.txt': '' }))).toBeNull();
  });

  it('loads specs (CRLF-normalized) and the decisions file', () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC.replace(/\n/g, '\r\n'),
      'comb/specs/.gitkeep': '',
      'comb/decisions.md': '# Decisions\n',
    });
    const project = loadProject(root);
    expect(project.diagnostics).toEqual([]);
    expect([...project.specs.keys()]).toEqual(['order-lifecycle']);
    const spec = project.specs.get('order-lifecycle')!;
    expect(spec.file).toBe('comb/specs/order-lifecycle/spec.md');
    expect(spec.capability.requirements.map((r) => r.id)).toEqual(['REQ-ORDER-001', 'REQ-ORDER-002']);
    expect(project.decisionsText).toBe('# Decisions\n');
  });

  it('loads a change with its files and deltas', () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/changes/add-x/.comb.yaml': metaYaml('add-x'),
      'comb/changes/add-x/proposal.md': '# Change: x\n',
      'comb/changes/add-x/specs/order-lifecycle/spec.md': '## ADDED Requirements\n',
      'comb/changes/archive/2026-01-01-old/.comb.yaml': metaYaml('old'),
    });
    expect(listChangeIds(root)).toEqual(['add-x']);
    const change = loadChange(root, 'add-x')!;
    expect(change.meta).toEqual({ schema: 'comb.change/v1', id: 'add-x', created: '2026-10-06', base: {} });
    expect(change.files.proposal).toBe('# Change: x\n');
    expect(change.files.tasks).toBeUndefined();
    expect(change.deltas.map((d) => [d.capability, d.file])).toEqual([
      ['order-lifecycle', 'comb/changes/add-x/specs/order-lifecycle/spec.md'],
    ]);
    expect(loadChange(root, 'nope')).toBeNull();
  });

  it('reports a missing or broken .comb.yaml', () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML, 'comb/changes/a/proposal.md': 'x' });
    expect(loadChange(root, 'a')!.diagnostics.map((d) => d.code)).toEqual(['CHANGE_META_INVALID']);
    writeFileSync(join(root, 'comb/changes/a/.comb.yaml'), 'schema: wrong\n');
    expect(loadChange(root, 'a')!.diagnostics.map((d) => d.code)).toEqual(['CHANGE_META_INVALID']);
  });
});
