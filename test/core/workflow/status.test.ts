import { describe, expect, it } from 'vitest';
import { diag } from '../../../src/core/diagnostics.js';
import type { ChangeSnapshot } from '../../../src/core/project/load.js';
import { parseDelta } from '../../../src/core/spec/parse-delta.js';
import { computeStatus, countTasks, proposalComplete } from '../../../src/core/workflow/status.js';
import { deltaHash } from '../../../src/core/workflow/hash.js';
import { stampReview } from '../../../src/core/workflow/review-stamp.js';
import { loadChange } from '../../../src/core/project/load.js';
import { readyProject, TIGHTEN_QUESTIONS } from '../../helpers/archive.js';

const PROPOSAL = '# Change: x\n\n## Why\nw\n\n## What Changes\n- a\n\n## Impact\n- b\n';

function snapshot(files: ChangeSnapshot['files'], withDelta = false): ChangeSnapshot {
  const text = '## ADDED Requirements\n';
  const deltas = withDelta
    ? [{ capability: 'c', path: '/p', file: 'comb/changes/x/specs/c/spec.md', text, delta: parseDelta(text, 'c', 'f').delta, diagnostics: [] }]
    : [];
  return { id: 'x', dir: '/d', meta: null, files, deltas, diagnostics: [] };
}

describe('status helpers', () => {
  it('counts checkbox tasks', () => {
    expect(countTasks('- [ ] 1.1 a\n- [x] 1.2 b\n* [X] 1.3 c\nnot a task')).toEqual({ done: 2, total: 3 });
    expect(countTasks(undefined)).toEqual({ done: 0, total: 0 });
  });

  it('requires Why / What Changes / Impact in the proposal', () => {
    expect(proposalComplete(PROPOSAL)).toBe(true);
    expect(proposalComplete('# Change: x\n\n## Why\nw\n')).toBe(false);
  });
});

describe('computeStatus', () => {
  it('points to the proposal first', () => {
    const s = computeStatus(snapshot({}), []);
    expect(s.next).toBe('proposal');
    expect(s.artifacts.map((a) => `${a.id}:${a.state}`)).toEqual([
      'proposal:missing', 'delta:missing', 'review:missing', 'clarify:done', 'tasks:missing', 'apply:missing',
    ]);
  });

  it('marks the delta invalid when validation has errors', () => {
const s = computeStatus(snapshot({ proposal: PROPOSAL }, true), [diag('error', 'DELTA_EMPTY', 'x', { file: 'comb/changes/x/specs/c/spec.md' })]);
    expect(s.artifacts[1]).toEqual({ id: 'delta', state: 'invalid', detail: '1 error(s)' });
    expect(s.next).toBe('delta');
  });

it('goes to review after a valid delta, then tasks/apply, then archive', () => {
  const reviewed = stampReview('r', deltaHash(snapshot({}, true)), {})!;
  expect(computeStatus(snapshot({ proposal: PROPOSAL, tasks: '- [ ] a' }, true), []).next).toBe('review');
  const s = computeStatus(snapshot({ proposal: PROPOSAL, review: reviewed, tasks: '- [x] a\n- [ ] b' }, true), []);
  expect(s.next).toBe('apply');
  expect(s.tasks).toEqual({ done: 1, total: 2 });
  expect(s.artifacts[5]).toEqual({ id: 'apply', state: 'in-progress', detail: '1/2' });
  expect(computeStatus(snapshot({ proposal: PROPOSAL, review: reviewed, tasks: '- [x] a' }, true), []).next).toBe('archive');
});

it('marks the review stale when it was never stamped or the delta changed since', () => {
  const unstamped = computeStatus(snapshot({ proposal: PROPOSAL, review: 'r' }, true), []);
  expect(unstamped.artifacts[2]).toEqual({ id: 'review', state: 'stale', detail: 'not marked reviewed (run comb mark-reviewed)' });
  const old = computeStatus(snapshot({ proposal: PROPOSAL, review: stampReview('r', 'sha256:0000000000000000', {})! }, true), []);
  expect(old.artifacts[2]).toEqual({ id: 'review', state: 'stale', detail: 'the delta changed since the review' });
  expect(old.next).toBe('review');
});

it('blocks clarify while a high question is open and counts questions', () => {
  const reviewed = stampReview('r', deltaHash(snapshot({}, true)), {})!;
  const questions =
    '## Q-1: a\n- **Status:** open\n- **Severity:** high\n\n## Q-2: b\n- **Status:** open\n- **Severity:** low\n\n## Q-3: c\n- **Status:** deferred\n- **Severity:** medium\n';
  const s = computeStatus(snapshot({ proposal: PROPOSAL, review: reviewed, questions, tasks: '- [ ] a' }, true), []);
  expect(s.artifacts[3]).toEqual({ id: 'clarify', state: 'blocked', detail: '1 high question(s) open' });
  expect(s.next).toBe('clarify');
  expect(s.questions).toEqual({ open: 2, openHigh: 1, answered: 0, deferred: 1 });
  const lowOnly = computeStatus(
    snapshot({ proposal: PROPOSAL, review: reviewed, questions: questions.replace('high', 'medium'), tasks: '- [ ] a' }, true),
    [],
  );
  expect(lowOnly.artifacts[3]).toEqual({
    id: 'clarify', state: 'open', detail: '2 medium/low question(s): not blocking apply; answer or defer them before archive',
  });
  expect(lowOnly.next).toBe('apply');
});

it('marks clarify invalid for format errors in questions.md', () => {
  const s = computeStatus(snapshot({ proposal: PROPOSAL }, true), [diag('error', 'SPEC_PARSE', 'x', { file: 'comb/changes/x/questions.md' })]);
  expect(s.artifacts[3]).toEqual({ id: 'clarify', state: 'invalid', detail: '1 error(s)' });
  expect(s.artifacts[1]!.state).toBe('done');
});
});

it('lists requirements with base drift', () => {
  const s = computeStatus(snapshot({}), [diag('warning', 'BASE_DRIFT', 'moved', { id: 'REQ-ORDER-002' })]);
  expect(s.baseDrift).toEqual(['REQ-ORDER-002']);
  expect(computeStatus(snapshot({}), []).baseDrift).toEqual([]);
});

it('points to clarify, not archive, while any question is still open', () => {
  const root = readyProject({
    'comb/changes/tighten-payment/questions.md': `${TIGHTEN_QUESTIONS}\n## Q-2: Later?\n- **Status:** open\n- **Severity:** medium\n`,
  });
  const s = computeStatus(loadChange(root, 'tighten-payment')!, []);
  expect(s.artifacts.filter((a) => a.state !== 'done').map((a) => `${a.id}:${a.state}`)).toEqual(['clarify:open']);
  expect(s.next).toBe('clarify');
});

it('says when review.md has a broken frontmatter', () => {
  const s = computeStatus(snapshot({ review: '---\nreviewed: [\n---\n# R\n' }, true), []);
  expect(s.artifacts[2]!.state).toBe('stale');
  expect(s.artifacts[2]!.detail).toContain('broken frontmatter');
});

it('gives the YAML error on one line, with the line number in review.md', () => {
  const s = computeStatus(snapshot({ review: '---\nreviewed: abc\nrequirements: [a\nfoo: : bar\n---\n# R\n' }, true), []);
  const detail = s.artifacts[2]!.detail ?? '';
  expect(detail).not.toContain('\n');
  expect(detail).toContain('line 4');
});
