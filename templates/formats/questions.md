# Questions

## Q-1: <the question, short>
- **Status:** open
- **Severity:** high
- **Refs:** REQ-ORDER-005, REQ-ORDER-019
- **Lens:** edge-cases

The spec currently allows this sequence:
1. <a step in domain language> (REQ-ORDER-004)
2. <the next step> (REQ-ORDER-019)
Result: <what goes wrong>. This conflicts with REQ-ORDER-005 "<quote>".

**Options**
- **A.** <behavior> — Spec change: <which requirement gains or changes what> — New: <states, fields, records, operations or flows it adds, or "nothing">
- **B.** <behavior> — Spec change: <…> — New: <…>
- **C.** Specify a different rule

**Recommendation:** A — <one-line reason>
