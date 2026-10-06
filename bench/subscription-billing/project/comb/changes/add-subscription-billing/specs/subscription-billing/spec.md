---
prefix: SUB
---
## Purpose

Defines how a Notely user moves between the Free and Pro plans and pays for Pro: the 14-day trial, renewals, monthly/yearly switches, failed payments, cancellation, refunds, chargebacks and account deletion. It also fixes how Notely uses the PSP and its webhooks so that subscription state always matches what was actually charged.

## ADDED Requirements

### Requirement: REQ-SUB-001 Plans, prices and receipts
Notely SHALL offer exactly two plans: Free at 0 yen, and Pro, billed either monthly at 980 yen or yearly at 9,800 yen. All prices include 10% consumption tax and MUST be displayed as tax-inclusive amounts wherever a price is shown. An account SHALL have at most one subscription at a time. For every successful charge the system SHALL email a receipt that shows the amount, the consumption tax contained in it, the period it pays for, and Notely's qualified invoice registration number.

#### Scenario: Prices on the plan page
- **GIVEN** a signed-in user on the Free plan
- **WHEN** the user opens the plan page
- **THEN** Pro is shown as 980 yen per month (tax included) and 9,800 yen per year (tax included)
- **AND** Free is shown as 0 yen

#### Scenario: Receipt for a monthly renewal
- **GIVEN** a monthly Pro subscription that renews on 2026-12-15
- **WHEN** the 980 yen renewal charge succeeds
- **THEN** the user is emailed a receipt for 980 yen that includes 89 yen of consumption tax
- **AND** the receipt shows the period as 2026-12-15 to 2027-01-14

### Requirement: REQ-SUB-002 Starting the Pro free trial
A Free account SHALL be able to start a 14-day Pro trial if it has never had a trial or a paid Pro subscription and the card it registers has not been used for a trial on any Notely account, matched by the PSP card fingerprint. Starting a trial MUST require a card that passes PSP verification, including EMV 3-D Secure when the issuer requires it; nothing is charged when the trial starts. The user SHALL choose monthly or yearly billing when starting the trial. The trial ends at 00:00 JST on the 14th day after the start date, and that date is the conversion date. Before the user confirms, the screen MUST show the price, the billing interval, the conversion date and how to cancel. Pro features SHALL be available as soon as the trial starts. If card verification fails, the account MUST stay on Free and the trial is not used up.

#### Scenario: Trial started with a verified card
- **GIVEN** a Free account that has never had a trial or a paid subscription
- **WHEN** at 14:30 JST on 2026-11-01 the user chooses monthly billing and registers a card that passes verification
- **THEN** the subscription is `trialing` and Pro features are available immediately
- **AND** nothing is charged to the card
- **AND** the confirmation shows that 980 yen will be charged on 2026-11-15 unless the trial is canceled by 2026-11-14

#### Scenario: Card fails verification
- **GIVEN** a Free account that is eligible for a trial
- **WHEN** on 2026-11-01 the card is declined during verification
- **THEN** the account stays on Free with no subscription
- **AND** the account is still eligible for a trial

#### Scenario: Account that already had a trial
- **GIVEN** an account whose trial ended on 2026-03-10 without converting
- **WHEN** the user opens the plan page on 2026-11-01
- **THEN** no trial is offered
- **AND** the user is offered Pro with an immediate charge of 980 yen for monthly or 9,800 yen for yearly billing

### Requirement: REQ-SUB-003 Trial conversion
On the conversion date the system SHALL charge the saved card the price of the billing interval selected for the trial. When the charge succeeds, the subscription SHALL become `active` and its first paid period SHALL start on the conversion date, which becomes the billing anchor. When the charge fails, the subscription SHALL become `past_due` and follow REQ-SUB-009. During the trial the user MAY change the selected interval at any time; no charge or proration applies, and the interval selected at 00:00 JST on the conversion date is the one charged.

#### Scenario: Monthly trial converts
- **GIVEN** a `trialing` subscription started on 2026-11-01 with monthly billing
- **WHEN** the 980 yen charge on 2026-11-15 succeeds
- **THEN** the subscription is `active` with a paid period from 2026-11-15 until 2026-12-15
- **AND** the next renewal is scheduled for 2026-12-15

#### Scenario: Interval changed to yearly during the trial
- **GIVEN** a `trialing` subscription started on 2026-11-01 with monthly billing
- **WHEN** the user switches to yearly billing on 2026-11-10
- **THEN** nothing is charged on 2026-11-10
- **AND** on 2026-11-15 the card is charged 9,800 yen and the paid period runs from 2026-11-15 until 2027-11-15

#### Scenario: Conversion charge fails
- **GIVEN** a `trialing` subscription with monthly billing and conversion date 2026-11-15
- **WHEN** the 980 yen charge on 2026-11-15 is declined
- **THEN** the subscription is `past_due` and Pro features remain available
- **AND** retries are scheduled for 2026-11-16, 2026-11-18 and 2026-11-22

### Requirement: REQ-SUB-004 Subscribing to Pro without a trial
An account that is not eligible for a trial SHALL be able to subscribe to Pro directly. The first charge MUST be made immediately at the full price of the chosen interval, and the subscription SHALL become `active` only after that charge succeeds; the purchase date becomes the billing anchor. If the first charge fails, the account MUST stay on Free, no `past_due` subscription is created, and the user is asked to try another card.

#### Scenario: Returning user subscribes monthly
- **GIVEN** a Free account whose previous Pro subscription ended on 2026-09-30
- **WHEN** the user subscribes to monthly Pro on 2027-01-05
- **THEN** 980 yen is charged immediately
- **AND** the subscription is `active` with a period from 2027-01-05 until 2027-02-05

#### Scenario: First charge declined
- **GIVEN** a Free account that is not eligible for a trial
- **WHEN** the user subscribes to yearly Pro on 2027-01-05 and the 9,800 yen charge is declined
- **THEN** the account stays on Free with no subscription
- **AND** no retry is scheduled

### Requirement: REQ-SUB-005 Billing periods and renewals
A monthly period SHALL last one calendar month and a yearly period one calendar year, counted from the billing anchor. Each renewal date SHALL fall on the anchor's day of the month; when that day does not exist in a month, the renewal SHALL fall on the last day of that month, and the anchor day itself does not change (an anchor of 29 February renews on 28 February in non-leap years). On each renewal date the system SHALL apply any account credit (REQ-SUB-008), charge the rest of the interval's price to the card, and on success start the next period. A subscription in `canceling` MUST NOT be renewed.

#### Scenario: Monthly renewal
- **GIVEN** an `active` monthly subscription whose period runs from 2026-11-15 until 2026-12-15
- **WHEN** the 980 yen renewal charge on 2026-12-15 succeeds
- **THEN** the new period runs from 2026-12-15 until 2027-01-15

#### Scenario: Anchor at the end of the month
- **GIVEN** a monthly subscription with its anchor on 2027-01-31
- **WHEN** the next three renewals succeed
- **THEN** 980 yen is charged on each of 2027-02-28, 2027-03-31 and 2027-04-30

#### Scenario: Yearly renewal
- **GIVEN** an `active` yearly subscription whose period runs from 2026-11-15 until 2027-11-15
- **WHEN** the renewal charge on 2027-11-15 succeeds
- **THEN** 9,800 yen is charged
- **AND** the new period runs from 2027-11-15 until 2028-11-15

### Requirement: REQ-SUB-006 Reminders before charges
The system SHALL email the user 3 days before a trial's conversion date and 7 days before each yearly renewal. Each reminder MUST state the charge date, the amount, the last 4 digits of the card and a link to cancel. Monthly renewals SHALL NOT get a reminder; the receipt of REQ-SUB-001 is sent instead. A subscription in `canceling` MUST NOT receive reminders.

#### Scenario: Trial ending reminder
- **GIVEN** a `trialing` subscription with monthly billing and conversion date 2026-11-15
- **WHEN** it is 2026-11-12
- **THEN** the user is emailed that 980 yen will be charged on 2026-11-15 unless the trial is canceled by 2026-11-14

#### Scenario: Yearly renewal reminder
- **GIVEN** an `active` yearly subscription that renews on 2027-11-15
- **WHEN** it is 2027-11-08
- **THEN** the user is emailed that 9,800 yen will be charged on 2027-11-15

### Requirement: REQ-SUB-007 Switching from monthly to yearly
A user with an `active` monthly subscription SHALL be able to switch to yearly billing at any time, effective immediately. The unused part of the current monthly period SHALL be credited as floor(980 × remaining days ÷ days in the current period), where the remaining days run from the switch date up to the end of the period. The card MUST be charged 9,800 yen minus that credit, and on success a yearly period SHALL start on the switch date, which becomes the new billing anchor. If the charge fails, the subscription MUST stay monthly with its period unchanged. Switching is not available in `past_due` or `canceling`.

#### Scenario: Switch in the middle of a monthly period
- **GIVEN** an `active` monthly subscription whose period runs from 2026-12-15 until 2027-01-15 (31 days)
- **WHEN** the user switches to yearly billing on 2026-12-25
- **THEN** the 21 unused days are credited as 663 yen and the card is charged 9,137 yen
- **AND** the subscription is yearly with a period from 2026-12-25 until 2027-12-25

#### Scenario: Switch charge declined
- **GIVEN** an `active` monthly subscription whose period runs from 2026-12-15 until 2027-01-15
- **WHEN** the user switches to yearly billing on 2026-12-25 and the 9,137 yen charge is declined
- **THEN** the subscription stays monthly with its period ending on 2027-01-15
- **AND** the user is told that the switch did not happen

### Requirement: REQ-SUB-008 Switching from yearly to monthly
A user with an `active` yearly subscription SHALL be able to switch to monthly billing at any time, effective immediately. The unused part of the yearly period SHALL be credited as floor(9,800 × remaining days ÷ days in the current period) and added to the account's credit balance; it MUST NOT be refunded to the card. A monthly period SHALL start on the switch date, which becomes the new billing anchor, and its 980 yen SHALL be paid from the credit balance. Every later charge SHALL use the credit balance first and charge only the rest to the card. The billing page MUST show the current credit balance. Switching is not available in `past_due` or `canceling`.

#### Scenario: Switch in the middle of a yearly period
- **GIVEN** an `active` yearly subscription whose period runs from 2027-01-10 until 2028-01-10 (365 days)
- **WHEN** the user switches to monthly billing on 2027-07-10
- **THEN** the 184 unused days are credited as 4,940 yen
- **AND** the first monthly period, from 2027-07-10 until 2027-08-10, is paid from the credit, leaving 3,960 yen
- **AND** nothing is charged to the card on 2027-07-10

#### Scenario: Credit runs out
- **GIVEN** a monthly subscription with a credit balance of 40 yen and a renewal on 2027-12-10
- **WHEN** the renewal runs on 2027-12-10
- **THEN** 40 yen is taken from the credit balance and 940 yen is charged to the card
- **AND** the receipt shows 980 yen, of which 40 yen was paid by credit

### Requirement: REQ-SUB-009 Failed payments and retries
When a conversion or renewal charge fails, the subscription SHALL become `past_due` and Pro features SHALL remain available. The system SHALL retry the same amount on day 1, day 3 and day 7 after the scheduled charge date, and SHALL email the user after each failed attempt with a link to update the card. When the user saves a new card while `past_due`, the system SHALL charge the new card immediately; if that charge fails, the remaining retries keep their dates. A successful attempt SHALL return the subscription to `active` with its period and anchor unchanged and MUST cancel the remaining retries.

#### Scenario: Second retry succeeds
- **GIVEN** a monthly subscription whose 980 yen renewal on 2026-12-15 was declined
- **WHEN** the retry on 2026-12-16 is declined and the retry on 2026-12-18 succeeds
- **THEN** the subscription is `active` with a period from 2026-12-15 until 2027-01-15
- **AND** the retry planned for 2026-12-22 is canceled

#### Scenario: User updates the card
- **GIVEN** a `past_due` monthly subscription whose renewal on 2026-12-15 and retry on 2026-12-16 were declined
- **WHEN** the user saves a new card on 2026-12-17 and the immediate 980 yen charge succeeds
- **THEN** the subscription is `active` and the next renewal is on 2027-01-15
- **AND** no further retries are made

### Requirement: REQ-SUB-010 Downgrade to Free after the last retry
When the day-7 retry fails, the subscription SHALL end and the account SHALL move to Free at once. The unpaid amount MUST NOT be collected later, and the user SHALL be emailed that Pro has ended. The downgrade MUST NOT delete any notes; Pro-only features become unavailable. The user MAY subscribe again later under REQ-SUB-004.

#### Scenario: All retries fail
- **GIVEN** a monthly subscription whose renewal on 2026-12-15 and retries on 2026-12-16 and 2026-12-18 were declined
- **WHEN** the retry on 2026-12-22 is declined
- **THEN** the account is on Free from 2026-12-22 and no further charge is attempted
- **AND** all of the user's notes are kept

#### Scenario: Subscribing again after a downgrade
- **GIVEN** an account moved to Free on 2026-12-22 after its 980 yen renewal of 2026-12-15 went unpaid
- **WHEN** the user subscribes to monthly Pro on 2027-01-05
- **THEN** 980 yen is charged for the period from 2027-01-05 until 2027-02-05
- **AND** the unpaid 980 yen from 2026-12-15 is not charged

### Requirement: REQ-SUB-011 Cancellation
A user SHALL be able to cancel from the billing page at any time. Canceling a `trialing` or `active` subscription SHALL move it to `canceling`: Pro features stay available until the end of the trial or paid period, no further charge is made, and the account moves to Free at 00:00 JST on the end date. Canceling MUST NOT refund any part of the current period; refunds follow REQ-SUB-013. Canceling a `past_due` subscription SHALL end it immediately, move the account to Free and cancel all retries. The system SHALL email a confirmation that states the date Pro ends.

#### Scenario: Cancel during a monthly period
- **GIVEN** an `active` monthly subscription whose period runs from 2026-12-15 until 2027-01-15
- **WHEN** the user cancels on 2026-12-20
- **THEN** the subscription is `canceling` and Pro features stay available through 2027-01-14
- **AND** on 2027-01-15 the account is on Free and nothing is charged

#### Scenario: Cancel during the trial
- **GIVEN** a `trialing` subscription started on 2026-11-01 with conversion date 2026-11-15
- **WHEN** the user cancels on 2026-11-05
- **THEN** Pro features stay available through 2026-11-14
- **AND** on 2026-11-15 the account is on Free, nothing is charged and the trial counts as used

### Requirement: REQ-SUB-012 Undoing a cancellation
While a subscription is `canceling`, the user SHALL be able to undo the cancellation until 23:59:59 JST on the last day of the trial or paid period. Undoing SHALL return the subscription to `trialing` if the trial has not ended and to `active` otherwise, with its schedule unchanged; nothing is charged at the moment of undoing. Once the account has moved to Free, the cancellation MUST NOT be undoable and the user subscribes again under REQ-SUB-004.

#### Scenario: Undo before the period ends
- **GIVEN** a `canceling` monthly subscription whose period ends on 2027-01-15
- **WHEN** the user undoes the cancellation on 2027-01-10
- **THEN** the subscription is `active` and nothing is charged on 2027-01-10
- **AND** 980 yen is charged on 2027-01-15 as a normal renewal

#### Scenario: Too late to undo
- **GIVEN** a canceled subscription whose account moved to Free on 2027-01-15
- **WHEN** the user opens the billing page on 2027-01-16
- **THEN** no undo option is shown
- **AND** the user is offered a new subscription with an immediate charge of 980 yen

### Requirement: REQ-SUB-013 Refunds within 7 days of a charge
A user SHALL be able to request a full refund of a charge from the billing page until 23:59:59 JST on the 7th day after the charge date. This applies to conversion, renewal and switch charges. The system MUST refund the full amount charged to the card through the PSP, end the subscription immediately and move the account to Free. Partial refunds are not offered. After the 7th day the billing page MUST NOT offer a refund and SHALL point to support instead. The user SHALL be emailed when the PSP confirms the refund.

#### Scenario: Refund on the last allowed day
- **GIVEN** a monthly subscription charged 980 yen on 2026-12-15
- **WHEN** the user requests a refund at 22:00 JST on 2026-12-22
- **THEN** 980 yen is refunded to the card
- **AND** the account is on Free from 2026-12-22 and no renewal is scheduled

#### Scenario: Refund window has passed
- **GIVEN** a monthly subscription charged 980 yen on 2026-12-15
- **WHEN** the user opens the billing page on 2026-12-23
- **THEN** no refund is offered
- **AND** the subscription stays `active` with its period ending on 2027-01-15

#### Scenario: Refund of a yearly conversion
- **GIVEN** a trial that converted to yearly billing with a 9,800 yen charge on 2026-11-15
- **WHEN** the user requests a refund on 2026-11-18
- **THEN** 9,800 yen is refunded to the card
- **AND** the account is on Free from 2026-11-18

### Requirement: REQ-SUB-014 Chargebacks
When the PSP reports a new dispute on a Notely charge, the system SHALL end the subscription immediately, move the account to Free, cancel any scheduled charges and put the account on billing hold. An account on billing hold MUST NOT start a trial or a new subscription. The billing operations team SHALL be notified with the charge, the dispute reason and the PSP's evidence deadline. When the dispute closes in Notely's favor, the billing hold SHALL be lifted but Pro MUST NOT be restored automatically; when it closes against Notely, the hold stays until support lifts it manually.

#### Scenario: Dispute opened
- **GIVEN** an `active` monthly subscription with a period from 2027-01-15 until 2027-02-15
- **WHEN** on 2027-01-20 the PSP reports a dispute on the 980 yen charge of 2026-12-15
- **THEN** the account is on Free from 2027-01-20 and on billing hold
- **AND** no charge is attempted on 2027-02-15

#### Scenario: Dispute won
- **GIVEN** an account on billing hold since 2027-01-20 because of a dispute
- **WHEN** on 2027-03-01 the PSP reports the dispute closed in Notely's favor
- **THEN** the billing hold is lifted and the account stays on Free
- **AND** the user can subscribe again with an immediate charge of 980 yen or 9,800 yen

### Requirement: REQ-SUB-015 Account deletion
Deleting an account SHALL end any subscription immediately, cancel all scheduled charges and retries, and remove the saved card from the PSP. No refund is made for unused time, except that when a charge is still within the refund window of REQ-SUB-013, the deletion flow MUST offer that refund before the user confirms. Any account credit is forfeited, and the confirmation screen MUST show its amount. Billing records (charges, refunds, receipts and disputes) MUST be kept for 7 years for tax and accounting purposes, even though the account and its notes are deleted.

#### Scenario: Deleting an account with a yearly subscription
- **GIVEN** an `active` yearly subscription charged 9,800 yen on 2026-11-15
- **WHEN** the user deletes the account on 2027-06-01
- **THEN** the subscription ends, no refund is made and the 2027-11-15 renewal is never attempted
- **AND** the saved card is removed from the PSP and the billing record of the 2026-11-15 charge is kept

#### Scenario: Deleting within the refund window
- **GIVEN** a monthly subscription charged 980 yen on 2026-12-15
- **WHEN** the user starts account deletion on 2026-12-18
- **THEN** the deletion flow offers a refund of 980 yen before the final confirmation
- **AND** if the user accepts, 980 yen is refunded before the account is deleted

### Requirement: REQ-SUB-016 Processing PSP webhooks
The system SHALL accept a PSP webhook only after verifying its signature; an event that fails verification MUST be rejected with HTTP 400 and MUST NOT change any state. Each event MUST be applied at most once, keyed by its PSP event id, and the endpoint SHALL respond with HTTP 2xx within 10 seconds, doing slow work asynchronously. Because events can arrive late or out of order, the system SHALL read the current state of the charge, refund or dispute from the PSP API before acting on an event. A daily job at 03:00 JST SHALL compare the previous day's charges, refunds and disputes with the PSP and alert billing operations about any mismatch.

#### Scenario: Duplicate delivery
- **GIVEN** the 980 yen renewal of 2026-12-15 has already been applied from PSP event evt_1001
- **WHEN** the PSP delivers evt_1001 again at 00:05 JST on 2026-12-15
- **THEN** the endpoint responds 200 and nothing changes
- **AND** no second receipt is sent and the period still ends on 2027-01-15

#### Scenario: Forged event
- **GIVEN** a `past_due` monthly subscription
- **WHEN** a request with an invalid signature claims that its 980 yen retry succeeded
- **THEN** the endpoint responds 400
- **AND** the subscription stays `past_due`

## ADDED Sections

### Section: Conventions
- **Money.** All amounts are Japanese yen in whole yen (JPY has no minor unit) and are stored and sent to the PSP as integers. Prices include 10% consumption tax. The consumption tax shown on a receipt is floor(amount × 10 ÷ 110), computed once per receipt: 89 yen in 980 yen, 890 yen in 9,800 yen.
- **Rounding.** Proration counts whole JST calendar days and uses the list price of the interval (980 or 9,800 yen), never the amount actually charged for the period. Prorated credits are rounded down to the whole yen. Calculations use integer arithmetic only.
- **Time zone.** All dates and times are Asia/Tokyo (JST, UTC+9, no daylight saving time). Timestamps are stored in UTC and shown in JST. A "day" is a JST calendar day, and "day N after D" is the date D + N.
- **Periods.** A trial or paid period "from D1 until D2" starts at 00:00 JST on D1 and ends at 00:00 JST on D2; D2 is the first day of the next period. Receipts and the billing page show the day before D2 as the last day. Scheduled charges (conversion, renewal, retry) are attempted from 00:00 JST on their date.
- **PSP.** Notely's billing service owns subscription state, schedules, retries, proration and account credit; the PSP is not used to run subscriptions. The PSP stores cards, verifies them with EMV 3-D Secure, executes charges and refunds, and reports disputes. Card details are entered only in PSP-hosted fields and never reach Notely servers; Notely keeps only the PSP customer and payment-method ids, card brand, last 4 digits, expiry and fingerprint. Every charge request carries an idempotency key unique to the attempt (for scheduled charges: subscription id, scheduled date and attempt number), so a network retry cannot charge twice. A charge result is applied once, whether it first arrives in the API response or in a webhook. Webhook events used: `payment.succeeded`, `payment.failed`, `refund.succeeded`, `dispute.created`, `dispute.closed` (generic names, to be mapped to the chosen PSP).

### Section: States

| State | Pro features | Meaning | Transitions out |
|---|---|---|---|
| `free` | No | No subscription: never subscribed, or the last one ended | Trial started with a verified card → `trialing`; first charge of a direct subscription succeeds → `active` |
| `trialing` | Yes | 14-day trial with a verified card; nothing charged yet | Conversion charge succeeds → `active`; conversion charge fails → `past_due`; user cancels → `canceling` |
| `active` | Yes | A paid period is running | Renewal or interval switch succeeds → `active`; renewal charge fails → `past_due`; user cancels → `canceling`; full refund or dispute → `free` |
| `past_due` | Yes | A conversion or renewal charge failed; retries on day 1, 3 and 7 | Retry or new-card charge succeeds → `active`; day-7 retry fails → `free`; user cancels → `free`; dispute → `free` |
| `canceling` | Yes, until the end date | Canceled; ends with the trial or paid period | Undo before the end date → `trialing` or `active`; end date reached → `free`; full refund or dispute → `free` |

Deleting the account ends the subscription from any state (REQ-SUB-015). Billing hold (REQ-SUB-014) is an account flag, not a state: a `free` account on billing hold cannot leave `free`.
