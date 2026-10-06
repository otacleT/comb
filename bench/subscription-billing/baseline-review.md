# Baseline review of spec.md (SUB) — high-severity findings

Ordered most severe first. All dates and times are JST, per the spec's Conventions.

## SB-01: Charges for the same obligation are not serialized, and idempotency keys are per attempt, not per amount owed

**Sequence**
1. A monthly renewal of 980 yen on 2026-12-15 is declined. The subscription goes `past_due`, with retries set for 12-16, 12-18 and 12-22 (REQ-SUB-009).
2. The 12-16 retry is declined. The user receives the failure email with an update-card link (REQ-SUB-009).
3. At 2026-12-18 00:00:00 the day-3 retry starts on card A. Its idempotency key is (subscription, 2026-12-18, attempt 3) (Conventions › Periods, PSP).
4. At 00:00:05 the user saves card B from the email. REQ-SUB-009 requires an immediate 980 yen charge on card B with its own per-attempt key. Nothing in REQ-SUB-009 or Conventions makes this charge wait for, or cancel, the retry already in flight.
5. Card A has funds again, so both charges succeed. REQ-SUB-009's "MUST cancel the remaining retries" comes too late for a retry that is already in flight.

**Bad outcome:** 1,960 yen is charged for the single period 2026-12-15 until 2027-01-15, and two receipts go out. No rule covers the second success: the subscription is already `active`, and nothing refunds an extra charge. The same root cause is reachable in other ways:
- the user submits the card-save form twice;
- the user submits the REQ-SUB-007 switch twice (two 9,137 yen charges);
- the user switches with REQ-SUB-007 at 00:00:05 on a renewal date while that renewal is in flight. Remaining days are 0, so 9,800 yen is charged on top of the 980 yen renewal;
- two browser tabs start REQ-SUB-002 trials or REQ-SUB-004 subscriptions at once, giving two subscriptions, which REQ-SUB-001 forbids.

## SB-02: Account credit outlives the card charge that funded it; refunds and chargebacks never claw it back

**Sequence**
1. A trial starts on 2026-11-01 with yearly billing. The 9,800 yen conversion on 2026-11-15 succeeds, giving a yearly period from 2026-11-15 until 2027-11-15, 365 days (REQ-SUB-003).
2. On 2026-11-16 the user switches to monthly (REQ-SUB-008). With 364 days remaining, the credit is floor(9,800 × 364 ÷ 365) = 9,773 yen. The month from 2026-11-16 until 2026-12-16 is paid from it, leaving a balance of 8,793 yen.
3. On 2026-11-18, still inside the 7-day window for the 11-15 conversion charge, the user requests a refund (REQ-SUB-013). The full 9,800 yen is refunded and the account moves to Free. REQ-SUB-013 says nothing about the credit balance; only account deletion forfeits it (REQ-SUB-015).
4. On 2026-11-20 the user subscribes monthly again (REQ-SUB-004); a refund sets no billing hold. Under REQ-SUB-005 and REQ-SUB-008, every renewal draws on the 8,793 yen credit first.

**Bad outcome:** The user gets the whole 9,800 yen back and also keeps 8,793 yen of credit that came from that same charge. That is about 9 months of Pro paid for by money already refunded. A chargeback the user wins on the 11-15 charge (REQ-SUB-014) has the same effect: the credit stays, and becomes usable once support lifts the hold.

## SB-03: Charge outcomes are treated as instantly succeeded or failed; there is no "pending/unknown" result and no rule for a success that arrives after the subscription has moved on

**Sequence**
1. On 2027-01-05 a Free account that is not eligible for a trial subscribes yearly (REQ-SUB-004). The 9,800 yen charge on card A times out at the API, or is held pending behind a 3-D Secure challenge.
2. Only success and failure are defined, so the flow treats this as failure. The account stays Free and "the user is asked to try another card" (REQ-SUB-004).
3. The user enters card B. That is a new attempt with a new idempotency key (Conventions › PSP), so a second 9,800 yen charge succeeds and the subscription becomes `active`.
4. Minutes later, `payment.succeeded` arrives for the card A charge. Its signature is valid and the PSP API confirms it succeeded (REQ-SUB-016). "A charge result is applied once" (Conventions) requires applying it, but the account already has a subscription and REQ-SUB-001 allows only one.

**Bad outcome:** 19,600 yen is taken for one year of Pro. The system either creates a second subscription (a state REQ-SUB-001 forbids) or keeps 9,800 yen tied to no service, with no refund rule. The same gap appears in three more places:
- A user cancels a `past_due` subscription (REQ-SUB-011 makes it Free immediately) while the 12-18 retry is in flight. The retry succeeds and 980 yen is taken from a Free account.
- A `dispute.created` event (REQ-SUB-014 makes the account Free and puts it on billing hold) lands while a retry is in flight. The retry's success would take a held account out of `free`, which the States section forbids.
- An account is deleted (REQ-SUB-015) at 00:00:10 on a renewal date while that renewal is in flight. The charge succeeds after the account and the card are gone.

## SB-04: Refund eligibility ignores disputes, and dispute handling ignores prior refunds

**Sequence**
1. On 2026-12-15 a monthly renewal of 980 yen is charged (REQ-SUB-005).
2. On 2026-12-17 the PSP reports `dispute.created` on that charge. Under REQ-SUB-014 the subscription ends, the account goes Free and onto billing hold, and billing ops is notified.
3. On 2026-12-18 the user opens the billing page. The charge is within its 7-day window, and REQ-SUB-013 excludes neither disputed charges nor accounts on hold. The refund is offered, the user accepts, and the PSP refunds 980 yen.
4. In 2027-02 the dispute closes against Notely (REQ-SUB-014).

**Bad outcome:** The cardholder gets 1,960 yen back for one 980 yen charge, and Notely also pays the dispute fee. The reverse order is more common and is not covered either. The user refunds on 12-16, doesn't yet see it on the card statement, and files a chargeback on 12-20. REQ-SUB-014 puts the account on billing hold and notifies ops, but nothing marks the charge as already refunded or tells ops to contest with the refund as evidence. If the deadline is missed, the money goes out twice.

## SB-05: A refund is per charge, but it ends the whole subscription, even when the current period was paid by a different charge

**Sequence**
1. On 2026-12-15 a monthly renewal of 980 yen is charged; the period runs from 2026-12-15 until 2027-01-15, 31 days (REQ-SUB-005).
2. On 2026-12-17 the user switches to yearly (REQ-SUB-007). With 29 days remaining, the credit is floor(980 × 29 ÷ 31) = 916 yen. The card is charged 8,884 yen, and a yearly period runs from 2026-12-17 until 2027-12-17.
3. On 2026-12-20 both charges are inside their refund windows. The user asks to refund the 980 yen charge from 12-15 (REQ-SUB-013).
4. REQ-SUB-013 refunds 980 yen and then must "end the subscription immediately". That subscription is now the yearly one paid with 8,884 yen.

**Bad outcome:** Pro ends, but Notely keeps 8,884 yen for a year it will never deliver. The money is gone for good unless the user notices and refunds the second charge by 2026-12-24 23:59:59; after that, REQ-SUB-013 forbids offering the refund. The mirror case also loses money: refunding only the 8,884 yen charge ends the subscription and wipes out the 916 yen unused-month credit, so the user paid 980 yen for 2 days. In both cases the subscription ends when the refund is requested, not on `refund.succeeded`. No path exists for a refund that fails or stays pending, so the account can be on Free with nothing refunded.

## SB-06: The account-credit rules conflict over three questions: whether credit pays first charges and switch charges, who covers a shortfall, and what happens to credit when the subscription ends

**Sequence**
1. On 2027-01-10 a yearly charge of 9,800 yen is made; the period runs until 2028-01-10.
2. On 2027-01-20 (the refund window closed on 01-17) the user switches to monthly (REQ-SUB-008). With 355 days remaining, the credit is floor(9,800 × 355 ÷ 365) = 9,531 yen. The month from 01-20 until 02-20 is paid from it, leaving 8,551 yen. REQ-SUB-008 says the credit "MUST NOT be refunded to the card".
3. On 2027-01-25 the user cancels (REQ-SUB-011). The subscription becomes `canceling`, and the account becomes Free on 2027-02-20 holding 8,551 yen of credit.
4. On 2027-03-01 the user subscribes monthly again. REQ-SUB-004 says the first charge MUST be made "immediately at the full price"; REQ-SUB-008 says "every later charge SHALL use the credit balance first". Both cannot hold.

**Bad outcome:** One reading charges 980 yen to the card while the user holds 8,551 yen of credit. If the user never returns, or deletes the account (REQ-SUB-015 forfeits credit), Notely keeps 8,551 yen of prepaid money for service it never delivers and can never refund. The same conflict blocks implementation elsewhere:
- **REQ-SUB-007:** it charges the card "9,800 yen minus that credit" and ignores any credit balance.
- **REQ-SUB-009 and REQ-SUB-010:** REQ-SUB-009 retries "the same amount", but neither requirement says whether credit drawn for a renewal that never got paid is returned when REQ-SUB-010 downgrades the account.
- **Shortfall at switch time:** REQ-SUB-008 says the new month's 980 yen "SHALL be paid from the credit balance" even when the credit is too small. Switching on 2028-01-09, the last day of a yearly period, yields floor(9,800 × 1 ÷ 365) = 26 yen. Nothing says who pays the 954 yen gap or what happens if a card charge for it fails. Then the Rounding convention, which uses list price and never the amount actually paid, lets the user switch straight back to yearly with a 980 yen credit. The result is about 954 yen off every year.

## SB-07: Webhooks are acknowledged before they are processed and applied "at most once", so a failed async step loses the event permanently

**Sequence**
1. On 2027-01-20 the PSP sends `dispute.created` (evt_2001) for the 980 yen charge of 2026-12-15. The subscription is `active` monthly, with a period from 2027-01-15 until 2027-02-15.
2. The endpoint verifies the signature, records evt_2001, and returns 200 within 10 s. The work is left to an async job (REQ-SUB-016).
3. The async job's required PSP API read times out, or the worker crashes. evt_2001 "MUST be applied at most once" and the PSP has already received its 2xx, so nothing ever retries it.
4. REQ-SUB-014 never runs: no move to Free, no billing hold, no ops notice with the evidence deadline. On 2027-02-15 the renewal charges the disputing card another 980 yen (REQ-SUB-005).

**Bad outcome:** The card that is disputing gets charged again, which invites a second dispute and a second fee, and the first dispute may be lost by default. The 03:00 reconciliation only raises an alert and defines no correction. If the lost event is a `payment.succeeded` and the charge's API response also timed out, the day-1 retry at 00:00 runs three hours before the 03:00 reconciliation that would have flagged the original charge. It charges the same period a second time before anyone is alerted.

## SB-08: The refund scope contradicts itself; under the broad reading, users can refund and resubscribe in an endless loop

**Sequence**
1. On 2027-01-05 an account not eligible for a trial subscribes monthly. 980 yen is charged and the period runs until 2027-02-05 (REQ-SUB-004).
2. At 2027-01-12 22:00 the user asks for a refund. REQ-SUB-013 first grants "a full refund of a charge", then lists only "conversion, renewal and switch charges", which leaves out this REQ-SUB-004 first charge.
3. Under the broad reading, the 980 yen is refunded and the account goes Free. No billing hold is set and there is no limit per account.
4. At 2027-01-12 22:05 the user subscribes again (REQ-SUB-004). That is a new 980 yen charge with a new 7-day refund window. The cycle repeats every 7 days.

**Bad outcome:** Pro costs nothing, forever, while Notely pays PSP fees on every charge and every refund. Under the narrow reading, a returning user's 9,800 yen yearly purchase can't be refunded, while a trial user's identical 9,800 yen conversion charge can. The billing page's refund offer can't be built until one reading is chosen.

## SB-09: Billing hold is a single flag, but one rule clears it when any dispute is won and another keeps it after a lost one

**Sequence**
1. Monthly charges of 980 yen are made on 2026-12-15 and 2027-01-15.
2. On 2027-01-20 dispute A is opened on the 12-15 charge. The account goes Free and onto billing hold (REQ-SUB-014).
3. On 2027-01-25 dispute B is opened on the 01-15 charge; the hold is already set.
4. On 2027-03-01 dispute B closes against Notely. The rule is that "the hold stays until support lifts it manually" (REQ-SUB-014).
5. On 2027-03-05 dispute A closes in Notely's favor. The rule is that "the billing hold SHALL be lifted" (REQ-SUB-014).

**Bad outcome:** An account with a lost chargeback, never reviewed by support, comes off billing hold. It can then subscribe and be charged again (REQ-SUB-004) and file another chargeback. The same happens if A is won while B is still open: the account can subscribe while a dispute is pending.

## SB-10: Trial use and billing hold are tied to the account, which deletion erases

**Sequence**
1. On 2026-11-01 account A starts a trial with card X, fingerprint F (REQ-SUB-002). The user cancels before conversion, and the trial counts as used (REQ-SUB-011).
2. On 2026-11-20 the user deletes account A (REQ-SUB-015). The account is deleted and card X is removed from the PSP. Only "charges, refunds, receipts and disputes" are kept, and the trial produced none of these, so nothing ties F to a used trial.
3. On 2026-11-21 account B registers card X. REQ-SUB-002 checks whether the card was "used for a trial on any Notely account", finds nothing, and grants a second 14-day trial. This repeats with no limit.

**Bad outcome:** Unlimited free Pro on one card. Billing hold can be escaped the same way. Billing hold is an account flag (States), so an account whose dispute was lost and is still held (REQ-SUB-014) can delete itself, re-register, subscribe with the same card under REQ-SUB-004, and charge back again. As written, the spec can't be implemented: REQ-SUB-002 needs card fingerprints to outlive the account, and REQ-SUB-015 never says to keep them.
