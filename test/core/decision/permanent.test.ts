import { describe, expect, it } from 'vitest';
import { parseDecisions } from '../../../src/core/decision/parse.js';
import { appendDecisions, assignPermanentIds, rewriteDecisionRefs } from '../../../src/core/decision/permanent.js';
import { DECISIONS_MD, LOCAL_DECISIONS_MD } from '../../helpers/fixtures.js';

const decisions = (text: string) => parseDecisions(text, 'd.md').decisions;

describe('assignPermanentIds', () => {
  it('continues after the highest canonical id, in local id order', () => {
    const local = decisions('## D-2: b\n\nrule b\n\n## D-1: a\n\nrule a\n');
    expect(assignPermanentIds(local, decisions(DECISIONS_MD))).toEqual({ map: { 'D-1': 'D-022', 'D-2': 'D-023' }, diagnostics: [] });
    expect(assignPermanentIds(local, []).map).toEqual({ 'D-1': 'D-001', 'D-2': 'D-002' });
  });

  it('refuses a local id that is also a canonical id', () => {
    const r = assignPermanentIds(decisions('## D-1: a\n\nrule\n'), decisions('## D-1: hand-written\n\nrule\n'));
    expect(r.map).toEqual({});
    expect(r.diagnostics.map((d) => [d.code, d.target?.id])).toEqual([['DECISION_ID_CONFLICT', 'D-1']]);
  });
});

describe('rewriteDecisionRefs', () => {
  it('rewrites whole local ids only', () => {
    expect(rewriteDecisionRefs('See D-1, D-12 and D-021 (D-10). AD-1 stays.', { 'D-1': 'D-022', 'D-12': 'D-033' })).toBe(
      'See D-022, D-033 and D-021 (D-10). AD-1 stays.',
    );
  });
});

describe('appendDecisions', () => {
  const local = rewriteDecisionRefs(LOCAL_DECISIONS_MD, { 'D-1': 'D-022' });

  it('appends the decisions with Change and marks the one they supersede', () => {
    const r = appendDecisions(DECISIONS_MD, local, 'tighten-shipping');
    expect(r.diagnostics).toEqual([]);
    expect(decisions(r.text!).map((d) => [d.id, d.change, d.supersededBy])).toEqual([
      ['D-021', 'seed-orders', 'D-022'],
      ['D-022', 'tighten-shipping', null],
    ]);
    expect(r.text).toContain('- **Change:** seed-orders\n- **Superseded by:** D-022\n');
    expect(r.text).toContain('- **Supersedes:** D-021\n- **Change:** tighten-shipping\n');
  });

  it('creates the log when there is none', () => {
    const one = rewriteDecisionRefs('# Decisions\n\n## D-1: a\n- **Date:** 2026-10-06\n\nrule\n\n**Why:** w\n', { 'D-1': 'D-001' });
    expect(appendDecisions(null, one, 'c')).toEqual({
      text: '# Decisions\n\n## D-001: a\n- **Date:** 2026-10-06\n- **Change:** c\n\nrule\n\n**Why:** w\n',
      diagnostics: [],
    });
  });

  it('leaves the log alone when the change has no decisions', () => {
    expect(appendDecisions(null, '', 'c')).toEqual({ text: null, diagnostics: [] });
    expect(appendDecisions(DECISIONS_MD, '# Decisions\n', 'c')).toEqual({ text: DECISIONS_MD, diagnostics: [] });
  });

  it('refuses to supersede a decision that is already superseded', () => {
    const canonical = DECISIONS_MD.replace('- **Change:** seed-orders', '- **Change:** seed-orders\n- **Superseded by:** D-030');
    const r = appendDecisions(canonical, local, 'x');
    expect(r.diagnostics.map((d) => [d.code, d.target?.id])).toEqual([['DECISION_ID_CONFLICT', 'D-021']]);
  });
});
