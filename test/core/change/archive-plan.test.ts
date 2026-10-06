import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planArchive, type ArchiveOptions, type ArchivePlan } from '../../../src/core/change/archive-plan.js';
import { loadAllChanges, loadProject } from '../../../src/core/project/load.js';
import { readyProject, TIGHTEN_DELTA, TIGHTEN_QUESTIONS } from '../../helpers/archive.js';
import { DECISIONS_MD, ORDER_SPEC } from '../../helpers/fixtures.js';

const NO_FLAGS: ArchiveOptions = { yes: false, allowDroppedScenarios: false, allowBaseDrift: false };
const plan = (root: string, opts: ArchiveOptions = NO_FLAGS) => {
  const all = loadAllChanges(root);
  return planArchive(loadProject(root), all.find((c) => c.id === 'tighten-payment')!, all, opts, '2026-10-06');
};
const written = (p: ArchivePlan, file: string) => p.writes.find((w) => w.file === file)?.text;

describe('planArchive', () => {
  it('plans the merge: permanent ids, rewritten references, the spec and the log', () => {
    const { plan: p, diagnostics } = plan(readyProject());
    expect(diagnostics).toEqual([]);
    expect(p!.from).toBe('comb/changes/tighten-payment');
    expect(p!.to).toBe('comb/changes/archive/2026-10-06-tighten-payment');
    expect(p!.decisions).toEqual([{ local: 'D-1', permanent: 'D-022' }]);
    expect(p!.capabilities).toEqual([{ capability: 'order-lifecycle', created: false, added: [], modified: ['REQ-ORDER-002'], removed: [], sections: [] }]);
    expect(p!.writes.map((w) => w.file)).toEqual([
      'comb/changes/tighten-payment/specs/order-lifecycle/spec.md',
      'comb/specs/order-lifecycle/spec.md',
      'comb/changes/tighten-payment/questions.md',
      'comb/changes/tighten-payment/decisions.md',
      'comb/decisions.md',
    ]);
    expect(written(p!, 'comb/specs/order-lifecycle/spec.md')).toContain('Pay within 2 days (D-022).');
    expect(written(p!, 'comb/changes/tighten-payment/questions.md')).toContain('- **Decision:** D-022');
    expect(written(p!, 'comb/decisions.md')).toContain(
      '## D-022: Payment window is two days\n- **Date:** 2026-10-06\n- **Refs:** REQ-ORDER-002\n- **From:** Q-1\n- **Change:** tighten-payment\n',
    );
  });

  it('blocks on a stale review, open questions and unfinished tasks', () => {
    const root = readyProject({
      'comb/changes/tighten-payment/questions.md': `${TIGHTEN_QUESTIONS}\n## Q-2: Later?\n- **Status:** open\n- **Severity:** low\n`,
      'comb/changes/tighten-payment/tasks.md': '- [x] 1.1 a\n- [ ] 1.2 b\n',
    });
    writeFileSync(join(root, 'comb/changes/tighten-payment/specs/order-lifecycle/spec.md'), TIGHTEN_DELTA.replace('2 days', 'two days'));
    const { plan: p, diagnostics } = plan(root);
    expect(p).toBeNull();
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      ['ARCHIVE_BLOCKED', 'the review is stale (the delta changed since the review)'],
      ['ARCHIVE_BLOCKED', '1 question(s) are still open'],
      ['ARCHIVE_BLOCKED', '1/2 tasks are done'],
    ]);
    expect(plan(root, { ...NO_FLAGS, yes: true }).diagnostics.map((d) => d.message)).toEqual([
      'the review is stale (the delta changed since the review)',
      '1 question(s) are still open',
    ]);
  });

  it('needs --yes to archive a change that was never reviewed', () => {
    const root = readyProject();
    rmSync(join(root, 'comb/changes/tighten-payment/review.md'));
    expect(plan(root).diagnostics.map((d) => d.message)).toEqual(['the change has no review']);
    expect(plan(root, { ...NO_FLAGS, yes: true }).plan).not.toBeNull();
  });

  it('needs explicit flags for dropped scenarios and base drift', () => {
    const root = readyProject({
      'comb/changes/tighten-payment/specs/order-lifecycle/spec.md': TIGHTEN_DELTA.replace('#### Scenario: Paid in time', '#### Scenario: Paid quickly'),
      'comb/changes/tighten-payment/.comb.yaml':
        'schema: comb.change/v1\nid: tighten-payment\ncreated: 2026-10-06\nbase: { REQ-ORDER-002: "sha256:0000000000000000" }\n',
    });
    expect(plan(root).diagnostics.filter((d) => d.code === 'ARCHIVE_BLOCKED').map((d) => d.fix)).toEqual([
      'Restore them, or pass --allow-dropped-scenarios',
      'Update the delta to the current spec, then pass --allow-base-drift',
    ]);
    const ok = plan(root, { yes: false, allowDroppedScenarios: true, allowBaseDrift: true });
    expect(ok.plan).not.toBeNull();
    expect(ok.diagnostics.map((d) => d.code).sort()).toEqual(['BASE_DRIFT', 'SCENARIO_DROPPED']);
  });

  it('stops on validation errors before planning anything', () => {
    const { plan: p, diagnostics } = plan(readyProject({ 'comb/changes/tighten-payment/decisions.md': '# Decisions\n' }));
    expect(p).toBeNull();
    expect(diagnostics.some((d) => d.code === 'REF_UNKNOWN_DECISION')).toBe(true);
  });

  it('refuses when a local decision id is also a canonical id', () => {
    const root = readyProject({ 'comb/decisions.md': `${DECISIONS_MD}\n## D-1: Hand-written\n- **Date:** 2026-10-01\n\nrule\n\n**Why:** w\n` });
    const { plan: p, diagnostics } = plan(root);
    expect(p).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual(['DECISION_ID_CONFLICT']);
  });

  it('refuses a merge that would hide requirements (a spec that ends inside an open fence)', () => {
    const add = '## ADDED Requirements\n\n### Requirement: REQ-ORDER-003 Refund\nRefund on cancel (D-1).\n\n#### Scenario: Cancelled\n- **GIVEN** a paid order\n- **WHEN** it is cancelled\n- **THEN** the buyer is refunded\n';
    const root = readyProject({
      'comb/specs/order-lifecycle/spec.md': `${ORDER_SPEC}\n\`\`\`\n`,
      'comb/changes/tighten-payment/specs/order-lifecycle/spec.md': add,
    });
    const { plan: p, diagnostics } = plan(root);
    expect(p).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual(['SPEC_PARSE']);
  });
});
