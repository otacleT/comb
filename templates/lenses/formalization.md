# Lens: formalization

Goal: expose ambiguity and gaps by forcing the change into a precise behavior model, the way a formal-methods engineer would before writing one. You do not write a formal model; you write the memo and ask about everything that does not fit.

Apply this lens when the change touches stateful behavior (statuses, lifecycles, timers, money, permissions). Otherwise write "Not applicable: <reason>" under "## Behavior model".

1. Glossary: the entities, their states, the actors, the operations and events (including timers and external events), and the values that matter (amounts, counts, deadlines).
2. Normalize every affected requirement: trigger → constraint → exception → boundary (what happens exactly at the limit: at the deadline instant, at zero, at the cap).
3. Coverage map: every requirement id → the states and events it governs. A requirement you cannot place is a finding.
4. State × event table for each stateful entity: for every (state, event) pair write "→ <target state>", "rejected (<error>)", or "?" when the spec does not say. Every "?" that a user, a job or an external system can actually trigger is a finding. Write each guard as the spec states it where the transition or job is defined; a guard that appears only in surrounding prose is not there — write the cell without it and make the gap a finding.
5. Timer table, when the change has deadlines, timers or scheduled jobs. One row per timer:
   - when it is set and when it fires;
   - what the job checks when it fires — quote the spec, and do not add checks it does not state;
   - every event that can happen between setting and firing and change what the job relies on: the entity's state, the condition the job acts on, or the deadline itself (paused, extended, replaced, recalculated);
   - whether the quoted check catches each of those events. An event it misses lets the job act on stale facts: a finding.
6. Money table, when money moves. One row per operation that sends money out or changes who is owed what (refunds, payouts, reversals, compensation, credit issued instead of money):
   - the amount — quote the spec's formula or rule;
   - every earlier movement of money on the same entity that can precede it, through any path: another refund, a reversal or dispute by an external party, a payout already made, a manual or admin adjustment;
   - whether the formula subtracts or blocks each of them. Check the totals: nobody receives more than was paid in, and nothing is paid twice. A path the formula ignores is a finding.
7. Assumption ledger: every guard, actor, bound, deadline or exception you had to assume. Each assumption that changes behavior is a finding.

Write the glossary, the tables, the coverage map and the ledger under "## Behavior model" in review.md (compact tables). Turn the findings into questions. Never pick a default to make the model work — ask.
