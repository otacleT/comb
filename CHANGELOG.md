# Changelog

## 0.1.0 — 2026-10-06

First release.

- `comb init` and `comb update` install the Claude Code skills and `/comb:*` commands: explore, propose, review, clarify, apply, archive.
- Specs are Markdown with stable requirement ids (`REQ-<PREFIX>-<NNN>`). Changes are deltas by id: ADDED / MODIFIED / REMOVED requirements and ADDED / MODIFIED sections.
- `comb validate`, `comb status` (gates and the next step) and `comb instructions` (templates, lenses, context and the next free ids).
- Review through four lenses (consistency, formalization, edge cases, change impact) produces answerable questions with options and a recommendation. Clarify records decisions and updates the delta, and the review goes stale until it is redone.
- `comb archive` merges a change into the specs deterministically, gives decisions permanent ids (`D-001`…) and detects specs that moved under a change (base drift).
- `comb list` and `comb show` look up requirements, decisions and changes by id.
