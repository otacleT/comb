import { describe, expect, it } from 'vitest';
import { parseSpec } from '../../../src/core/spec/parse-spec.js';
import { ORDER_SPEC } from '../../helpers/fixtures.js';

describe('parseSpec', () => {
  const { capability, diagnostics } = parseSpec(ORDER_SPEC, 'order-lifecycle', 'comb/specs/order-lifecycle/spec.md');

  it('reads frontmatter, purpose and sections', () => {
    expect(diagnostics).toEqual([]);
    expect(capability.prefix).toBe('ORDER');
    expect(capability.retired).toEqual(['REQ-ORDER-010']);
    expect(capability.purpose).toBe('注文のライフサイクル。');
    expect(capability.sections.map((s) => s.heading)).toEqual(['Purpose', 'Conventions']);
    expect(capability.hasRequirementsHeading).toBe(true);
  });

  it('reads requirements, ignoring headings inside code fences', () => {
    expect(capability.requirements.map((r) => r.id)).toEqual(['REQ-ORDER-001', 'REQ-ORDER-002']);
    const r1 = capability.requirements[0]!;
    expect(r1.title).toBe('注文の作成');
    expect(r1.body).toBe('The system MUST create an order (D-021).');
    expect(r1.decisionRefs).toEqual(['D-021']);
    expect(r1.block.startsWith('### Requirement: REQ-ORDER-001 注文の作成\n')).toBe(true);
    expect(ORDER_SPEC.slice(r1.start, r1.end)).toBe(r1.block);
  });

  it('reads scenarios and their steps', () => {
    const s = capability.requirements[0]!.scenarios[0]!;
    expect(s.name).toBe('成功');
    expect(s.steps.map((x) => x.keyword)).toEqual(['GIVEN', 'WHEN', 'THEN', 'AND']);
    expect(s.steps[1]!.text).toBe('the buyer taps "Buy"');
  });

  it('reports headings under Requirements that are not requirements', () => {
    const r = parseSpec('---\nprefix: X\n---\n## Requirements\n\n### Not a requirement\n', 'x', 'f.md');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SPEC_PARSE']);
    expect(r.diagnostics[0]!.target).toEqual({ file: 'f.md', line: 6 });
  });

  it('reports a broken frontmatter', () => {
    const r = parseSpec('---\nprefix: X\n## Requirements\n', 'x', 'f.md');
    expect(r.diagnostics[0]!.code).toBe('SPEC_PARSE');
  });
});
