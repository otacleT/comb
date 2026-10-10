import { describe, expect, it } from 'vitest';
import { parseDelta } from '../../../src/core/spec/parse-delta.js';

const DELTA = `## ADDED Requirements

### Requirement: REQ-ORDER-003 Auto-cancel
Cancel unpaid orders after 3 days.

#### Scenario: Expired
- **GIVEN** an unpaid order
- **WHEN** 3 days pass
- **THEN** the order is cancelled

## MODIFIED Requirements

### Requirement: REQ-ORDER-002 Payment (revised)
Pay within 2 days.

#### Scenario: Paid in time
- **GIVEN** an unpaid order
- **WHEN** payment arrives
- **THEN** the order is paid

## REMOVED Requirements

### Requirement: REQ-ORDER-001
**Reason:** replaced by REQ-ORDER-003
**Migration:** none

## MODIFIED Sections

### Section: Conventions
金額は税込の整数円。

## ADDED Sections

### Section: Timers
| Timer | Duration |
`;

describe('parseDelta', () => {
  it('reads every delta section', () => {
    const { delta, diagnostics } = parseDelta(DELTA, 'order-lifecycle', 'd.md');
    expect(diagnostics).toEqual([]);
    expect(delta.prefix).toBeNull();
    expect(delta.added.map((r) => r.id)).toEqual(['REQ-ORDER-003']);
    expect(delta.modified.map((r) => [r.id, r.title])).toEqual([['REQ-ORDER-002', 'Payment (revised)']]);
    expect(delta.modified[0]!.scenarios.map((s) => s.name)).toEqual(['Paid in time']);
    expect(delta.removed).toEqual([{ id: 'REQ-ORDER-001', reason: 'replaced by REQ-ORDER-003', migration: 'none', line: 23 }]);
    expect(delta.modifiedSections.map((s) => [s.heading, s.content])).toEqual([['Conventions', '金額は税込の整数円。']]);
    expect(delta.addedSections.map((s) => s.heading)).toEqual(['Timers']);
  });

  it('reads prefix and purpose for a new capability', () => {
    const text = '---\nprefix: PAY\n---\n## Purpose\n支払い。\n\n## ADDED Requirements\n';
    const { delta } = parseDelta(text, 'payment', 'd.md');
    expect(delta.prefix).toBe('PAY');
    expect(delta.purpose).toBe('支払い。');
  });

  it('reports unknown sections and malformed headings', () => {
    const text = '## RENAMED Requirements\n\n## ADDED Requirements\n\n### Foo\n\n## ADDED Sections\n\n### Bar\n';
    const { diagnostics } = parseDelta(text, 'x', 'd.md');
    expect(diagnostics.map((d) => [d.code, d.target?.line])).toEqual([
      ['SPEC_PARSE', 1],
      ['SPEC_PARSE', 5],
      ['SPEC_PARSE', 9],
    ]);
  });

  it('reports a block that ends inside an unclosed code fence', () => {
    const text = '## MODIFIED Requirements\n\n### Requirement: REQ-ORDER-001 x\nbody\n\n#### Scenario: s\n- **GIVEN** a\n\n```md\n### Requirement: REQ-ORDER-999 example\n';
    expect(parseDelta(text, 'order-lifecycle', 'd.md').diagnostics.map((d) => [d.code, d.target?.line])).toEqual([['SPEC_PARSE', 3]]);
    const section = '## ADDED Sections\n\n### Section: Examples\n```md\n## Requirements\n';
    expect(parseDelta(section, 'order-lifecycle', 'd.md').diagnostics.map((d) => [d.code, d.target?.line])).toEqual([['SPEC_PARSE', 3]]);
  });

  it("tells how to write a section's own subsections", () => {
    const { diagnostics } = parseDelta('## MODIFIED Sections\n\n### Section: Fees\nIntro.\n\n### Domestic\n600 yen.\n', 'order-lifecycle', 'd.md');
    expect(diagnostics.map((d) => d.fix)).toEqual(['Write a section\'s own subsections one level deeper (#### …); archive writes them back as ###']);
  });

  it('asks for the Section: prefix when no section came before the heading', () => {
    const { diagnostics } = parseDelta('## MODIFIED Sections\n\n### Conventions\nAll prices include tax.\n', 'order-lifecycle', 'd.md');
    expect(diagnostics.map((d) => d.fix)).toEqual(['Use "### Section: <heading>"']);
  });

  it('moves a requirement, section or scenario heading written as ## to its level', () => {
    const fixes = (text: string) => parseDelta(text, 'order-lifecycle', 'd.md').diagnostics.map((d) => d.fix);
    expect(fixes('## Requirement: REQ-ORDER-003 Auto-cancel\n')).toEqual([
      'Use "### Requirement: REQ-ORDER-003 Auto-cancel" under "## ADDED Requirements", "## MODIFIED Requirements" or "## REMOVED Requirements"',
    ]);
    expect(fixes('## Section: Timers\n')).toEqual(['Use "### Section: Timers" under "## ADDED Sections" or "## MODIFIED Sections"']);
    expect(fixes('## Scenario: Expired\n')).toEqual(['Use "#### Scenario: Expired" under its "### Requirement: …"']);
  });
});
