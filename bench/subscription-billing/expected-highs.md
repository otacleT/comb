# Answer key: high-severity issues (baseline review)

A fresh Claude reviewer, without Comb, found these issues in the same spec (`baseline-review.md` has the sequences).
The subject passes when `/comb:review` raises questions whose root cause matches at least the share in `bench.json` (70%).

| Key | Root cause |
|---|---|
| SB-01 | Charges for the same obligation are not serialized, and idempotency keys are per attempt, not per amount owed |
| SB-02 | Account credit outlives the card charge that funded it; refunds and chargebacks never claw it back |
| SB-03 | Charge outcomes are treated as instantly succeeded or failed; there is no "pending/unknown" result and no rule for a success that arrives after the subscription has moved on |
| SB-04 | Refund eligibility ignores disputes, and dispute handling ignores prior refunds |
| SB-05 | A refund is per charge, but it ends the whole subscription, even when the current period was paid by a different charge |
| SB-06 | The account-credit rules conflict over three questions: whether credit pays first charges and switch charges, who covers a shortfall, and what happens to credit when the subscription ends |
| SB-07 | Webhooks are acknowledged before they are processed and applied "at most once", so a failed async step loses the event permanently |
| SB-08 | The refund scope contradicts itself; under the broad reading, users can refund and resubscribe in an endless loop |
| SB-09 | Billing hold is a single flag, but one rule clears it when any dispute is won and another keeps it after a lost one |
| SB-10 | Trial use and billing hold are tied to the account, which deletion erases |
