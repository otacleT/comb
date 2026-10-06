import { describe, expect, it } from 'vitest';
import { buildInstructions, nextRequirementIds } from '../../../src/core/instructions/build.js';
import { loadAllChanges, loadProject } from '../../../src/core/project/load.js';
import { TEMPLATES_DIR } from '../../../src/templates-dir.js';
import { CONFIG_YAML, metaYaml, ORDER_SPEC } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const scenario = '\n#### Scenario: s\n- **GIVEN** a\n';

function setup() {
  const root = makeProject({
    'comb/config.yaml': `${CONFIG_YAML}context: "C2C marketplace"\nrules:\n  delta: ["Amounts are integer yen"]\n`,
    'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
    'comb/decisions.md': '# Decisions\n',
    'comb/changes/a/.comb.yaml': metaYaml('a'),
    'comb/changes/a/proposal.md': '# Change: a\n',
    'comb/changes/a/specs/order-lifecycle/spec.md': `## ADDED Requirements\n\n### Requirement: REQ-ORDER-011 X\nx\n${scenario}`,
    'comb/changes/b/.comb.yaml': metaYaml('b'),
    'comb/changes/b/specs/payment/spec.md': `---\nprefix: PAY\n---\n## Purpose\np\n\n## ADDED Requirements\n\n### Requirement: REQ-PAY-001 Y\ny\n${scenario}`,
  });
  return { project: loadProject(root), all: loadAllChanges(root) };
}

describe('nextRequirementIds', () => {
  it('skips used, retired and in-flight ids, and covers new capabilities', () => {
    const { project, all } = setup();
    expect(nextRequirementIds(project, all)).toEqual({ 'order-lifecycle': 'REQ-ORDER-012', payment: 'REQ-PAY-002' });
  });
});

describe('nextRequirementIds across capabilities', () => {
  it('never hands out an id that exists in another capability with the same prefix', () => {
    const refunds = ORDER_SPEC.replace(/REQ-ORDER-001/g, 'REQ-ORDER-021').replace(/REQ-ORDER-002/g, 'REQ-ORDER-022');
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/specs/order-refunds/spec.md': refunds,
    });
    expect(nextRequirementIds(loadProject(root), [])).toEqual({ 'order-lifecycle': 'REQ-ORDER-023', 'order-refunds': 'REQ-ORDER-023' });
  });
});

describe('buildInstructions', () => {
  it('builds delta instructions with files to read, rules and ids', () => {
    const { project, all } = setup();
    const ins = buildInstructions('delta', project, all.find((c) => c.id === 'a')!, all, TEMPLATES_DIR);
    expect(ins.outputPath).toBe('comb/changes/a/specs/<capability>/spec.md');
    expect(ins.context.readFiles).toEqual([
      'comb/specs/order-lifecycle/spec.md',
      'comb/decisions.md',
      'comb/changes/a/proposal.md',
    ]);
    expect(ins.context.project).toBe('C2C marketplace');
    expect(ins.rules).toEqual(['Amounts are integer yen']);
    expect(ins.instruction).toContain('comb validate --change a --json');
    expect(ins.instruction).not.toContain('{{');
    expect(ins.template).toContain('## ADDED Requirements');
    expect(ins.ids.nextRequirement['order-lifecycle']).toBe('REQ-ORDER-012');
    expect(ins.ids.prefixesInUse).toEqual(['ORDER', 'PAY']);
  });

  it('builds proposal and tasks instructions with their output paths', () => {
    const { project, all } = setup();
    const a = all.find((c) => c.id === 'a')!;
    expect(buildInstructions('proposal', project, a, all, TEMPLATES_DIR).outputPath).toBe('comb/changes/a/proposal.md');
    const tasks = buildInstructions('tasks', project, a, all, TEMPLATES_DIR);
    expect(tasks.outputPath).toBe('comb/changes/a/tasks.md');
    expect(tasks.context.readFiles).toEqual(['comb/changes/a/proposal.md', 'comb/changes/a/specs/order-lifecycle/spec.md']);
  });
});
