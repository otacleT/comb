import { describe, expect, it } from 'vitest';
import { answerKeys, graderPrompt, parseGrade, resultOf, summarize } from '../bench/lib.mjs';

const line = (o: unknown): string => JSON.stringify(o);

describe('bench/lib', () => {
  it('reads turns, cost, minutes and tool errors from a stream-json transcript', () => {
    const jsonl = [
      line({ type: 'system', subtype: 'init' }),
      line({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true }, { type: 'tool_result' }] } }),
      line({ type: 'result', num_turns: 12, total_cost_usd: 2.5, duration_ms: 90000, result: 'done' }),
      '',
    ].join('\n');
    expect(resultOf(jsonl)).toEqual({ turns: 12, costUsd: 2.5, minutes: 1.5, toolErrors: 1, text: 'done' });
    expect(resultOf(line({ type: 'system' }))).toBeNull();
  });

  it('lists the answer-key ids of an expected-highs table', () => {
    expect(answerKeys('| Key | Root cause |\n|---|---|\n| BL-01 | a |\n| BL-02 | b |\n')).toEqual(['BL-01', 'BL-02']);
  });

  it('parses the grader reply, fills in missing keys and rejects a reply without JSON', () => {
    const reply = 'Here is my grading.\n```json\n{"matches":[{"key":"BL-01","question":"Q-3","quote":"x"}]}\n```\nDone.';
    expect(parseGrade(reply, ['BL-01', 'BL-02'])).toEqual([
      { key: 'BL-01', question: 'Q-3', quote: 'x' },
      { key: 'BL-02', question: null, quote: '' },
    ]);
    expect(() => parseGrade('no json here', ['BL-01'])).toThrow('grader returned no JSON');
  });

  it('builds a grader prompt with the rule, then the key, then the questions', () => {
    const p = graderPrompt({ spec: 'SPEC', answerKey: 'KEY', questions: 'QS' });
    expect(p).toContain('same root cause');
    expect(p.indexOf('SPEC')).toBeLessThan(p.indexOf('KEY'));
    expect(p.indexOf('KEY')).toBeLessThan(p.indexOf('QS'));
  });

  it('summarizes recall and cost over runs', () => {
    const run = (hits: number) => ({
      review: { costUsd: 3 },
      grade: { costUsd: 1 },
      matches: Array.from({ length: 7 }, (_, i) => ({ key: `K-${i}`, question: i < hits ? 'Q-1' : null, quote: '' })),
    });
    expect(summarize('s', [run(5), run(6)], Array.from({ length: 7 }, (_, i) => `K-${i}`))).toEqual({
      subject: 's',
      keys: 7,
      recalls: [5, 6],
      mean: 5.5,
      costUsd: 8,
    });
  });
});
