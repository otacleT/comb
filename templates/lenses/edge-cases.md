# Lens: edge cases

Goal: find the sequences the spec does not handle — where real systems break.

Walk through these families with concrete sequences:
- Time: the gap between a deadline and the job that acts on it; timers that are paused, resumed or replaced; actions exactly at the deadline instant; time zones and calendar boundaries.
- Races: two actors on the same thing at once (buyer vs seller, a user vs a scheduled job, two users); retries and double submissions.
- External events: duplicated, delayed, out-of-order or missing callbacks (payment provider, carrier, bank, card network); events that arrive after the state they refer to has moved on.
- Money: every flow in and out (charges, refunds, fees, payouts, chargebacks, points). Can more go out than came in? Can anything happen twice? What is irreversible?
- Permissions and identity: who may do each operation; what happens to work in flight when an account is restricted or deleted.
- Failure and recovery: a step that fails halfway; manual support or admin operations and how they interact with automation.

Report only sequences that the spec as written allows (cite the requirement for each step) or leaves undefined. Prefer a few deep findings over many shallow ones.
