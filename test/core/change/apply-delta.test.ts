import { describe, expect, it } from 'vitest';
import { applyDelta, checkMerged } from '../../../src/core/change/apply-delta.js';
import { parseDelta } from '../../../src/core/spec/parse-delta.js';
import { parseSpec } from '../../../src/core/spec/parse-spec.js';
import { validateCapability } from '../../../src/core/spec/validate-spec.js';
import { MODIFY_PAYMENT_DELTA, ORDER_SPEC } from '../../helpers/fixtures.js';

const delta = (text: string) => parseDelta(text, 'order-lifecycle', 'd.md').delta;
const ids = (text: string) => parseSpec(text, 'order-lifecycle', 's.md').capability.requirements.map((r) => r.id);

const ADD_REFUND = `## ADDED Requirements

### Requirement: REQ-ORDER-003 Refund
Refund on cancel.

#### Scenario: Cancelled
- **GIVEN** a paid order
- **WHEN** it is cancelled
- **THEN** the buyer is refunded
`;
const REMOVE_PAYMENT = '## REMOVED Requirements\n\n### Requirement: REQ-ORDER-002\n**Reason:** merged into REQ-ORDER-001\n';
const SECTIONS = `## MODIFIED Sections

### Section: Conventions
金額は税込の整数円。

## ADDED Sections

### Section: Timers
| timer | duration |
|---|---|
| payment | 2 days |
`;

describe('applyDelta', () => {
  it('replaces only the MODIFIED block', () => {
    const modify001 = `## MODIFIED Requirements\n\n### Requirement: REQ-ORDER-001 注文の作成\nThe system MUST create an order at "Buy".\n\n#### Scenario: 成功\n- **GIVEN** an on-sale listing\n- **WHEN** the buyer taps "Buy"\n- **THEN** an order is created\n`;
    const { text, diagnostics } = applyDelta(ORDER_SPEC, delta(modify001), 'd.md');
    expect(diagnostics).toEqual([]);
    const at = (t: string, s: string) => t.slice(t.indexOf(s));
    expect(text.slice(0, text.indexOf('### Requirement: REQ-ORDER-001'))).toBe(ORDER_SPEC.slice(0, ORDER_SPEC.indexOf('### Requirement: REQ-ORDER-001')));
    expect(at(text, '### Requirement: REQ-ORDER-002')).toBe(at(ORDER_SPEC, '### Requirement: REQ-ORDER-002'));
    expect(text).toContain('The system MUST create an order at "Buy".\n');
    expect(ids(text)).toEqual(['REQ-ORDER-001', 'REQ-ORDER-002']);
  });

  it('removes a REMOVED block and retires its id in the frontmatter', () => {
    const { text, diagnostics } = applyDelta(ORDER_SPEC, delta(REMOVE_PAYMENT), 'd.md');
    expect(diagnostics).toEqual([]);
    const cap = parseSpec(text, 'order-lifecycle', 's.md').capability;
    expect(cap.requirements.map((r) => r.id)).toEqual(['REQ-ORDER-001']);
    expect(cap.retired).toEqual(['REQ-ORDER-010', 'REQ-ORDER-002']);
    expect(text).toContain('retired: [ REQ-ORDER-010, REQ-ORDER-002 ]');
    expect(text.endsWith('```\n')).toBe(true);
  });

  it('adds an ADDED block at the end of Requirements, before any later section', () => {
    const spec = `${ORDER_SPEC}\n## Notes\nfree text\n`;
    const { text } = applyDelta(spec, delta(ADD_REFUND), 'd.md');
    expect(ids(text)).toEqual(['REQ-ORDER-001', 'REQ-ORDER-002', 'REQ-ORDER-003']);
    expect(text.indexOf('REQ-ORDER-003')).toBeLessThan(text.indexOf('## Notes'));
    expect(text.endsWith('- **THEN** the buyer is refunded\n\n## Notes\nfree text\n')).toBe(true);
  });

  it('replaces MODIFIED sections and inserts ADDED sections before Requirements', () => {
    const { text, diagnostics } = applyDelta(ORDER_SPEC, delta(SECTIONS), 'd.md');
    expect(diagnostics).toEqual([]);
    const cap = parseSpec(text, 'order-lifecycle', 's.md').capability;
    expect(cap.sections.map((s) => [s.heading, s.content])).toEqual([
      ['Purpose', '注文のライフサイクル。'],
      ['Conventions', '金額は税込の整数円。'],
      ['Timers', '| timer | duration |\n|---|---|\n| payment | 2 days |'],
    ]);
    expect(ids(text)).toEqual(['REQ-ORDER-001', 'REQ-ORDER-002']);
  });

  it('skips operations that are already applied', () => {
    const d = delta(`${MODIFY_PAYMENT_DELTA}\n${ADD_REFUND}\n${SECTIONS}`);
    const once = applyDelta(ORDER_SPEC, d, 'd.md');
    const twice = applyDelta(once.text, d, 'd.md');
    expect(twice.text).toBe(once.text);
    expect(twice.diagnostics).toEqual([]);
    expect([...twice.skipped].sort()).toEqual(['REQ-ORDER-002', 'REQ-ORDER-003', 'Section: Conventions', 'Section: Timers']);
    const removedTwice = applyDelta(applyDelta(ORDER_SPEC, delta(REMOVE_PAYMENT), 'd.md').text, delta(REMOVE_PAYMENT), 'd.md');
    expect(removedTwice.skipped).toEqual(['REQ-ORDER-002']);
    expect(removedTwice.diagnostics).toEqual([]);
  });

  it('reports conflicts instead of guessing', () => {
    const clash = '## ADDED Requirements\n\n### Requirement: REQ-ORDER-002 Payment\nDifferent.\n\n#### Scenario: s\n- **GIVEN** a\n';
    expect(applyDelta(ORDER_SPEC, delta(clash), 'd.md').diagnostics.map((d) => [d.code, d.target?.id])).toEqual([['DELTA_ID_EXISTS', 'REQ-ORDER-002']]);
    const missing = MODIFY_PAYMENT_DELTA.replace(/REQ-ORDER-002/g, 'REQ-ORDER-077');
    expect(applyDelta(ORDER_SPEC, delta(missing), 'd.md').diagnostics.map((d) => [d.code, d.target?.id])).toEqual([['DELTA_TARGET_MISSING', 'REQ-ORDER-077']]);
  });

  it('creates the spec of a new capability', () => {
    const created = `---\nprefix: LEND\n---\n## Purpose\nLending books.\n\n## ADDED Requirements\n\n### Requirement: REQ-LEND-001 Lend\nA member lends a book.\n\n#### Scenario: Lend\n- **GIVEN** a book\n- **WHEN** lent\n- **THEN** it is on loan\n\n## ADDED Sections\n\n### Section: States\navailable, on_loan\n`;
    const { text, diagnostics } = applyDelta(null, parseDelta(created, 'book-lending', 'd.md').delta, 'd.md');
    expect(diagnostics).toEqual([]);
    expect(text).toBe(
      '---\nprefix: LEND\n---\n# book-lending\n\n## Purpose\nLending books.\n\n## States\navailable, on_loan\n\n## Requirements\n\n### Requirement: REQ-LEND-001 Lend\nA member lends a book.\n\n#### Scenario: Lend\n- **GIVEN** a book\n- **WHEN** lent\n- **THEN** it is on loan\n',
    );
    expect(validateCapability(parseSpec(text, 'book-lending', 's.md').capability, 's.md')).toEqual([]);
  });

  it('never treats a heading inside a code fence as a requirement', () => {
    const r = applyDelta(ORDER_SPEC, delta('## REMOVED Requirements\n\n### Requirement: REQ-ORDER-999\n**Reason:** r\n'), 'd.md');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['DELTA_TARGET_MISSING']);
    expect(r.text).toBe(ORDER_SPEC);
  });

  it('replaces the Purpose through MODIFIED Sections', () => {
    const { text, diagnostics } = applyDelta(ORDER_SPEC, delta('## MODIFIED Sections\n\n### Section: Purpose\n注文と返品のライフサイクル。\n'), 'd.md');
    expect(diagnostics).toEqual([]);
    expect(parseSpec(text, 'order-lifecycle', 's.md').capability.purpose).toBe('注文と返品のライフサイクル。');
  });

  it('refuses a section named Requirements instead of hiding the requirements', () => {
    const r = applyDelta(ORDER_SPEC, delta('## ADDED Sections\n\n### Section: Requirements\nnothing\n'), 'd.md');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SPEC_PARSE']);
    expect(r.text).toBe(ORDER_SPEC);
  });

  it('checkMerged reports requirements or sections that a merge would hide', () => {
    const d = delta(MODIFY_PAYMENT_DELTA);
    const hidden = applyDelta(ORDER_SPEC, d, 'd.md').text.replace('### Requirement: REQ-ORDER-002', '```\n### Requirement: REQ-ORDER-002');
    expect(checkMerged(ORDER_SPEC, d, hidden, 'd.md').map((x) => x.code)).toEqual(['SPEC_PARSE']);
    expect(checkMerged(ORDER_SPEC, d, applyDelta(ORDER_SPEC, d, 'd.md').text, 'd.md')).toEqual([]);
  });

  it('adds to the retired list without losing comments or wrapping it', () => {
    const many = Array.from({ length: 12 }, (_, i) => `REQ-ORDER-${String(100 + i)}`).join(', ');
    const spec = ORDER_SPEC.replace('prefix: ORDER\nretired: [REQ-ORDER-010]', `prefix: ORDER # the order prefix\nretired: [${many}] # never reuse these`);
    const { text } = applyDelta(spec, delta(REMOVE_PAYMENT), 'd.md');
    const frontmatter = text.slice(0, text.indexOf('\n---\n', 4));
    expect(frontmatter).toContain('# the order prefix');
    expect(frontmatter).toContain('# never reuse these');
    expect(frontmatter.split('\n').filter((l) => l.includes('REQ-ORDER-'))).toHaveLength(1);
    expect(parseSpec(text, 'order-lifecycle', 's.md').capability.retired.at(-1)).toBe('REQ-ORDER-002');
  });

  it('modifies a section with subsections written one level deeper in the delta', () => {
    const spec = ORDER_SPEC.replace('## Requirements', '## Fees\nIntro.\n\n### Domestic\n500 yen.\n\n### International\n900 yen.\n\n## Requirements');
    const d = delta('## MODIFIED Sections\n\n### Section: Fees\nIntro.\n\n#### Domestic\n600 yen.\n\n#### International\n900 yen.\n');
    const once = applyDelta(spec, d, 'd.md');
    expect(once.diagnostics).toEqual([]);
    expect(once.text).toContain('## Fees\nIntro.\n\n### Domestic\n600 yen.\n\n### International\n900 yen.\n');
    expect(applyDelta(once.text, d, 'd.md').skipped).toEqual(['Section: Fees']);
  });
});
