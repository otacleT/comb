import { describe, expect, it } from 'vitest';
import { buildInstructions } from '../../../src/core/instructions/build.js';
import { loadAllChanges, loadProject } from '../../../src/core/project/load.js';
import { TEMPLATES_DIR } from '../../../src/templates-dir.js';
import { readyProject, TIGHTEN_QUESTIONS } from '../../helpers/archive.js';

describe('instructions apply', () => {
  it('points at tasks.md, reads the delta and surfaces open high questions', () => {
    const root = readyProject({
      'comb/changes/tighten-payment/questions.md': `${TIGHTEN_QUESTIONS}\n## Q-2: Refund a late payment?\n- **Status:** open\n- **Severity:** high\n`,
    });
    const all = loadAllChanges(root);
    const ins = buildInstructions('apply', loadProject(root), all[0]!, all, TEMPLATES_DIR);
    expect(ins.outputPath).toBe('comb/changes/tighten-payment/tasks.md');
    expect(ins.context.readFiles).toEqual([
      'comb/changes/tighten-payment/proposal.md',
      'comb/changes/tighten-payment/specs/order-lifecycle/spec.md',
      'comb/changes/tighten-payment/tasks.md',
      'comb/changes/tighten-payment/questions.md',
      'comb/changes/tighten-payment/decisions.md',
      'comb/specs/order-lifecycle/spec.md',
      'comb/decisions.md',
    ]);
    expect(ins.context.openQuestions).toEqual([{ id: 'Q-2', title: 'Refund a late payment?', severity: 'high' }]);
    expect(ins.template).toContain('- [ ] 1.1');
    expect(ins.instruction).toContain('comb/changes/tighten-payment/tasks.md');
    expect(ins.instruction).toContain('high-severity');
    expect(ins.instruction).toContain('the next step it reports');
  });
});
