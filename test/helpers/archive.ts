import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChange } from '../../src/core/project/load.js';
import { deltaHash, requirementHashes } from '../../src/core/workflow/hash.js';
import { stampReview } from '../../src/core/workflow/review-stamp.js';
import { CONFIG_YAML, DECISIONS_MD, metaYaml, ORDER_SPEC } from './fixtures.js';
import { makeProject } from './project.js';

export const TIGHTEN_DELTA = `## MODIFIED Requirements

### Requirement: REQ-ORDER-002 Payment
Pay within 2 days (D-1).

#### Scenario: Paid in time
- **GIVEN** an unpaid order
- **WHEN** payment arrives
- **THEN** the order is paid
`;

export const TIGHTEN_QUESTIONS = `# Questions

## Q-1: How long may payment take?
- **Status:** answered
- **Severity:** high
- **Refs:** REQ-ORDER-002
- **Decision:** D-1

**Answer:** A (2026-10-06)
`;

export const TIGHTEN_DECISIONS = `# Decisions

## D-1: Payment window is two days
- **Date:** 2026-10-06
- **Refs:** REQ-ORDER-002
- **From:** Q-1

Orders must be paid within 2 days.

**Why:** listings stay reserved for less time.
`;

/** Writes a review.md whose stamp matches the change's current delta. */
export function stampReviewed(root: string, id: string): void {
  const change = loadChange(root, id)!;
  writeFileSync(join(root, 'comb', 'changes', id, 'review.md'), stampReview('# Review\n', deltaHash(change), requirementHashes(change))!);
}

/** A project whose change "tighten-payment" passes every archive gate. `files` overrides or adds files before the review is stamped. */
export function readyProject(files: Record<string, string> = {}): string {
  const root = makeProject({
    'comb/config.yaml': CONFIG_YAML,
    'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
    'comb/decisions.md': DECISIONS_MD,
    'comb/changes/tighten-payment/.comb.yaml': metaYaml('tighten-payment'),
    'comb/changes/tighten-payment/proposal.md':
      '# Change: Tighten the payment window\n\n## Why\nListings stay reserved too long.\n\n## What Changes\n- Payment must arrive within 2 days.\n\n## Impact\n- Requirements: REQ-ORDER-002\n',
    'comb/changes/tighten-payment/specs/order-lifecycle/spec.md': TIGHTEN_DELTA,
    'comb/changes/tighten-payment/questions.md': TIGHTEN_QUESTIONS,
    'comb/changes/tighten-payment/decisions.md': TIGHTEN_DECISIONS,
    'comb/changes/tighten-payment/tasks.md': '- [x] 1.1 Shorten the payment window (REQ-ORDER-002)\n',
    ...files,
  });
  stampReviewed(root, 'tighten-payment');
  return root;
}
