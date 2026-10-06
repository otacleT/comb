# Lens: consistency

Goal: find statements that cannot all be true at once, or that disagree with what is already decided.

For every requirement the delta adds or modifies, and the base spec around it, check:
- requirement vs requirement: two MUST / MUST NOT statements that conflict for some state or event;
- requirement vs its scenarios: a THEN that contradicts the requirement text, or a scenario that cannot happen under the rules;
- tables and conventions vs requirements: transition tables, timers, money rules or status lists that say something different from the requirement text;
- requirements vs decisions (comb/decisions.md and this change's decisions.md): a requirement that silently reverses a decision;
- terms: one word used for two things, or two words for one thing.

For each conflict, write the shortest concrete sequence where both statements apply, name both sources (requirement ids, sections, decision ids), and ask which one is right.
