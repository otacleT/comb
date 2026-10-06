Write the spec delta(s) for change "{{change}}". Prose in {{language}}; structure keywords stay in English.

1. Read every file in context.readFiles, including proposal.md.
2. Write one delta per affected capability at comb/changes/{{change}}/specs/<capability>/spec.md (outputPath shows the pattern).
3. Address requirements by id:
   - ADDED: take ids from ids.nextRequirement for that capability and count up from there. For a NEW capability, choose a prefix (default: the first word of the capability name in upper case), put "prefix: <PREFIX>" in the frontmatter, add "## Purpose", and start at 001.
   - MODIFIED: copy the WHOLE current requirement block from comb/specs/, then edit it. Keep every scenario that still applies; a dropped scenario is reported.
   - REMOVED: "### Requirement: <id>" followed by "**Reason:**" (and "**Migration:**" when users or data are affected).
4. Every ADDED or MODIFIED requirement needs at least one "#### Scenario:" written as "- **GIVEN** / **WHEN** / **THEN** / **AND**" bullets with concrete values.
5. Change non-requirement sections (tables, conventions) with "## MODIFIED Sections" / "## ADDED Sections" and "### Section: <heading>", always with the whole section.
6. Never edit comb/specs/ or comb/decisions.md directly.
7. Run `comb validate --change {{change}} --json` and fix every error before you finish.
