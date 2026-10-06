---
prefix: ORDER
---
## Purpose
Define how a Kurumi order moves from "Buy" to a final outcome (completed, cancelled, or refunded). This covers payment, the escrow-like holding of buyer funds, shipment, delivery, receipt confirmation, disputes, refunds, chargebacks, and seller proceeds. The goal is that the buyer pays only for an item they actually receive as described, and the seller is paid only after that.

## ADDED Sections

### Section: Conventions
#### Scope
- **In scope:** order creation, payment (card, konbini), payment expiry, shipment, delivery tracking, cancellations, receipt confirmation, auto-completion, disputes and CS resolution, item return, refunds, chargeback recording, admin force-cancel, crediting seller proceeds, and payout triggering.
- **Out of scope (owned by other capabilities, referenced only):** listing management, the rating system and seller rating penalties, the Kurumi points ledger, buyer–seller messaging, notification content and templates, carrier integration internals, the payment service provider (PSP) integration internals, KYC and bank account registration.

#### Actors
- **Buyer**: the user who created the order.
- **Seller**: the owner of the listing.
- **CS**: a support staff user with the `cs` role.
- **Admin**: a staff user with the `admin` role.
- **System**: scheduled jobs and inbound webhooks (PSP, carriers).

#### Money
- All amounts are integer JPY. The **item price** is the listing price snapshotted onto the order at creation. In the MVP, shipping cost is included in the item price and paid by the seller.
- **Fee** = `floor(retained_amount × 10 / 100)`, where `retained_amount = item_price − total refunded to buyer`. The fee rate (10%) is snapshotted onto the order at creation.
- **Proceeds** = `retained_amount − fee`.
- **Kurumi points**: 1 point = ¥1. They are credited through the points capability.
- **Ledger invariant:** for any order in a terminal state with no chargeback, `captured_amount = refunded_amount + fee + proceeds`, where `captured_amount` is 0 if the buyer never paid.

#### Time
- Store all timestamps in UTC and display them in JST. Each duration is an exact elapsed time from the triggering timestamp ("3 days" = 72 hours). Durations are not calendar days.
- A deadline counts as passed at the deadline instant itself (`now >= deadline`).
- User actions that depend on a deadline are evaluated against the server clock when the request is received, whether or not the scheduled job has run yet.

### Section: States
#### Order status

| Status | Meaning | Terminal |
|---|---|---|
| `awaiting_payment` | Order created; buyer has not yet paid. Listing is reserved. | No |
| `awaiting_shipment` | Payment captured and held by Kurumi; seller must ship. | No |
| `shipped` | Seller marked the item shipped (tracked or untracked). | No |
| `delivered` | A carrier reported delivery (tracked shipments only). | No |
| `disputed` | Buyer opened a dispute; CS must resolve it. | No |
| `returning` | CS granted a full refund that requires the item to be returned to the seller. | No |
| `completed` | Funds released; seller proceeds credited. | Yes (exception: REQ-ORDER-018) |
| `cancelled` | Order ended before a successful transaction; any captured funds are refunded (except for `chargeback_lost`). | Yes |
| `refunded` | Order ended after shipment with a full refund to the buyer. | Yes |

Orthogonal attributes:
- `cancellation_request`: `none` / `pending` / `approved` / `rejected` (REQ-ORDER-007).
- `chargeback`: `none` / `open` / `won` / `lost` (REQ-ORDER-017). While it is `open`, the order is **on hold**.
- `cancel_reason` (for `cancelled`): `payment_expired`, `buyer_cancelled_unpaid`, `buyer_cancelled_ship_overdue`, `buyer_request_approved`, `seller_cancelled`, `chargeback_lost`, `admin_fraud`.
- `completion_type` (for `completed`): `buyer_confirmed`, `auto_completed`, `dispute_rejected`, `dispute_partial_refund`, `return_not_shipped`.
- `refund_type` (for `refunded`): `full_refund_no_return`, `return_confirmed`, `return_auto_confirmed`.

#### Allowed transitions

| ID | From | To | Trigger | Actor | Req |
|---|---|---|---|---|---|
| T01 | — | `awaiting_payment` | Buy | Buyer | REQ-ORDER-002 |
| T02 | `awaiting_payment` | `awaiting_shipment` | Payment confirmed | System | REQ-ORDER-004 |
| T03 | `awaiting_payment` | `cancelled` (`payment_expired`) | Payment deadline passed | System | REQ-ORDER-004 |
| T04 | `awaiting_payment` | `cancelled` (`buyer_cancelled_unpaid`) | Buyer cancels | Buyer | REQ-ORDER-006 |
| T05 | `awaiting_payment`, `awaiting_shipment` | `cancelled` (`seller_cancelled`) | Seller cancels | Seller | REQ-ORDER-008 |
| T06 | `awaiting_shipment` | `shipped` | Seller marks shipped | Seller | REQ-ORDER-005 |
| T07 | `awaiting_shipment` | `cancelled` (`buyer_cancelled_ship_overdue`) | Buyer cancels after ship deadline | Buyer | REQ-ORDER-006 |
| T08 | `awaiting_shipment` | `cancelled` (`buyer_request_approved`) | Seller approves cancellation request | Seller | REQ-ORDER-007 |
| T09 | `shipped` | `delivered` | Carrier "delivered" event | System | REQ-ORDER-009 |
| T10 | `shipped`, `delivered`, `disputed` | `completed` (`buyer_confirmed`) | Buyer confirms receipt and rates | Buyer | REQ-ORDER-010 |
| T11 | `shipped`, `delivered` | `completed` (`auto_completed`) | Auto-complete deadline passed | System | REQ-ORDER-011 |
| T12 | `shipped`, `delivered` | `disputed` | Buyer opens dispute | Buyer | REQ-ORDER-013 |
| T13 | `disputed` | `completed` (`dispute_rejected` / `dispute_partial_refund`) | CS resolution | CS | REQ-ORDER-014 |
| T14 | `disputed` | `refunded` (`full_refund_no_return`) | CS resolution | CS | REQ-ORDER-014 |
| T15 | `disputed` | `returning` | CS full refund with return | CS | REQ-ORDER-014 |
| T16 | `returning` | `refunded` (`return_confirmed` / `return_auto_confirmed`) | Seller confirms return / timer | Seller / System | REQ-ORDER-015 |
| T17 | `returning` | `completed` (`return_not_shipped`) | Return-ship deadline passed | System | REQ-ORDER-015 |
| T18 | `returning` | `disputed` | Seller reports a problem with the return | Seller | REQ-ORDER-015 |
| T19 | any non-terminal | `cancelled` (`chargeback_lost`) | CS records chargeback lost | CS | REQ-ORDER-017 |
| T20 | any non-terminal; `completed` with proceeds not yet paid out | `cancelled` (`admin_fraud`) | Admin force-cancel | Admin | REQ-ORDER-018 |

#### Listing side effects

The listing state machine itself belongs to the listing capability. It has the states `on_sale`, `in_transaction`, `sold` and `paused`. This capability sets the listing state as follows:

| Order event | Listing becomes |
|---|---|
| Order created (T01) | `in_transaction` |
| `completed` | `sold` |
| `cancelled` with `payment_expired`, `buyer_cancelled_unpaid`, `buyer_request_approved` | `on_sale` |
| `cancelled` with `buyer_cancelled_ship_overdue`, `seller_cancelled`, `chargeback_lost` | `paused` (the seller may relist manually) |
| `cancelled` with `admin_fraud` | Admin's choice: `paused` (default) or `on_sale` (`on_sale` is allowed only if the item was never shipped) |
| `refunded` | `paused` |

#### Timers

| Timer | Starts at | Duration | On expiry | Reminder |
|---|---|---|---|---|
| Card payment window | `created_at` | 30 min | T03 | — |
| Konbini payment deadline | `created_at` | 72 h | T03 | Buyer, 24 h before |
| Ship deadline | `paid_at` | 72 h | No automatic transition; enables T07 | Seller, 24 h before |
| Overdue-shipment ops flag | `paid_at` | 120 h | Adds the order to the ops "overdue shipment" queue; no state change | — |
| Auto-complete (no delivery event) | `shipped_at` | 14 days (336 h) | T11 | Buyer, 48 h before |
| Auto-complete (delivered) | `delivered_at` | 7 days (168 h) | T11 (replaces the timer above) | Buyer, 48 h before |
| Return-ship deadline | entering `returning` | 7 days | T17 | Buyer, 48 h before |
| Return auto-confirm | `return_shipped_at` | 7 days | T16 (`return_auto_confirmed`) | Seller, 48 h before |

The order keeps exactly one `auto_complete_at` value. That value is also the **dispute window** end.

### Section: Open Questions
1. **Automatic cancellation of unshipped orders.** Ops wants an automatic cancel, around 5 days after payment. The MVP only flags these orders to an ops queue at 120 h (REQ-ORDER-006). Do we add auto-cancel after launch, and at what threshold?
2. **Spending Kurumi points.** Konbini refunds produce points, but this spec only allows paying by card or konbini. The points capability must define redemption at checkout, and how refunds work for mixed payments, before launch.
3. **Recovering funds from sellers.** When a chargeback is lost or fraud is found after proceeds were paid out, recovery is fully manual. Should the MVP support negative seller balances or netting against future proceeds?
4. **Payout policy.** Finance needs to confirm three assumptions: no minimum payout, a free weekly transfer, and no expiry on proceeds.

## ADDED Requirements

### Requirement: REQ-ORDER-001 Order state integrity, concurrency and audit
The system MUST change an order's status only through the transitions listed in "Allowed transitions". It MUST reject any other command with `INVALID_STATE` and leave the order unchanged. Commands on one order MUST be serialized (for example, with optimistic locking on an order `version`). When two conflicting commands race, exactly one commits. The other is re-evaluated against the committed state and rejected if it no longer applies.

Every committed transition and sub-state change MUST be appended to an immutable order event log. Each entry records the previous status, the new status, the actor type and ID, the reason code, any free-text note, and a timestamp. Scheduled actions MUST:
- run within 5 minutes after their deadline;
- be idempotent;
- re-check the order's current status and hold state before acting.

Each transition MUST trigger a notification to the buyer and the seller. Reminders are sent according to the Timers table. Only the order's buyer, its seller, CS and Admin may view an order. Each command is restricted to the actors named for it in the transitions table; other actors get `FORBIDDEN`.

#### Scenario: Command not allowed in the current status
- **GIVEN** an order in `awaiting_shipment`
- **WHEN** the buyer submits "confirm receipt"
- **THEN** the system rejects the command with `INVALID_STATE`
- **AND** the order status, timers and event log are unchanged

#### Scenario: Buyer cancel and seller ship race after the ship deadline
- **GIVEN** an order in `awaiting_shipment` whose ship deadline has passed
- **WHEN** the buyer's cancel (T07) and the seller's "mark shipped" (T06) arrive at the same time
- **THEN** exactly one of the two commits
- **AND** the other is rejected with `INVALID_STATE`, and the losing user is shown the order's current status

#### Scenario: Scheduled job fires after a user action already changed the order
- **GIVEN** an order whose `auto_complete_at` has just passed and the auto-complete job is queued
- **AND** the buyer confirmed receipt one second before the job ran
- **WHEN** the auto-complete job runs
- **THEN** the job does nothing because the order is already `completed`
- **AND** proceeds are credited exactly once

### Requirement: REQ-ORDER-002 Order creation
The system SHALL create an order in `awaiting_payment` when a buyer taps "Buy" on a listing, as long as all of the following hold:
- the listing is `on_sale`;
- the buyer is not the seller;
- neither account is suspended or restricted;
- the buyer has a shipping address;
- the chosen payment method is `card` or `konbini` (konbini only when the item price is ≤ ¥300,000);
- the buyer has fewer than 3 orders currently in `awaiting_payment`;
- the price shown to the buyer (`expected_price`) equals the current listing price.

The system MUST create the order and change the listing from `on_sale` to `in_transaction` in a single atomic operation, so that a listing never has more than one non-terminal order. At creation, the order MUST snapshot: listing ID, title, item price, fee rate, seller ID, buyer ID, buyer shipping address, and payment method. The Buy request MUST carry a client idempotency key. A repeated key returns the existing order and does not create a second one.

Error codes:
- `LISTING_UNAVAILABLE`: listing is not `on_sale`
- `SELF_PURCHASE`: buyer is the seller
- `ACCOUNT_RESTRICTED`: either account is suspended or restricted
- `ADDRESS_REQUIRED`: buyer has no shipping address
- `PAYMENT_METHOD_UNAVAILABLE`: method not allowed for this order
- `TOO_MANY_UNPAID_ORDERS`: buyer already has 3 unpaid orders
- `PRICE_CHANGED`: `expected_price` differs from the current price

#### Scenario: Successful order creation
- **GIVEN** a listing `on_sale` at ¥5,000 owned by seller S
- **AND** buyer B (not S) with a shipping address and no unpaid orders
- **WHEN** B taps "Buy" with payment method `konbini` and `expected_price` = ¥5,000
- **THEN** an order is created in `awaiting_payment` with item price ¥5,000 and fee rate 10%
- **AND** the listing becomes `in_transaction` and is no longer purchasable by anyone
- **AND** the konbini payment deadline is set to `created_at` + 72 h

#### Scenario: Buyer attempts to buy their own listing
- **GIVEN** a listing `on_sale` owned by user U
- **WHEN** U taps "Buy" on that listing
- **THEN** the system rejects the request with `SELF_PURCHASE`
- **AND** no order is created and the listing stays `on_sale`

#### Scenario: Two buyers tap "Buy" at the same time
- **GIVEN** a listing `on_sale`
- **WHEN** buyers B1 and B2 submit "Buy" at the same time
- **THEN** exactly one order is created
- **AND** the other buyer's request is rejected with `LISTING_UNAVAILABLE`

### Requirement: REQ-ORDER-003 Listing lock while an order exists
While a listing has a non-terminal order, or an order that is `completed`, the system MUST reject seller edits to the listing's price, title, description, photos and condition. It MUST also reject deletion of the listing. All of these fail with `LISTING_LOCKED`. The lock protects the buyer's purchase terms and keeps evidence intact for disputes. When the order ends `cancelled` or `refunded` and the listing returns to `on_sale` or `paused`, the lock is released, and the order keeps its own snapshot. A listing whose order is `completed` stays `sold` and is permanently read-only, unless an Admin force-cancels that order (REQ-ORDER-018).

#### Scenario: Seller tries to change the price during an order
- **GIVEN** a listing with an order in `awaiting_payment`
- **WHEN** the seller submits a new price for the listing
- **THEN** the system rejects the edit with `LISTING_LOCKED`
- **AND** the order's snapshotted price is unchanged

#### Scenario: Price changed while buyer was on the purchase screen
- **GIVEN** a buyer viewing the purchase screen of a listing priced at ¥3,000
- **AND** the seller changes the price to ¥3,500 before any order exists
- **WHEN** the buyer taps "Buy" with `expected_price` = ¥3,000
- **THEN** the system rejects the request with `PRICE_CHANGED` and returns the current price
- **AND** no order is created

#### Scenario: Lock released after payment expiry
- **GIVEN** an order cancelled with `payment_expired`, so the listing is back `on_sale`
- **WHEN** the seller edits the listing price
- **THEN** the edit succeeds

### Requirement: REQ-ORDER-004 Payment and payment deadline
The system SHALL collect payment for an `awaiting_payment` order using the method chosen at creation. The payment method cannot be changed after creation. To use a different method, the buyer cancels (REQ-ORDER-006) and buys again.
- **Card:** the system MUST capture the full item price immediately, with no separate authorization hold. It supports 3-D Secure. If the card is declined, the order stays `awaiting_payment` and the buyer may retry with the same or another card until the 30-minute card payment window ends.
- **Konbini:** the system MUST issue a konbini payment code at order creation. The code's expiry at the PSP MUST equal the konbini payment deadline (`created_at` + 72 h).

When the PSP confirms payment, the system MUST record `paid_at` and `captured_amount`, transition the order to `awaiting_shipment` (T02), and set the ship deadline to `paid_at` + 72 h. When the payment deadline passes without confirmed payment, the system MUST cancel the order with `payment_expired` (T03), void any konbini code, and return the listing to `on_sale`. A payment confirmation for an order that is no longer `awaiting_payment` is a **late payment**. The system MUST record it and refund it in full (REQ-ORDER-016) without reopening the order. Duplicate PSP notifications MUST be ignored.

#### Scenario: Konbini payment completed in time
- **GIVEN** an order in `awaiting_payment` with method `konbini`, created 50 hours ago
- **WHEN** the PSP notifies that the buyer paid at a convenience store
- **THEN** the order moves to `awaiting_shipment` with `paid_at` set to the notification time
- **AND** the ship deadline is `paid_at` + 72 h
- **AND** the funds are held by Kurumi and nothing is credited to the seller

#### Scenario: Konbini payment not made within 3 days
- **GIVEN** an order in `awaiting_payment` with method `konbini`
- **WHEN** 72 hours pass since `created_at` without a payment confirmation
- **THEN** the order is cancelled with `cancel_reason` = `payment_expired`
- **AND** the konbini payment code is voided at the PSP
- **AND** the listing returns to `on_sale`

#### Scenario: Payment confirmation arrives after cancellation
- **GIVEN** an order cancelled with `payment_expired`
- **WHEN** a konbini payment confirmation for that order arrives
- **THEN** the order stays `cancelled` and the listing is not affected
- **AND** the full amount is refunded to the buyer as Kurumi points
- **AND** the event is recorded in the order event log

### Requirement: REQ-ORDER-005 Shipment
The system SHALL let the seller mark an `awaiting_shipment` order as shipped (T06). The seller chooses one of two methods:
- **`tracked`**: requires a carrier from the supported-carrier list and a tracking number that matches that carrier's configured format; otherwise `INVALID_TRACKING_NUMBER`.
- **`untracked`**: no tracking number.

A tracking number already used by another non-terminal order MUST be rejected with `TRACKING_NUMBER_IN_USE`, unless both orders have the same buyer (combined shipment). "Mark shipped" MUST be rejected with:
- `CANCELLATION_REQUEST_PENDING` while a buyer cancellation request is pending;
- `ORDER_ON_HOLD` while a chargeback is open.

Shipping after the ship deadline is allowed as long as the buyer has not cancelled. On shipment, the system records `shipped_at` and sets `auto_complete_at` = `shipped_at` + 14 days. While the order is `shipped`, the seller may correct the carrier or tracking number. Correcting does not change `shipped_at`. Switching between `tracked` and `untracked` after shipment is not allowed.

#### Scenario: Seller ships with tracking before the deadline
- **GIVEN** an order in `awaiting_shipment`, paid 30 hours ago, with no pending cancellation request
- **WHEN** the seller marks it shipped with a supported carrier and a valid tracking number
- **THEN** the order moves to `shipped` with `shipped_at` recorded
- **AND** `auto_complete_at` = `shipped_at` + 14 days
- **AND** the buyer is notified with the carrier and tracking number

#### Scenario: Seller ships after the deadline but before the buyer cancels
- **GIVEN** an order in `awaiting_shipment` whose ship deadline passed 10 hours ago and the buyer has not cancelled
- **WHEN** the seller marks it shipped
- **THEN** the order moves to `shipped`
- **AND** the buyer can no longer use the overdue-shipment cancellation (REQ-ORDER-006)

#### Scenario: Shipment blocked by a pending cancellation request
- **GIVEN** an order in `awaiting_shipment` with `cancellation_request` = `pending`
- **WHEN** the seller tries to mark it shipped
- **THEN** the system rejects the command with `CANCELLATION_REQUEST_PENDING`
- **AND** the seller is prompted to approve or reject the request first

### Requirement: REQ-ORDER-006 Buyer cancellation without seller approval
The system SHALL let the buyer cancel immediately, without seller approval, in exactly two cases:
- **Unpaid:** the order is `awaiting_payment` (T04, `buyer_cancelled_unpaid`). The system voids any konbini code and returns the listing to `on_sale`.
- **Overdue shipment:** the order is `awaiting_shipment` and the ship deadline has passed (T07, `buyer_cancelled_ship_overdue`). The system refunds the captured amount in full (REQ-ORDER-016) and sets the listing to `paused`.

Before the ship deadline, a direct cancel of an `awaiting_shipment` order MUST be rejected with `DEADLINE_NOT_PASSED`. The buyer must use a cancellation request (REQ-ORDER-007) instead. No buyer cancellation is possible once the order is `shipped` or later. Neither case is available while a chargeback is open (`ORDER_ON_HOLD`). For the MVP, an unshipped order is **never** cancelled automatically. Orders still unshipped 120 hours after payment are only flagged to the ops queue (see Timers).

#### Scenario: Buyer cancels an unpaid konbini order
- **GIVEN** an order in `awaiting_payment` with method `konbini`
- **WHEN** the buyer cancels the order
- **THEN** the order is cancelled with `buyer_cancelled_unpaid`
- **AND** the konbini payment code is voided and the listing returns to `on_sale`

#### Scenario: Seller misses the ship deadline and the buyer cancels
- **GIVEN** an order in `awaiting_shipment` with captured amount ¥8,000, paid 73 hours ago, not shipped
- **WHEN** the buyer cancels the order
- **THEN** the order is cancelled with `buyer_cancelled_ship_overdue`
- **AND** ¥8,000 is refunded to the buyer through the original payment method (REQ-ORDER-016)
- **AND** the listing becomes `paused`

#### Scenario: Buyer tries a direct cancel before the ship deadline
- **GIVEN** an order in `awaiting_shipment` paid 24 hours ago
- **WHEN** the buyer submits a direct cancel
- **THEN** the system rejects it with `DEADLINE_NOT_PASSED`
- **AND** the buyer is offered the cancellation-request flow

### Requirement: REQ-ORDER-007 Buyer cancellation request (seller approval)
The system SHALL let the buyer submit a cancellation request on an `awaiting_shipment` order before the ship deadline. The request MUST include a reason. Each order allows at most one request; a second one is rejected with `CANCELLATION_REQUEST_LIMIT`. While the request is `pending`:
- the seller MUST approve or reject it before shipping (REQ-ORDER-005);
- the seller cannot cancel unilaterally (REQ-ORDER-008).

On approval, the system cancels the order with `buyer_request_approved` (T08), refunds the full captured amount, and returns the listing to `on_sale`. No seller penalty event is emitted. On rejection, the order continues unchanged. A pending request does not expire and does not pause the ship deadline. If the ship deadline passes while the request is pending, the buyer may also cancel directly (REQ-ORDER-006).

#### Scenario: Seller approves the request
- **GIVEN** an order in `awaiting_shipment` with a pending buyer cancellation request
- **WHEN** the seller approves the request
- **THEN** the order is cancelled with `buyer_request_approved`
- **AND** the buyer receives a full refund (REQ-ORDER-016)
- **AND** the listing returns to `on_sale`

#### Scenario: Seller rejects the request
- **GIVEN** an order in `awaiting_shipment` with a pending buyer cancellation request
- **WHEN** the seller rejects the request
- **THEN** `cancellation_request` becomes `rejected` and the order stays `awaiting_shipment`
- **AND** the seller may now mark the order shipped
- **AND** a new cancellation request from the buyer is rejected with `CANCELLATION_REQUEST_LIMIT`

#### Scenario: Ship deadline passes while the request is pending
- **GIVEN** an order in `awaiting_shipment` with a pending request and a ship deadline that has just passed
- **WHEN** the buyer cancels directly
- **THEN** the order is cancelled with `buyer_cancelled_ship_overdue` and a full refund is issued
- **AND** the pending request is closed

### Requirement: REQ-ORDER-008 Seller cancellation before shipment
The system SHALL let the seller cancel an order in `awaiting_payment` or `awaiting_shipment` (T05). The seller MUST give a reason: `item_damaged`, `item_lost`, `sold_elsewhere` or `other`, plus free text. Effects:
- the order is cancelled with `seller_cancelled`;
- any captured amount is refunded in full;
- any konbini code is voided;
- the listing becomes `paused`;
- the system emits an `order.seller_cancelled` domain event. The rating capability consumes it to apply the seller rating penalty, which is outside this spec.

Seller cancellation MUST be rejected with:
- `INVALID_STATE` once the order is `shipped` or later;
- `CANCELLATION_REQUEST_PENDING` while a buyer cancellation request is pending (the seller approves that request instead);
- `ORDER_ON_HOLD` while a chargeback is open.

#### Scenario: Seller cancels a paid order because the item is damaged
- **GIVEN** an order in `awaiting_shipment` paid by card for ¥4,000
- **WHEN** the seller cancels with reason `item_damaged`
- **THEN** the order is cancelled with `seller_cancelled`
- **AND** ¥4,000 is refunded to the buyer's card
- **AND** the listing becomes `paused`
- **AND** an `order.seller_cancelled` event is emitted

#### Scenario: Seller tries to cancel after shipping
- **GIVEN** an order in `shipped`
- **WHEN** the seller tries to cancel it
- **THEN** the system rejects the command with `INVALID_STATE`

### Requirement: REQ-ORDER-009 Delivery tracking
For `tracked` shipments with a supported carrier, the system SHALL consume carrier status events. When a "delivered" event arrives for an order in `shipped`, the system MUST:
- transition the order to `delivered` (T09);
- set `delivered_at` to the time Kurumi records the event (not the carrier-reported time);
- replace `auto_complete_at` with `delivered_at` + 7 days.

Other carrier statuses (in transit, held at depot, returned to sender) MUST be stored as tracking history and shown to both parties, with no state change. The system MUST ignore events that are duplicates, that reference unknown tracking numbers, or that target an order not in `shipped`, and log them. One exception: if a "delivered" event arrives while the order is `disputed`, the system records `delivered_at` as evidence for CS without changing the status. `untracked` shipments never enter `delivered`.

#### Scenario: Carrier reports delivery
- **GIVEN** an order in `shipped` with a tracked shipment, shipped 2 days ago
- **WHEN** the carrier integration reports "delivered" for its tracking number
- **THEN** the order moves to `delivered` with `delivered_at` = the time the event was recorded
- **AND** `auto_complete_at` = `delivered_at` + 7 days
- **AND** the buyer is asked to confirm receipt and rate the seller

#### Scenario: Duplicate delivered event
- **GIVEN** an order already in `delivered`
- **WHEN** a second "delivered" event for the same tracking number arrives
- **THEN** the order, `delivered_at` and `auto_complete_at` are unchanged

### Requirement: REQ-ORDER-010 Receipt confirmation and rating
The system SHALL let the buyer confirm receipt of an order in `shipped`, `delivered` or `disputed` (T10). The buyer MUST submit a rating of the seller with the confirmation. The rating format is defined by the rating capability; for the MVP it is `good` / `normal` / `bad` plus an optional comment. A confirmation without a rating MUST be rejected with `RATING_REQUIRED`.

Saving the rating and completing the order MUST be atomic: either both persist or neither does. Completion releases the funds and credits proceeds (REQ-ORDER-012). Confirming while `disputed` closes the dispute as resolved by the buyer. Confirmation is unavailable in `returning` (`INVALID_STATE`) and while a chargeback is open (`ORDER_ON_HOLD`). After completion, the seller may rate the buyer through the rating capability; this is not required for completion.

#### Scenario: Buyer confirms a delivered order
- **GIVEN** an order in `delivered` with item price ¥3,333
- **WHEN** the buyer confirms receipt with rating `good`
- **THEN** the order moves to `completed` with `completion_type` = `buyer_confirmed`
- **AND** the rating is stored
- **AND** the seller's available balance increases by ¥3,000 (fee ¥333)
- **AND** the listing becomes `sold`

#### Scenario: Buyer confirms an untracked shipment
- **GIVEN** an order in `shipped` with an `untracked` shipment
- **WHEN** the buyer confirms receipt with a rating
- **THEN** the order moves to `completed` with `completion_type` = `buyer_confirmed`

#### Scenario: Confirmation without a rating
- **GIVEN** an order in `delivered`
- **WHEN** the buyer submits a confirmation with no rating
- **THEN** the system rejects it with `RATING_REQUIRED` and the order stays `delivered`

### Requirement: REQ-ORDER-011 Auto-completion
When `auto_complete_at` passes for an order in `shipped` or `delivered` with no open chargeback, the system SHALL complete the order automatically (T11, `auto_completed`). `auto_complete_at` is:
- `delivered_at` + 7 days for a delivered tracked shipment;
- otherwise `shipped_at` + 14 days. This covers untracked shipments and tracked shipments with no "delivered" event.

Auto-completion releases funds exactly as buyer confirmation does (REQ-ORDER-012) but records no rating on the buyer's behalf. Orders in `disputed` or `returning`, or on hold, MUST NOT be auto-completed.

#### Scenario: Buyer does not confirm a delivered order
- **GIVEN** an order in `delivered` with `delivered_at` = D
- **WHEN** D + 7 days passes without buyer confirmation or a dispute
- **THEN** the order moves to `completed` with `completion_type` = `auto_completed`
- **AND** proceeds are credited to the seller and no buyer rating is recorded

#### Scenario: Untracked shipment is never confirmed
- **GIVEN** an order in `shipped` with an `untracked` shipment, `shipped_at` = S
- **WHEN** S + 14 days passes without buyer confirmation or a dispute
- **THEN** the order moves to `completed` with `completion_type` = `auto_completed`

#### Scenario: Open dispute blocks auto-completion
- **GIVEN** an order that entered `disputed` before its `auto_complete_at`
- **WHEN** the original `auto_complete_at` time passes
- **THEN** the order stays `disputed` and no funds are released

### Requirement: REQ-ORDER-012 Funds custody, seller proceeds and payout
The system MUST hold all captured buyer funds in Kurumi custody until the order reaches a terminal state. Before the order is `completed`, nothing may be credited to the seller's balance or paid out.

When an order becomes `completed`, the system MUST:
- compute `retained_amount`, the fee and the proceeds as defined in Conventions;
- credit the proceeds to the seller's **available** balance;
- record the fee as Kurumi revenue;
- write these as ledger entries linked to the order.

On `cancelled` or `refunded`, no fee is charged and nothing is credited to the seller.

Payouts transfer the seller's entire available balance to the seller's registered bank account. Frozen amounts (REQ-ORDER-017) are excluded.
- **Weekly payout:** runs every Monday at 09:00 JST, free of charge.
- **Instant payout:** on seller request, for a fee of ¥200. It requires an available balance > ¥200 (`INSUFFICIENT_BALANCE` otherwise) and no other payout in progress. The amount transferred is the balance minus ¥200.

Sellers with no registered bank account are skipped by the weekly run, and their balance stays available. Instant payout requests from them are rejected with `BANK_ACCOUNT_REQUIRED`. If a bank transfer fails, the system restores the full deducted amount to the available balance, including any instant-payout fee, and notifies the seller. An order's proceeds count as **paid out** once a payout initiated after they were credited has succeeded.

#### Scenario: Seller cannot receive funds before completion
- **GIVEN** an order in `delivered` with captured amount ¥10,000
- **WHEN** the weekly payout run executes
- **THEN** none of the ¥10,000 is included in the seller's payout
- **AND** the seller's available balance does not include it

#### Scenario: Completion credits proceeds, which are paid out weekly
- **GIVEN** a seller with a registered bank account and available balance ¥0
- **AND** an order with item price ¥3,333 that becomes `completed` on Thursday
- **WHEN** the next Monday 09:00 JST payout run executes
- **THEN** the seller's available balance after completion was ¥3,000 (fee ¥333)
- **AND** ¥3,000 is transferred to the seller's bank account and the balance becomes ¥0

#### Scenario: Instant payout
- **GIVEN** a seller with available balance ¥5,000 and a registered bank account
- **WHEN** the seller requests an instant payout
- **THEN** ¥4,800 is transferred immediately and ¥200 is recorded as Kurumi revenue
- **AND** the available balance becomes ¥0

### Requirement: REQ-ORDER-013 Opening a dispute
The system SHALL let the buyer open a dispute (T12) on an order in `shipped` or `delivered`, strictly before `auto_complete_at`. For a delivered tracked shipment, the window ends 7 days after delivery. For untracked shipments and tracked shipments with no delivery event, it ends 14 days after shipment. The buyer MUST provide:
- a reason: `not_as_described`, `damaged` or `not_received`;
- a description of at least 10 characters;
- optionally, up to 10 photos.

Each order allows at most one dispute; a second is rejected with `DISPUTE_ALREADY_OPENED`. Opening a dispute is rejected with `DISPUTE_WINDOW_CLOSED` once `auto_complete_at` has passed, and with `ORDER_ON_HOLD` while a chargeback is open. On opening, the system:
- moves the order to `disputed` and clears `auto_complete_at`;
- creates a CS queue item;
- notifies the seller, who may submit a written response and up to 10 photos.

#### Scenario: Buyer opens a dispute within the window
- **GIVEN** an order in `delivered` with `delivered_at` 3 days ago
- **WHEN** the buyer opens a dispute with reason `damaged`, a description and photos
- **THEN** the order moves to `disputed` and `auto_complete_at` is cleared
- **AND** a CS queue item is created and the seller is notified

#### Scenario: Dispute after the window has closed
- **GIVEN** an order in `delivered` whose `auto_complete_at` passed 1 minute ago, and the auto-complete job has not run yet
- **WHEN** the buyer tries to open a dispute
- **THEN** the system rejects it with `DISPUTE_WINDOW_CLOSED`
- **AND** the order is auto-completed when the job runs

#### Scenario: Untracked item not received
- **GIVEN** an order in `shipped` with an `untracked` shipment, shipped 13 days ago
- **WHEN** the buyer opens a dispute with reason `not_received`
- **THEN** the order moves to `disputed`

### Requirement: REQ-ORDER-014 Dispute resolution by CS
The system SHALL let CS resolve a `disputed` order with exactly one of the outcomes below. Each resolution requires a CS note and is final within the system; any appeal is handled manually by CS.
- **Full refund with return** (T15): the order moves to `returning` and the return flow starts (REQ-ORDER-015). No refund is issued until the return completes.
- **Full refund without return** (T14): the captured amount is refunded immediately and the order becomes `refunded` (`full_refund_no_return`). CS uses this for `not_received`, or when returning the item is impractical or unsafe.
- **Partial refund** (T13): CS enters amount A, an integer with 1 ≤ A < captured amount. Otherwise the system returns `INVALID_REFUND_AMOUNT`. A is refunded, the buyer keeps the item, and the order becomes `completed` (`dispute_partial_refund`). The fee and proceeds are computed on `retained_amount = item_price − A`.
- **Reject** (T13): no refund. The order becomes `completed` (`dispute_rejected`) and the full proceeds are credited to the seller.

"Full refund with return" MUST NOT be chosen if the item has already been returned in this order (re-review after T18). CS resolution is blocked while a chargeback is open (`ORDER_ON_HOLD`).

#### Scenario: Partial refund
- **GIVEN** a `disputed` order with item price ¥10,000 paid by card
- **WHEN** CS resolves with a partial refund of ¥3,000
- **THEN** ¥3,000 is refunded to the buyer's card
- **AND** the order moves to `completed` with `completion_type` = `dispute_partial_refund`
- **AND** the seller is credited ¥6,300 (retained ¥7,000 − fee ¥700)

#### Scenario: Dispute rejected
- **GIVEN** a `disputed` order with item price ¥10,000
- **WHEN** CS rejects the dispute
- **THEN** the order moves to `completed` with `completion_type` = `dispute_rejected`
- **AND** the seller is credited ¥9,000

#### Scenario: Full refund without return for a lost item
- **GIVEN** a `disputed` order with reason `not_received` and captured amount ¥6,000 paid by konbini
- **WHEN** CS resolves with a full refund without return
- **THEN** 6,000 Kurumi points are credited to the buyer
- **AND** the order moves to `refunded` with `refund_type` = `full_refund_no_return`
- **AND** the listing becomes `paused` and the seller is credited nothing

### Requirement: REQ-ORDER-015 Item return after a full-refund resolution
For an order in `returning`, the system SHALL require the buyer to ship the item back before the return-ship deadline (7 days after entering `returning`). The return is sent cash-on-delivery (着払い), so the seller pays the return shipping and Kurumi moves no money for it. The buyer marks the return shipped with the same tracked/untracked options as REQ-ORDER-005, and the system records `return_shipped_at`.

After the return is shipped, the system MUST issue the full refund and move the order to `refunded` when either of the following happens first:
- the seller confirms receipt of the returned item (`return_confirmed`);
- `return_shipped_at` + 7 days passes (`return_auto_confirmed`).

Before the refund is issued, the seller may report a problem with the return (not received, different item, newly damaged). This moves the order back to `disputed` (T18) for CS re-review, with no refund issued. If the buyer does not mark the return shipped before the deadline, the system completes the order with `return_not_shipped` (T17) and credits the full proceeds to the seller.

#### Scenario: Return completed and confirmed by the seller
- **GIVEN** an order in `returning` with captured amount ¥7,000 paid by card
- **AND** the buyer marked the return shipped 2 days ago
- **WHEN** the seller confirms receipt of the returned item
- **THEN** ¥7,000 is refunded to the buyer's card
- **AND** the order moves to `refunded` with `refund_type` = `return_confirmed`
- **AND** the listing becomes `paused`

#### Scenario: Buyer never ships the return
- **GIVEN** an order that entered `returning` 7 days ago, with no return shipped
- **WHEN** the return-ship deadline passes
- **THEN** the order moves to `completed` with `completion_type` = `return_not_shipped`
- **AND** the seller is credited the full proceeds and no refund is issued

#### Scenario: Seller reports a problem with the returned item
- **GIVEN** an order in `returning` with the return shipped 3 days ago
- **WHEN** the seller reports that the returned item is not the item sold
- **THEN** the order moves back to `disputed` with no refund issued
- **AND** a CS queue item is created for re-review, where "full refund with return" is not available

### Requirement: REQ-ORDER-016 Refund execution
Every refund MUST go back to the original payment method:
- **Card:** a refund to the same card through the PSP, full or partial.
- **Konbini:** Kurumi points equal to the refund amount, credited to the buyer through the points capability in the same transaction as the order change.

The system MUST guarantee:
- the total refunded on an order never exceeds `captured_amount`;
- each refund carries an idempotency key derived from the order and the refund cause, so retries never double-refund;
- no refund is issued for an order with `captured_amount` = 0.

A card refund that the PSP rejects MUST be retried with exponential backoff for up to 24 hours. After that, a CS queue item is created, and CS may manually reissue the refund as Kurumi points. The order's status transition does not wait for the card refund to settle. Instead, each refund has its own status (`pending` / `succeeded` / `failed` / `deferred`), which is visible to the buyer and CS. While a chargeback is open on the order, any refund that would be issued MUST instead be recorded as `deferred` (REQ-ORDER-017).

#### Scenario: Card refund on cancellation
- **GIVEN** an order paid by card for ¥4,000 that is cancelled with `seller_cancelled`
- **WHEN** the refund is executed
- **THEN** a ¥4,000 refund is issued to the same card through the PSP
- **AND** the refund status moves from `pending` to `succeeded` when the PSP confirms

#### Scenario: Konbini payment refunded as points
- **GIVEN** an order paid by konbini for ¥2,500 whose cancellation request is approved
- **WHEN** the order is cancelled
- **THEN** 2,500 Kurumi points are credited to the buyer in the same transaction
- **AND** no cash refund is attempted

#### Scenario: Card refund keeps failing
- **GIVEN** a card refund of ¥5,000 that the PSP rejects because the card is closed
- **WHEN** retries have failed for 24 hours
- **THEN** the refund status becomes `failed` and a CS queue item is created
- **AND** the order status (already terminal) is unchanged

### Requirement: REQ-ORDER-017 Chargebacks
When the PSP reports a chargeback (card dispute) on an order's card payment, the system SHALL:
- set the order's `chargeback` attribute to `open`, recording the PSP dispute ID, amount, reason code and receipt time;
- create a CS queue item.

Duplicate notifications for the same PSP dispute ID MUST be ignored. While the chargeback is `open`, the order is **on hold**:
- every buyer and seller action, every CS dispute action, and every scheduled transition is blocked with `ORDER_ON_HOLD`. Only CS recording the chargeback outcome and Admin force-cancel are allowed;
- all running timers are suspended, and each one's remaining duration is recorded;
- if the order is `completed`, its proceeds are moved from the seller's available balance to **frozen** and excluded from payouts. If they were already paid out, the system only records the chargeback.

CS records the outcome manually after handling the case with the PSP:
- **Won:** the hold is lifted. Each suspended timer resumes with `deadline = release time + max(remaining duration, 24 h)`. Frozen proceeds return to available. Any `deferred` refund is then issued.
- **Lost, order non-terminal:** the order is cancelled with `chargeback_lost` (T19). Kurumi issues no refund, because the card network has already returned the money. Any `deferred` refund is dropped, nothing is credited to the seller, and the listing becomes `paused`.
- **Lost, order completed:** CS chooses either `release_to_seller` (frozen proceeds return to available; Kurumi absorbs the loss) or `reverse_proceeds` (the frozen proceeds are removed from the seller's balance).

A chargeback on an order that is already `cancelled` or `refunded` is recorded and queued to CS with no state change.

#### Scenario: Chargeback on an order in progress
- **GIVEN** an order in `shipped` paid by card, with `auto_complete_at` 5 days away
- **WHEN** the PSP reports a chargeback
- **THEN** the order's `chargeback` becomes `open` and a CS queue item is created
- **AND** buyer confirmation, dispute opening and auto-completion are blocked with `ORDER_ON_HOLD`
- **AND** the auto-complete timer is suspended with 5 days remaining

#### Scenario: Chargeback won by Kurumi
- **GIVEN** an order on hold with an auto-complete timer suspended with 5 days remaining
- **WHEN** CS records the chargeback outcome as won
- **THEN** `chargeback` becomes `won` and the hold is lifted
- **AND** `auto_complete_at` = release time + 5 days

#### Scenario: Chargeback lost before completion
- **GIVEN** an order in `awaiting_shipment` on hold due to an open chargeback for ¥9,000
- **WHEN** CS records the chargeback outcome as lost
- **THEN** the order is cancelled with `chargeback_lost`
- **AND** Kurumi issues no refund and the seller is credited nothing
- **AND** the listing becomes `paused`

### Requirement: REQ-ORDER-018 Admin force-cancellation for fraud
The system SHALL let an Admin force-cancel an order for fraud (T20). This applies to any non-terminal order, including orders on hold. It also applies to a `completed` order whose proceeds have not yet been paid out. The Admin MUST provide a fraud category and a note. Both are written to the audit log together with the Admin's ID. Effects:
- the order is cancelled with `admin_fraud`;
- any konbini code is voided;
- the buyer is refunded `captured_amount − already refunded`, or the refund is recorded as `deferred` if a chargeback is open;
- for a `completed` order, the credited proceeds and the fee are reversed (if frozen, they are reversed from frozen);
- the listing is set according to the Admin's choice (see "Listing side effects").

A force-cancel on a `completed` order whose proceeds have already been paid out MUST be rejected with `PROCEEDS_ALREADY_PAID_OUT`. Recovering those funds is manual. No `order.seller_cancelled` event is emitted for admin cancellations. Admin force-cancel is the **only** transition out of `completed`.

#### Scenario: Admin cancels a shipped order for fraud
- **GIVEN** an order in `shipped` paid by card for ¥12,000
- **WHEN** an Admin force-cancels it with category `counterfeit_item` and a note
- **THEN** the order is cancelled with `admin_fraud`
- **AND** ¥12,000 is refunded to the buyer's card
- **AND** the listing becomes `paused`, and the audit log records the Admin, category and note

#### Scenario: Completed order already paid out
- **GIVEN** a `completed` order whose proceeds were included in a succeeded payout
- **WHEN** an Admin tries to force-cancel it
- **THEN** the system rejects the command with `PROCEEDS_ALREADY_PAID_OUT` and nothing changes

#### Scenario: Force-cancel while a chargeback is open
- **GIVEN** an order in `awaiting_shipment` with an open chargeback
- **WHEN** an Admin force-cancels it
- **THEN** the order is cancelled with `admin_fraud`
- **AND** the buyer refund is recorded as `deferred`. It is issued only if the chargeback is later won, and dropped if it is lost.
