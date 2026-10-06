import { describe, expect, it } from 'vitest';
import { parseDecisions, parseIdList, parseQuestions } from '../../../src/core/decision/parse.js';
import { DECISIONS_MD, LOCAL_DECISIONS_MD, QUESTIONS_MD } from '../../helpers/fixtures.js';

describe('parseIdList', () => {
  it('splits ids and drops placeholders and notes', () => {
    expect(parseIdList('REQ-ORDER-001, REQ-ORDER-019 (new)、REQ-PAY-001')).toEqual(['REQ-ORDER-001', 'REQ-ORDER-019', 'REQ-PAY-001']);
    expect(parseIdList('—')).toEqual([]);
    expect(parseIdList(undefined)).toEqual([]);
  });
});

describe('parseQuestions', () => {
  it('reads fields tolerantly (case, trailing comments, Japanese titles)', () => {
    const { questions, diagnostics } = parseQuestions(QUESTIONS_MD, 'q.md');
    expect(diagnostics).toEqual([]);
    expect(questions.map((q) => [q.id, q.status, q.severity])).toEqual([
      ['Q-1', 'answered', 'high'],
      ['Q-2', 'open', 'medium'],
    ]);
    const q1 = questions[0]!;
    expect(q1.title).toBe('期限後の発送を受け付けるか');
    expect(q1.refs).toEqual(['REQ-ORDER-001', 'REQ-ORDER-002']);
    expect(q1.lens).toBe('edge-cases');
    expect(q1.decision).toBe('D-1');
    expect(q1.answer).toBe('A (2026-10-06)');
    expect(questions[1]!.decision).toBeNull();
    expect(questions[1]!.line).toBe(21);
  });

  it('reports bad headings, statuses, severities and duplicates', () => {
    const text = '## Not a question\n\n## Q-1: a\n- **Status:** maybe\n- **Severity:** urgent\n\n## Q-1: again\n- **Status:** open\n- **Severity:** low\n';
    const { diagnostics } = parseQuestions(text, 'q.md');
    expect(diagnostics.map((d) => [d.code, d.target?.line])).toEqual([
      ['SPEC_PARSE', 1],
      ['SPEC_PARSE', 3],
      ['SPEC_PARSE', 3],
      ['SPEC_PARSE', 7],
    ]);
  });
});

describe('parseDecisions', () => {
  it('reads a change-local decision', () => {
    const { decisions, diagnostics } = parseDecisions(LOCAL_DECISIONS_MD, 'd.md');
    expect(diagnostics).toEqual([]);
    expect(decisions).toEqual([
      {
        id: 'D-1',
        title: 'Shipping after the deadline is rejected',
        date: '2026-10-06',
        refs: ['REQ-ORDER-002'],
        from: 'Q-1',
        supersedes: 'D-021',
        supersededBy: null,
        change: null,
        rule: 'After the deadline, "mark shipped" is rejected with SHIP_WINDOW_CLOSED.',
        why: 'a cancelled order must never ship.',
        line: 3,
      },
    ]);
  });

  it('reads the canonical log', () => {
    const { decisions } = parseDecisions(DECISIONS_MD, 'comb/decisions.md');
    expect(decisions.map((d) => [d.id, d.change])).toEqual([['D-021', 'seed-orders']]);
  });

  it('requires the rule text', () => {
    const { diagnostics } = parseDecisions('## D-1: x\n- **Refs:** REQ-A-001\n\n**Why:** y\n', 'd.md');
    expect(diagnostics.map((d) => d.code)).toEqual(['SPEC_PARSE']);
  });
});
