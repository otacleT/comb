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

describe('parseQuestions: headings and fields an LLM gets slightly wrong', () => {
  it('reports a question heading at the wrong level instead of dropping it', () => {
    const text = '# Questions\n\n### Q-1: a\n- **Status:** open\n- **Severity:** high\n';
    const { questions, diagnostics } = parseQuestions(text, 'q.md');
    expect(questions).toEqual([]);
    expect(diagnostics.map((d) => [d.code, d.target?.line, d.fix])).toEqual([['SPEC_PARSE', 3, 'Use "## Q-<n>: <question>"']]);
  });

  it('reports a question nested under another question', () => {
    const text = '## Q-1: a\n- **Status:** open\n- **Severity:** low\n\n### Q-2: b\n- **Status:** open\n- **Severity:** high\n';
    expect(parseQuestions(text, 'q.md').diagnostics.map((d) => [d.code, d.target?.line])).toEqual([['SPEC_PARSE', 5]]);
  });

  it('reads status and severity written with common variations', () => {
    const text = [
      '## Q-1: a', '- **Status**: open', '- **Severity**: high', '',
      '## Q-2: b', '- **Status:** answered (2026-10-05)', '- **Severity:** `medium`', '',
      '## Q-3: c', '- **Status:** deferred <!-- later -->', '- **Severity:** **Low**', '',
    ].join('\n');
    const { questions, diagnostics } = parseQuestions(text, 'q.md');
    expect(diagnostics).toEqual([]);
    expect(questions.map((q) => [q.id, q.status, q.severity])).toEqual([
      ['Q-1', 'open', 'high'],
      ['Q-2', 'answered', 'medium'],
      ['Q-3', 'deferred', 'low'],
    ]);
  });

  it('separates a missing field from a bad value, each with a fix', () => {
    const text = '## Q-1: a\n- **Severity:** urgent\n';
    const { diagnostics } = parseQuestions(text, 'q.md');
    expect(diagnostics.map((d) => d.message)).toEqual(['Q-1: Status is missing', 'Q-1: Severity "urgent" is not one of high, medium, low']);
    expect(diagnostics.every((d) => d.fix !== undefined)).toBe(true);
  });

  it('reports a field written twice instead of keeping the first silently', () => {
    const text = '## Q-1: a\n- **Status:** open\n- **Severity:** high\n- **Status:** answered\n';
    const { diagnostics } = parseQuestions(text, 'q.md');
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([['SPEC_PARSE', 'Q-1: Status is written twice']]);
    expect(diagnostics[0]!.fix).toBeDefined();
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

  it('reports a decision heading at the wrong level', () => {
    const text = '# Decisions\n\n### D-1: x\n- **Date:** 2026-10-06\n\nrule\n';
    const { decisions, diagnostics } = parseDecisions(text, 'd.md');
    expect(decisions).toEqual([]);
    expect(diagnostics.map((d) => [d.code, d.target?.line, d.fix])).toEqual([['SPEC_PARSE', 3, 'Use "## D-<n>: <rule title>"']]);
  });

  it('reports a decision field written twice', () => {
    const text = '## D-1: x\n- **Date:** 2026-10-08\n- **From:** Q-1\n- **From:** Q-2\n\nrule\n\n**Why:** w\n';
    expect(parseDecisions(text, 'd.md').diagnostics.map((d) => d.message)).toEqual(['D-1: From is written twice']);
  });

  it('requires the rule text', () => {
    const { diagnostics } = parseDecisions('## D-1: x\n- **Date:** 2026-10-08\n- **Refs:** REQ-A-001\n\n**Why:** y\n', 'd.md');
    expect(diagnostics.map((d) => d.code)).toEqual(['SPEC_PARSE']);
  });
});

describe('loosely written values', () => {
  it('extracts requirement ids from Refs with notes, full-width parentheses, semicolons and backticks', () => {
    expect(parseIdList('REQ-ORDER-005 (buyer cancel); `REQ-ORDER-006`、REQ-ORDER-007（購入者キャンセル）')).toEqual(['REQ-ORDER-005', 'REQ-ORDER-006', 'REQ-ORDER-007']);
  });

  it('reads From and Supersedes by their ids', () => {
    const d = parseDecisions('## D-1: x\n- **Date:** 2026-10-08\n- **From:** Q-1, Q-2\n- **Supersedes:** D-021 (price rule)\n\nrule\n\n**Why:** w\n', 'd.md');
    expect(d.diagnostics).toEqual([]);
    expect([d.decisions[0]!.from, d.decisions[0]!.supersedes]).toEqual(['Q-1', 'D-021']);
  });

  it('requires a Date and a reason, and accepts **Why**:', () => {
    expect(parseDecisions('## D-1: x\n\nrule\n', 'd.md').diagnostics.map((d) => d.message)).toEqual(['D-1: Date is missing', 'D-1: the reason (**Why:**) is missing']);
    const loose = parseDecisions('## D-1: x\n- **Date:** 2026-10-08\n\nrule\n\n**Why**: because\n', 'd.md');
    expect(loose.diagnostics).toEqual([]);
    expect([loose.decisions[0]!.rule, loose.decisions[0]!.why]).toEqual(['rule', 'because']);
  });
});
