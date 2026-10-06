// Pure helpers for bench/run.mjs, kept apart so they can be unit-tested.

/** Turns, cost, minutes, tool errors and the final text of a `claude -p --output-format stream-json` transcript. */
export function resultOf(jsonl) {
  let toolErrors = 0;
  let result = null;
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      toolErrors += e.message.content.filter((c) => c.type === 'tool_result' && c.is_error).length;
    }
    if (e.type === 'result') result = e;
  }
  if (!result) return null;
  return {
    turns: result.num_turns,
    costUsd: result.total_cost_usd,
    minutes: Math.round(result.duration_ms / 6000) / 10,
    toolErrors,
    text: result.result ?? '',
  };
}

/** The ids in the first column of an expected-highs.md table (`| BL-01 | … |`). */
export const answerKeys = (markdown) => [...markdown.matchAll(/^\|\s*([A-Z]+-\d+)\s*\|/gm)].map((m) => m[1]);

/** The strict matching rule used since F2 (one question per key, same root cause, failure made visible). */
export function graderPrompt({ spec, answerKey, questions }) {
  return [
    'You grade the recall of one AI spec review against a fixed answer key. Be strict and do not use any tools.',
    '',
    'A key item is matched when one QUESTION (any severity) raises the same root cause: the same missing or wrong rule leading to the same kind of bad outcome, and its sequence or text makes that failure visible. A question about a neighbouring issue that does not state the failure is not a match. One question may match several keys if it explicitly covers each.',
    '',
    'Reply with only a JSON object inside a ```json fence: {"matches":[{"key":"<id>","question":"Q-<n>" or null,"quote":"at most 25 words from the question that prove the match, or empty"}]}, one entry per key, in key order.',
    '',
    '## Spec',
    spec,
    '',
    '## Answer key',
    answerKey,
    '',
    '## Questions to grade',
    questions,
  ].join('\n');
}

/** The grader's verdict for every key; keys the grader skipped count as not matched. */
export function parseGrade(text, keys) {
  const m = /```json\s*([\s\S]*?)```/.exec(text) ?? /(\{[\s\S]*\})/.exec(text);
  if (!m) throw new Error('grader returned no JSON');
  const { matches } = JSON.parse(m[1]);
  const byKey = new Map((matches ?? []).map((x) => [x.key, x]));
  return keys.map((key) => ({ key, question: byKey.get(key)?.question ?? null, quote: byKey.get(key)?.quote ?? '' }));
}

export function summarize(subject, runs, keys) {
  const recalls = runs.map((r) => r.matches.filter((x) => x.question).length);
  return {
    subject,
    keys: keys.length,
    recalls,
    mean: recalls.reduce((a, b) => a + b, 0) / (recalls.length || 1),
    costUsd: runs.reduce((sum, r) => sum + r.review.costUsd + r.grade.costUsd, 0),
  };
}
