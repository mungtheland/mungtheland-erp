# Pass issuance V2 coexistence contract

## Workbook boundaries

- The existing `_이용권발급이력` tab is immutable legacy input with its exact 13-column schema.
- New issuance records use `_이용권발급원장V2` and the exact ordered 16-column contract in `src/PassIssuanceLedger.js`.
- The V2 tab is not created by code. Missing or mismatched V2 headers fail closed.
- Legacy lookup and V2 persistence are separate modules. The legacy adapter has no storage API dependency.
- Existing legacy rows are never promoted to V2 `COMMITTED` records or filled with fabricated identifiers.

## Identifier and evidence rules

- `issuanceRequestId` is created once by the first trusted issuance intake before processing, stored with that intake, and returned unchanged on retries. A newly generated retry ID is invalid.
- `idempotencyKey` is `PASS-ISSUE:v{catalogVersion}:{issuanceRequestId}` and remains stable for the same request and catalog version.
- `paymentReference` is the exact immutable transaction or receipt identifier from a verified payment source. Payment method, amount, date, guardian name, or a locally generated random value is not a substitute. It is unique across the applicable issuance history.
- A different request ID using an existing payment reference is rejected. Unknown historical reference coverage blocks issuance.
- A pet and guardian are linked only by exact stable IDs from the authoritative pet-owner record. Matching names are not evidence.
- Payment evidence must match exact reference, amount, completed status, source, and evidence reference. Refund or cancellation status requires separate review.

## Product and state rules

- Only an active, approved `PASS` product with a catalog version and total uses in 8, 12, 16, or 20 can enter recurring-pass planning.
- `DAYCARE_DAILY` and `HOTEL` do not enter recurring-pass issuance; `TEST_ONLY` is blocked from operational issuance. Draft, unknown, or unapproved products need review.
- The issuance V2 state lifecycle remains `VALIDATED -> PENDING -> COMMITTED`; partial and uncertain states require review. A committed result requires a matching pass row and issuance record.
- The preflight returns `PLAN_ONLY` only for explicitly synthetic evidence. It never returns a live-issuable state and is not connected to `mdRegisterPass` or the Apps Script persistence entry.

## Historical coexistence and migration

- Exact request/pass ID, pet ID, and use count can be compared to legacy rows. Missing product ID or payment reference prevents historical payment deduplication and remains `UNKNOWN` or `NEEDS_REVIEW`.
- The existing 13-column tab remains read-only. New V2 rows are not copied into it, and old rows are not backfilled.
- Any future V2 tab creation, schema rollout, payment-source proof, recovery ownership, or live write requires separate approval. Rollback disables the writer and preserves all rows; no automatic delete or reissue is allowed.

## Payment channel evidence

The repository records staff-entered payment status and a free-form accounting payment method; it does not establish a Tally, Naver Reservation, Kakao, card-processor, or bank API reference integration. Those names are candidate source channels only until an authoritative integration and its immutable transaction identifier are verified.
