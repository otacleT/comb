// Pure helpers for bench/run.mjs, kept apart so they can be unit-tested.

/** Turns, cost, minutes, tool errors and the final text of a `claude -p --output-format stream-json` transcript. */
export function resultOf(jsonl) {
  let toolErrors = 0;
  let result = null;
  for (const line of jsonl.split('\n')) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // blank or non-JSON output lines
    }
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      toolErrors += e.message.content.filter((c) => c.type === 'tool_result' && c.is_error).length;
    }
    if (e.type === 'result') result = e;
  }
  if (!result) return null;
  return {
    ok: !result.is_error && (result.subtype === undefined || result.subtype === 'success'),
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

const questionId = (q) => (typeof q === 'string' && /^Q-\d+$/.test(q.trim()) ? q.trim() : null);

/**
 * The grader's verdict for every key. The last ```json fence wins (a grader may correct itself); only a `Q-<n>` counts
 * as a match, so "none", "N/A" or "" never inflate recall; keys the grader skipped count as not matched.
 */
export function parseGrade(text, keys) {
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const raw = fences.length > 0 ? fences[fences.length - 1][1] : /(\{[\s\S]*\})/.exec(text)?.[1];
  if (!raw) throw new Error('grader returned no JSON');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.matches)) throw new Error('grader JSON has no "matches" array');
  const byKey = new Map(parsed.matches.map((x) => [x.key, x]));
  return keys.map((key) => ({ key, question: questionId(byKey.get(key)?.question), quote: byKey.get(key)?.quote ?? '' }));
}

/** `<subject> [--runs N | --runs=N]`, or null when the arguments are not usable. */
export function parseArgs(argv) {
  const [subject, ...rest] = argv;
  if (!subject || subject.startsWith('-')) return null;
  let runs = 1;
  for (let i = 0; i < rest.length; i++) {
    const m = /^--runs(?:=(.*))?$/.exec(rest[i]);
    if (!m) return null;
    runs = Number(m[1] ?? rest[++i]);
  }
  return Number.isInteger(runs) && runs > 0 ? { subject, runs } : null;
}

/** Runs `runOne(i)` for i = 1..n. A run that throws is recorded as { run, error } and the others continue; `save` gets the results after every run. */
export function runAll(n, runOne, save) {
  const results = [];
  for (let i = 1; i <= n; i++) {
    try {
      results.push(runOne(i));
    } catch (e) {
      results.push({ run: i, error: e instanceof Error ? e.message : String(e) });
    }
    save(results);
  }
  return results;
}

/** Recall over the runs that completed; failed runs are counted, not scored. */
export function summarize(subject, runs, keys) {
  const done = runs.filter((r) => !r.error);
  const recalls = done.map((r) => r.matches.filter((x) => x.question).length);
  return {
    subject,
    keys: keys.length,
    recalls,
    failed: runs.length - done.length,
    mean: recalls.reduce((a, b) => a + b, 0) / (recalls.length || 1),
    costUsd: done.reduce((sum, r) => sum + r.review.costUsd + r.grade.costUsd, 0),
  };
}
