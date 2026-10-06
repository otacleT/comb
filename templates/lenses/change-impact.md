# Lens: change impact

Goal: make sure the change does not break what is already specified or decided.

Read the base specs in comb/specs/ in full, not only the requirements the delta touches.
- For each MODIFIED or REMOVED requirement: which other requirements, scenarios, tables and decisions relied on the old text? Are they still true?
- For each ADDED requirement: does it open a new path into states or money flows that existing rules did not anticipate?
- Look for unchanged text that now contradicts the change (tables, conventions, other capabilities), and for obligations the delta should have updated but did not.
- For every decision in comb/decisions.md whose Refs touch the same requirements: does the change silently reverse it? Reversing is allowed only through a new decision that supersedes it.

When the change only adds a new capability, check it against the other capabilities and the project-wide decisions instead.
