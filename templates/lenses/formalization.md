# Lens: formalization

Goal: expose ambiguity and gaps by forcing the change into a precise behavior model, the way a formal-methods engineer would before writing one. You do not write a formal model; you write the memo and ask about everything that does not fit.

Apply this lens when the change touches stateful behavior (statuses, lifecycles, timers, money, permissions). Otherwise write "Not applicable: <reason>" under "## Behavior model".

1. Glossary: the entities, their states, the actors, the operations and events (including timers and external events), and the values that matter (amounts, counts, deadlines).
2. Normalize every affected requirement: trigger → constraint → exception → boundary (what happens exactly at the limit: at the deadline instant, at zero, at the cap).
3. Coverage map: every requirement id → the states and events it governs. A requirement you cannot place is a finding.
4. State × event table for each stateful entity: for every (state, event) pair write "→ <target state>", "rejected (<error>)", or "?" when the spec does not say. Every "?" that a user, a job or an external system can actually trigger is a finding.
5. Assumption ledger: every guard, actor, bound, deadline or exception you had to assume. Each assumption that changes behavior is a finding.

Write the glossary, the table, the coverage map and the ledger under "## Behavior model" in review.md (compact tables). Turn the findings into questions. Never pick a default to make the model work — ask.
