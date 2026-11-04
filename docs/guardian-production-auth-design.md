# Guardian production authentication design (NOT IMPLEMENTED)

## Decision gate
The existing fixed synthetic identity and editor-issued test token are **not** customer authentication. Never publish those methods via doGet, doPost, google.script.run or an anonymous Apps Script web app.

Recommended first production implementation: a trusted identity provider with verified phone ownership or an equivalent strong account login, backed by a server-side verified identity-to-customer mapping. Provider selection, privacy notice, and consent need owner approval before implementation.

## Required trust boundaries
1. Identity is verified server-side using a provider-signed assertion with audience, issuer, expiry, nonce/state, replay protection and verified subject checks. A client-provided customerId, dogId, bookingId, phone number or role is never proof of identity.
2. Map verified provider subject to a customer record in a dedicated account-link table. Phone number alone must not grant account access; staff-mediated enrollment or independently verified matching is needed.
3. Resolve dog ownership and booking eligibility on **every** read/write, including a recheck after acquiring the write lock. Never return another customer's booking or diary.
4. Store only hashed session tokens server-side, use short expiry, rotate/revoke on logout, and rate-limit authentication and requests. Avoid tokens in URLs, logs, analytics and localStorage.
5. A booking can be edited only before check-in, if not canceled. Optimistic revision mismatch must reject stale updates. Staff acknowledgment is invalidated by guardian edits.
6. Use a least-privilege deployment identity, restricted deployment audience, CSRF protections where cookie sessions are used, and HTTPS. Define retention, access logging and incident response.
7. Do not include test fixture code, test spreadsheet identifiers or test-only session issuance in a production bundle. Keep live data separated from all tests.

## Release gates
- Verified login and account enrollment flow demonstrated end-to-end.
- Authorization tests: two independent guardians, multiple dogs, forged IDs, expired/revoked tokens, stale revision, canceled/checked-in bookings, staff/guardian separation.
- Privacy, session management and deployment permissions reviewed.
- Explicit owner approval before any production ERP changes or deployment.

## Current state
Internal test read/write logic and security checks passed in isolated Apps Script. Public login, enrollment, guardian UI server connection and production deployment are not yet implemented.
