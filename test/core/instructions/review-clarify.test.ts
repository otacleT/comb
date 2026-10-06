import { describe, expect, it } from 'vitest';
import { buildInstructions, openQuestions } from '../../../src/core/instructions/build.js';
import { loadAllChanges, loadProject } from '../../../src/core/project/load.js';
import { TEMPLATES_DIR } from '../../../src/templates-dir.js';
import { stampReview } from '../../../src/core/workflow/review-stamp.js';
import { CONFIG_YAML, DECISIONS_MD, LOCAL_DECISIONS_MD, metaYaml, ORDER_SPEC } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const QUESTIONS = `## Q-1: low one\n- **Status:** open\n- **Severity:** low\n\n## Q-2: answered\n- **Status:** answered\n- **Severity:** high\n- **Decision:** D-1\n\n## Q-3: high one\n- **Status:** open\n- **Severity:** high\n\n## Q-4: medium one\n- **Status:** open\n- **Severity:** medium\n`;

function setup(review?: string) {
  const files: Record<string, string> = {
    'comb/config.yaml': `${CONFIG_YAML}review:\n  lenses: [consistency, edge-cases]\n  batch: 2\n`,
    'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
    'comb/decisions.md': DECISIONS_MD,
    'comb/changes/c/.comb.yaml': metaYaml('c'),
    'comb/changes/c/proposal.md': '# Change: c\n',
    'comb/changes/c/specs/order-lifecycle/spec.md': '## ADDED Requirements\n\n### Requirement: REQ-ORDER-011 X\nx\n\n#### Scenario: s\n- **GIVEN** a\n',
    'comb/changes/c/questions.md': QUESTIONS,
    'comb/changes/c/decisions.md': LOCAL_DECISIONS_MD,
  };
  if (review !== undefined) files['comb/changes/c/review.md'] = review;
  const root = makeProject(files);
  const all = loadAllChanges(root);
  return { project: loadProject(root), change: all[0]!, all };
}

describe('openQuestions', () => {
  it('orders open questions by severity, then number', () => {
    expect(openQuestions(setup().change).map((q) => q.id)).toEqual(['Q-3', 'Q-4', 'Q-1']);
  });
});

describe('review instructions', () => {
  it('serves the configured lenses, the files to read and the outputs', () => {
    const { project, change, all } = setup();
    const ins = buildInstructions('review', project, change, all, TEMPLATES_DIR);
    expect(ins.outputPath).toBe('comb/changes/c/review.md');
    expect(ins.alsoWrite).toEqual(['comb/changes/c/questions.md']);
    expect(ins.lenses.map((l) => l.id)).toEqual(['consistency', 'edge-cases']);
    expect(ins.lenses[1]!.definition).toContain('# Lens: edge cases');
    expect(ins.context.readFiles).toEqual([
      'comb/specs/order-lifecycle/spec.md',
      'comb/decisions.md',
      'comb/changes/c/proposal.md',
      'comb/changes/c/specs/order-lifecycle/spec.md',
      'comb/changes/c/questions.md',
      'comb/changes/c/decisions.md',
    ]);
    expect(ins.template).toContain('## Behavior model');
    expect(ins.template).toContain('**Recommendation:**');
    expect(ins.instruction).toContain('comb mark-reviewed --change c');
    expect(ins.instruction).toContain('comb/changes/c/questions.md');
    expect(ins.instruction).not.toContain('{{');
    expect(ins.ids.nextQuestion).toBe('Q-5');
    expect(ins.context.changedSinceReview).toBeNull();
  });

  it('lists the requirements changed since the last stamped review', () => {
    const review = stampReview('# Review: c\n', 'sha256:0000000000000000', { 'REQ-ORDER-011': 'sha256:old' })!;
    const { project, change, all } = setup(review);
    expect(buildInstructions('review', project, change, all, TEMPLATES_DIR).context.changedSinceReview).toEqual(['REQ-ORDER-011']);
  });
});

describe('clarify instructions', () => {
  it('serves open questions, the batch size and the next decision id', () => {
    const { project, change, all } = setup();
    const ins = buildInstructions('clarify', project, change, all, TEMPLATES_DIR);
    expect(ins.outputPath).toBe('comb/changes/c/decisions.md');
    expect(ins.alsoWrite).toEqual(['comb/changes/c/questions.md', 'comb/changes/c/specs/<capability>/spec.md']);
    expect(ins.context.openQuestions.map((q) => [q.id, q.severity])).toEqual([
      ['Q-3', 'high'],
      ['Q-4', 'medium'],
      ['Q-1', 'low'],
    ]);
    expect(ins.context.batch).toBe(2);
    expect(ins.ids.nextDecision).toBe('D-2');
    expect(ins.context.readFiles).toEqual([
      'comb/changes/c/questions.md',
      'comb/changes/c/decisions.md',
      'comb/changes/c/specs/order-lifecycle/spec.md',
      'comb/specs/order-lifecycle/spec.md',
      'comb/decisions.md',
    ]);
    expect(ins.template).toContain('## D-1:');
    expect(ins.lenses).toEqual([]);
  });
});
