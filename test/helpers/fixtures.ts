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
