#!/usr/bin/env node
// Runs /comb:review on a benchmark subject N times and grades every run against the subject's answer key.
// Usage: node bench/run.mjs <subject> [--runs N]
// Needs `npm run build` and the `claude` CLI. Each run costs roughly $3–5 (one review and one grader).
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerKeys, graderPrompt, parseArgs, parseGrade, resultOf, runAll, summarize } from './lib.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
if (!args) {
  console.error('usage: node bench/run.mjs <subject> [--runs N]');
  process.exit(2);
}
const { subject, runs } = args;
const dir = join(repo, 'bench', subject);
const config = JSON.parse(readFileSync(join(dir, 'bench.json'), 'utf8'));
const answerKey = readFileSync(join(dir, 'expected-highs.md'), 'utf8');
const keys = answerKeys(answerKey);
const spec = readFileSync(join(dir, config.spec), 'utf8');

const tmp = mkdtempSync(join(tmpdir(), `comb-bench-${subject}-`));
mkdirSync(join(tmp, 'bin'));
writeFileSync(join(tmp, 'bin', 'comb'), `#!/bin/sh\nexec node ${join(repo, 'dist', 'cli', 'index.js')} "$@"\n`);
chmodSync(join(tmp, 'bin', 'comb'), 0o755);
const env = { ...process.env, PATH: `${join(tmp, 'bin')}:${process.env.PATH}` };

const sh = (cmd, cwd) => {
  const r = spawnSync('sh', ['-c', cmd], { cwd, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr}`);
};
// Long prompts (the grader's carries the spec and every question) go through stdin: argv has a per-argument limit on Linux.
const claude = (prompt, cwd, tools, { stdin = false } = {}) => {
  const flags = ['--permission-mode', 'acceptEdits', '--allowedTools', ...tools, '--output-format', 'stream-json', '--verbose'];
  const r = spawnSync('claude', stdin ? ['-p', ...flags] : ['-p', prompt, ...flags], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    ...(stdin ? { input: prompt } : {}),
  });
  if (r.error) throw new Error(`could not run claude: ${r.error.message}`);
  const result = resultOf(r.stdout ?? '');
  if (!result) throw new Error(`claude produced no result event: ${r.stderr}`);
  if (!result.ok) throw new Error(`claude ended with an error: ${result.text}`);
  return result;
};

mkdirSync(join(repo, 'bench', 'results'), { recursive: true });
const out = join(repo, 'bench', 'results', `${subject}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const save = (results) => writeFileSync(out, `${JSON.stringify({ ...summarize(subject, results, keys), pass: config.pass, runs: results }, null, 2)}\n`);

const results = runAll(runs, (i) => {
  const work = join(tmp, `run-${i}`);
  cpSync(join(dir, 'project'), work, { recursive: true });
  sh('git init -q && comb init --language en >/dev/null && git add -A && git commit -qm base', work);
  const review = claude(`/comb:review ${config.change}`, work, ['Bash(comb:*)', 'Read', 'Write', 'Edit', 'Glob', 'Grep']);
  const questions = readFileSync(join(work, 'comb', 'changes', config.change, 'questions.md'), 'utf8');
  const grade = claude(graderPrompt({ spec, answerKey, questions }), work, ['Read'], { stdin: true });
  const matches = parseGrade(grade.text, keys);
  console.log(`run ${i}: ${matches.filter((m) => m.question).length}/${keys.length}  (review $${review.costUsd.toFixed(2)}, ${review.minutes} min, ${review.toolErrors} tool errors)`);
  return { run: i, workDir: work, review: { ...review, text: undefined }, grade: { costUsd: grade.costUsd, minutes: grade.minutes }, matches };
}, save);
for (const r of results.filter((x) => x.error)) console.log(`run ${r.run}: failed: ${r.error}`);
const summary = summarize(subject, results, keys);
console.log(
  `mean ${summary.mean.toFixed(1)}/${keys.length} over ${summary.recalls.length} run(s) (pass bar ${config.pass}), ${summary.failed} failed, $${summary.costUsd.toFixed(2)}; written to ${out}`,
);
