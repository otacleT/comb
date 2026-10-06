import { describe, expect, it } from 'vitest';
import { answerKeys, graderPrompt, parseArgs, parseGrade, resultOf, runAll, summarize } from '../bench/lib.mjs';

const line = (o: unknown): string => JSON.stringify(o);

describe('bench/lib', () => {
  it('reads turns, cost, minutes and tool errors from a stream-json transcript', () => {
    const jsonl = [
      line({ type: 'system', subtype: 'init' }),
      line({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true }, { type: 'tool_result' }] } }),
      line({ type: 'result', num_turns: 12, total_cost_usd: 2.5, duration_ms: 90000, result: 'done' }),
      '',
    ].join('\n');
    expect(resultOf(jsonl)).toEqual({ ok: true, turns: 12, costUsd: 2.5, minutes: 1.5, toolErrors: 1, text: 'done' });
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
      failed: 0,
      mean: 5.5,
      costUsd: 8,
    });
  });

  it('accepts only Q-<n> as a matched question, uses the last JSON fence, and rejects a reply without matches', () => {
    const reply = '```json\n{"matches":[{"key":"BL-01","question":"Q-9"}]}\n```\nCorrection:\n```json\n{"matches":[{"key":"BL-01","question":"none"},{"key":"BL-02","question":" Q-2 "},{"key":"BL-03","question":""}]}\n```';
    expect(parseGrade(reply, ['BL-01', 'BL-02', 'BL-03']).map((m) => m.question)).toEqual([null, 'Q-2', null]);
    expect(() => parseGrade('```json\n{"results":[]}\n```', ['BL-01'])).toThrow('no "matches" array');
  });

  it('marks a transcript whose result is an error', () => {
    const failed = line({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 3, total_cost_usd: 0.5, duration_ms: 6000 });
    expect(resultOf(failed)?.ok).toBe(false);
    expect(resultOf(`not json\n${failed}`)?.turns).toBe(3);
  });

  it('parses --runs N and --runs=N', () => {
    expect(parseArgs(['s', '--runs', '3'])).toEqual({ subject: 's', runs: 3 });
    expect(parseArgs(['s', '--runs=2'])).toEqual({ subject: 's', runs: 2 });
    expect(parseArgs(['s'])).toEqual({ subject: 's', runs: 1 });
    expect(parseArgs([])).toBeNull();
    expect(parseArgs(['s', '--runs', 'x'])).toBeNull();
  });

  it('records a failed run instead of losing the others, and saves after every run', () => {
    const saved: number[] = [];
    const results = runAll(3, (i: number) => {
      if (i === 2) throw new Error('boom');
      return { run: i, ok: true };
    }, (rs: unknown[]) => saved.push(rs.length));
    expect(results).toEqual([{ run: 1, ok: true }, { run: 2, error: 'boom' }, { run: 3, ok: true }]);
    expect(saved).toEqual([1, 2, 3]);
  });

  it('summarizes only the runs that completed', () => {
    const ok = { review: { costUsd: 3 }, grade: { costUsd: 1 }, matches: [{ key: 'K', question: 'Q-1', quote: '' }] };
    expect(summarize('s', [ok, { run: 2, error: 'boom' }], ['K'])).toEqual({ subject: 's', keys: 1, recalls: [1], failed: 1, mean: 1, costUsd: 4 });
  });
});
