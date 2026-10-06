import { describe, expect, it } from 'vitest';
import { parseDelta } from '../../../src/core/spec/parse-delta.js';
import { parseSpec } from '../../../src/core/spec/parse-spec.js';
import { validateCapability, validateDelta } from '../../../src/core/spec/validate-spec.js';
import { ORDER_SPEC } from '../../helpers/fixtures.js';

const base = parseSpec(ORDER_SPEC, 'order-lifecycle', 'spec.md').capability;
const codes = (ds: { code: string }[]): string[] => ds.map((d) => d.code).sort();
const delta = (text: string, cap = 'order-lifecycle') => parseDelta(text, cap, 'd.md').delta;

describe('validateCapability', () => {
  it('accepts a well-formed spec', () => {
    expect(validateCapability(base, 'spec.md')).toEqual([]);
  });

  it('reports id, prefix, scenario, duplicate and retired problems', () => {
    const text = `---
prefix: ORDER
retired: [REQ-ORDER-010]
---
## Requirements

### Requirement: REQ-order-1 bad id
x

#### Scenario: s
- **GIVEN** a

### Requirement: REQ-PAY-001 wrong prefix
x

#### Scenario: s
- **GIVEN** a

### Requirement: REQ-ORDER-002 no scenario
x

### Requirement: REQ-ORDER-002 duplicate
x

#### Scenario: s
- **GIVEN** a

### Requirement: REQ-ORDER-010 reused
x

#### Scenario: s
- **GIVEN** a
`;
    const cap = parseSpec(text, 'order-lifecycle', 'spec.md').capability;
    expect(codes(validateCapability(cap, 'spec.md'))).toEqual(
      ['REQ_ID_DUPLICATE', 'REQ_ID_FORMAT', 'REQ_ID_PREFIX', 'REQ_ID_RETIRED', 'REQ_NO_SCENARIO'].sort(),
    );
  });

  it('requires a prefix and a Requirements section', () => {
    const cap = parseSpec('# x\n', 'x', 'spec.md').capability;
    expect(codes(validateCapability(cap, 'spec.md'))).toEqual(['SPEC_PARSE', 'SPEC_PARSE']);
  });
});

describe('validateDelta', () => {
  const scenario = '\n#### Scenario: s\n- **GIVEN** a\n';

  it('accepts a valid delta', () => {
    const d = delta(`## ADDED Requirements\n\n### Requirement: REQ-ORDER-003 New\nx\n${scenario}`);
    expect(validateDelta(d, base, 'd.md', new Set())).toEqual([]);
  });

  it('reports an empty delta', () => {
    expect(codes(validateDelta(delta('## ADDED Requirements\n'), base, 'd.md', new Set()))).toEqual(['DELTA_EMPTY']);
  });

  it('rejects ADDED ids that exist, are retired or are added elsewhere', () => {
    const d = delta(
      `## ADDED Requirements\n\n### Requirement: REQ-ORDER-001 Dup\nx\n${scenario}\n### Requirement: REQ-ORDER-010 Retired\nx\n${scenario}\n### Requirement: REQ-ORDER-004 Other\nx\n${scenario}`,
    );
    expect(codes(validateDelta(d, base, 'd.md', new Set(['REQ-ORDER-004'])))).toEqual(
      ['DELTA_ID_EXISTS', 'REQ_ID_DUPLICATE', 'REQ_ID_RETIRED'].sort(),
    );
  });

  it('rejects MODIFIED/REMOVED targets that do not exist and REMOVED without reason', () => {
    const d = delta(
      `## MODIFIED Requirements\n\n### Requirement: REQ-ORDER-050 Ghost\nx\n${scenario}\n## REMOVED Requirements\n\n### Requirement: REQ-ORDER-051\n`,
    );
    expect(codes(validateDelta(d, base, 'd.md', new Set()))).toEqual(
      ['DELTA_TARGET_MISSING', 'DELTA_TARGET_MISSING', 'REMOVED_NO_REASON'].sort(),
    );
  });

  it('warns when MODIFIED drops a scenario and errors on conflicting sections', () => {
    const d = delta(
      `## MODIFIED Requirements\n\n### Requirement: REQ-ORDER-001 Changed\nx\n\n#### Scenario: other\n- **GIVEN** a\n\n## REMOVED Requirements\n\n### Requirement: REQ-ORDER-001\n**Reason:** r\n`,
    );
    const ds = validateDelta(d, base, 'd.md', new Set());
    expect(codes(ds)).toEqual(['DELTA_CONFLICT', 'SCENARIO_DROPPED']);
    expect(ds.find((x) => x.code === 'SCENARIO_DROPPED')!.severity).toBe('warning');
  });

  it('checks sections against the base', () => {
    const d = delta('## MODIFIED Sections\n\n### Section: Nope\nx\n\n## ADDED Sections\n\n### Section: Conventions\ny\n');
    expect(codes(validateDelta(d, base, 'd.md', new Set()))).toEqual(['DELTA_ID_EXISTS', 'DELTA_TARGET_MISSING']);
  });

  it('requires prefix and purpose for a new capability', () => {
    const d = delta(`## ADDED Requirements\n\n### Requirement: REQ-PAY-001 New\nx\n${scenario}`, 'payment');
    expect(codes(validateDelta(d, null, 'd.md', new Set()))).toEqual(['SPEC_PARSE', 'SPEC_PARSE']);
    const ok = delta(`---\nprefix: PAY\n---\n## Purpose\np\n\n## ADDED Requirements\n\n### Requirement: REQ-PAY-001 New\nx\n${scenario}`, 'payment');
    expect(validateDelta(ok, null, 'd.md', new Set())).toEqual([]);
  });
});
