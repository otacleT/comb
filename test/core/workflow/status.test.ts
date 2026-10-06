import { describe, expect, it } from 'vitest';
import { diag } from '../../../src/core/diagnostics.js';
import type { ChangeSnapshot } from '../../../src/core/project/load.js';
import { parseDelta } from '../../../src/core/spec/parse-delta.js';
import { computeStatus, countTasks, proposalComplete } from '../../../src/core/workflow/status.js';

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
    const s = computeStatus(snapshot({ proposal: PROPOSAL }, true), [diag('error', 'DELTA_EMPTY', 'x')]);
    expect(s.artifacts[1]).toEqual({ id: 'delta', state: 'invalid', detail: '1 error(s)' });
    expect(s.next).toBe('delta');
  });

  it('goes to review after a valid delta, then tasks/apply, then archive', () => {
    expect(computeStatus(snapshot({ proposal: PROPOSAL, tasks: '- [ ] a' }, true), []).next).toBe('review');
    const s = computeStatus(snapshot({ proposal: PROPOSAL, review: 'r', tasks: '- [x] a\n- [ ] b' }, true), []);
    expect(s.next).toBe('apply');
    expect(s.tasks).toEqual({ done: 1, total: 2 });
    expect(s.artifacts[5]).toEqual({ id: 'apply', state: 'in-progress', detail: '1/2' });
    expect(computeStatus(snapshot({ proposal: PROPOSAL, review: 'r', tasks: '- [x] a' }, true), []).next).toBe('archive');
  });
});
