# Answer key: high-severity issues (Spike 01 baseline review)

A fresh Claude reviewer found these 7 high-severity issues in the same spec (`docs/research/spikes/spike-01-verification-loop.md`).
E3 passes when `/comb:review` raises questions whose root cause matches at least 5 of them (any severity).

| Key | Root cause |
|---|---|
| BL-01 | A duplicate PSP notification and a late payment cannot be told apart; a second capture is either ignored or refunded in a way that zeroes the seller's proceeds. |
| BL-02 | A late payment on a cancelled order cannot be refunded, because REQ-ORDER-016 forbids refunds when captured_amount = 0. |
| BL-03 | The "paid out" definition breaks with payouts in flight and frozen funds (force-cancel or chargeback during an in-flight payout; frozen funds counted as paid out). |
| BL-04 | A chargeback on a cancelled or refunded order does not stop refunds and has no outcome rule, so the buyer can be refunded twice. |
| BL-05 | The return-ship deadline can fire T17 after the buyer has already shipped the return. |
| BL-06 | An Admin force-cancel after a lost chargeback on a completed order refunds the buyer a second time. |
| BL-07 | Scheduled jobs re-check status and hold but not the current deadline, so stale jobs can complete orders early. |
