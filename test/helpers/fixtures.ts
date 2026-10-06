export const CONFIG_YAML = 'version: 1\nlanguage: en\n';

export const metaYaml = (id: string): string =>
  `schema: comb.change/v1\nid: ${id}\ncreated: 2026-10-06\nbase: {}\n`;

export const ORDER_SPEC = `---
prefix: ORDER
retired: [REQ-ORDER-010]
---
# order-lifecycle

## Purpose
注文のライフサイクル。

## Conventions
金額は整数円。

## Requirements

### Requirement: REQ-ORDER-001 注文の作成
The system MUST create an order (D-021).

#### Scenario: 成功
- **GIVEN** an on-sale listing
- **WHEN** the buyer taps "Buy"
- **THEN** an order is created
- **AND** the listing is reserved

\`\`\`md
### Requirement: REQ-ORDER-999 example inside a fence
\`\`\`

### Requirement: REQ-ORDER-002 Payment
Pay within 3 days.

#### Scenario: Paid in time
- **GIVEN** an unpaid order
- **WHEN** payment arrives
- **THEN** the order is paid
`;

export const DECISIONS_MD = `# Decisions

## D-021: Price is fixed when the order is created
- **Date:** 2026-10-01
- **Refs:** REQ-ORDER-001
- **Change:** seed-orders

The order keeps the listing price shown at "Buy".

**Why:** Later listing edits must not change an existing order.
`;

export const QUESTIONS_MD = `# Questions

## Q-1: 期限後の発送を受け付けるか
- **Status:** Answered
- **Severity:** high
- **Refs:** REQ-ORDER-001, REQ-ORDER-002
- **Lens:** edge-cases
- **Decision:** D-1

The spec currently allows this sequence:
1. The buyer pays (REQ-ORDER-002)

**Options**
- **A.** Reject — Spec change: REQ-ORDER-002 gains a deadline guard
- **B.** Accept — Spec change: none

**Recommendation:** A — a cancelled order must never ship.

**Answer:** A (2026-10-06)

## Q-2: Who may cancel after shipment?
- **Status:** open
- **Severity:** medium   # high | medium | low
- **Refs:** REQ-ORDER-002

Body.
`;

export const LOCAL_DECISIONS_MD = `# Decisions

## D-1: Shipping after the deadline is rejected
- **Date:** 2026-10-06
- **Refs:** REQ-ORDER-002
- **From:** Q-1
- **Supersedes:** D-021

After the deadline, "mark shipped" is rejected with SHIP_WINDOW_CLOSED.

**Why:** a cancelled order must never ship.
`;

export const MODIFY_PAYMENT_DELTA = `## MODIFIED Requirements

### Requirement: REQ-ORDER-002 Payment
Pay within 2 days.

#### Scenario: Paid in time
- **GIVEN** an unpaid order
- **WHEN** payment arrives
- **THEN** the order is paid
`;
