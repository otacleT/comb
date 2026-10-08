import { describe, expect, it } from 'vitest';
import { validateChange, validateProject } from '../../../src/core/change/validate-change.js';
import { loadAllChanges, loadProject } from '../../../src/core/project/load.js';
import { CONFIG_YAML, DECISIONS_MD, LOCAL_DECISIONS_MD, metaYaml, ORDER_SPEC, QUESTIONS_MD } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const codes = (ds: { code: string }[]): string[] => ds.map((d) => d.code).sort();

function project(files: Record<string, string>) {
  const root = makeProject({ 'comb/config.yaml': CONFIG_YAML, 'comb/specs/order-lifecycle/spec.md': ORDER_SPEC, ...files });
  const all = loadAllChanges(root);
  return { project: loadProject(root), all };
}

describe('decision references in canonical specs', () => {
  it('reports a canonical requirement citing a decision missing from comb/decisions.md', () => {
    const { project: p } = project({});
    const ds = validateProject(p);
    expect(codes(ds)).toEqual(['REF_UNKNOWN_DECISION']);
    expect(ds[0]!.target).toEqual({ file: 'comb/specs/order-lifecycle/spec.md', line: 15, id: 'REQ-ORDER-001' });
  });

  it('accepts it when the decision exists', () => {
    expect(validateProject(project({ 'comb/decisions.md': DECISIONS_MD }).project)).toEqual([]);
  });
});

describe('questions and decisions of a change', () => {
  // MODIFIED keeps the existing scenario name, so no SCENARIO_DROPPED warning interferes.
  const delta = `## MODIFIED Requirements\n\n### Requirement: REQ-ORDER-002 Payment\nPay within 2 days (D-1).\n\n#### Scenario: Paid in time\n- **GIVEN** an unpaid order\n`;
  const base = {
    'comb/decisions.md': DECISIONS_MD,
    'comb/changes/c/.comb.yaml': metaYaml('c'),
    'comb/changes/c/specs/order-lifecycle/spec.md': delta,
  };

  it('accepts consistent questions, decisions and delta references', () => {
    const { project: p, all } = project({
      ...base,
      'comb/changes/c/questions.md': QUESTIONS_MD,
      'comb/changes/c/decisions.md': LOCAL_DECISIONS_MD,
    });
    expect(validateChange(p, all[0]!, all)).toEqual([]);
  });

  it('reports every broken link', () => {
    const questions = QUESTIONS_MD.replace('- **Decision:** D-1', '- **Decision:** D-9').replace(
      '- **Refs:** REQ-ORDER-002\n\nBody.',
      '- **Refs:** REQ-ORDER-404\n\nBody.',
    );
    const decisions = LOCAL_DECISIONS_MD.replace('- **From:** Q-1', '- **From:** Q-7').replace('D-021', 'D-999');
    const { project: p, all } = project({
      ...base,
      'comb/changes/c/specs/order-lifecycle/spec.md': delta.replace('(D-1)', '(D-1, D-5)'),
      'comb/changes/c/questions.md': `${questions}\n## Q-3: unanswered link\n- **Status:** answered\n- **Severity:** low\n`,
      'comb/changes/c/decisions.md': decisions,
    });
    expect(codes(validateChange(p, all[0]!, all))).toEqual(
      ['QUESTION_UNRESOLVED_LINK', 'REF_UNKNOWN_DECISION', 'REF_UNKNOWN_DECISION', 'REF_UNKNOWN_DECISION', 'REF_UNKNOWN_QUESTION', 'REF_UNKNOWN_REQ'].sort(),
    );
  });

  it('accepts "none: <reason>" as the decision of an answered question', () => {
    const { project: p, all } = project({
      ...base,
      'comb/changes/c/specs/order-lifecycle/spec.md': delta.replace(' (D-1)', ''),
      'comb/changes/c/questions.md': '## Q-1: x\n- **Status:** answered\n- **Severity:** low\n- **Decision:** none: already covered by REQ-ORDER-002\n',
    });
    expect(validateChange(p, all[0]!, all)).toEqual([]);
  });

  it('reports format errors in questions.md through validateChange', () => {
    const { project: p, all } = project({ ...base, 'comb/changes/c/questions.md': '## Q-1: x\n- **Status:** maybe\n- **Severity:** low\n' });
    const ds = validateChange(p, all[0]!, all);
    expect(ds.filter((d) => d.code === 'SPEC_PARSE').map((d) => d.target?.file)).toEqual(['comb/changes/c/questions.md']);
  });
});

describe('decision values written loosely', () => {
  it('reads the decision id at the start of the value and asks for a reason after a bare none', () => {
    const run = (decision: string) => {
      const { project: p, all } = project({
        'comb/decisions.md': DECISIONS_MD,
        'comb/changes/c/.comb.yaml': metaYaml('c'),
        'comb/changes/c/questions.md': QUESTIONS_MD.replace('- **Decision:** D-1', `- **Decision:** ${decision}`),
        'comb/changes/c/decisions.md': LOCAL_DECISIONS_MD,
      });
      return validateChange(p, all[0]!, all).map((d) => d.code);
    };
    expect(run('D-1 (A を採用)')).toEqual([]);
    expect(run('**D-1**')).toEqual([]);
    expect(run('none: covered by REQ-ORDER-002')).toEqual([]);
    expect(run('none')).toEqual(['QUESTION_UNRESOLVED_LINK']);
  });
});
