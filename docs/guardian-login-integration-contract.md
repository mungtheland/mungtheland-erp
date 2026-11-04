# Guardian login integration contract — implementation gate

Status: design only; no public authentication endpoint has been deployed.

## Enrollment
1. Staff signs into a trusted staff console. The server—not a browser flag—authorizes invitation creation.
2. Staff selects an existing customer and confirms an approved out-of-band identity verification process. An invitation is single-use, expires in 24 hours, and must not itself authenticate the holder.
3. A credential provider must verify possession of the guardian's selected sign-in method and return a server-verifiable subject. An invitation token or customer ID must never be treated as that proof.
4. The server binds the verified provider subject to exactly one customer record, recording verifier, verification time, and link status. Conflicting links require staff review.
5. Account activation is permitted only after both staff verification and credential provisioning succeed. Do not accept a browser-supplied 'credentialReady' or staff role.

## Login and session
- Validate provider assertion on the server (issuer, audience, signature, expiry, nonce, and replay).
- Derive the customer identity exclusively from a server-owned account mapping.
- Sessions expire, can be revoked, and do not expose secrets in URLs or logs. Protect against session fixation and CSRF where applicable.
- Rate-limit sign-in and recovery. A failed lookup must not reveal whether an account exists.
- Never store raw passwords or reversible passwords in Google Sheets. Prefer a managed authentication provider rather than implementing password hashing in Apps Script.

## Authorized ERP reads
- Guardian session -> mapped customer ID -> linked dogs -> bookings, requests, attendance, published diary, and pass balances.
- Every endpoint must revalidate ownership. The browser may send a booking ID as a selector but cannot supply customerId/dogId as authorization.
- Staff-only diary drafts and unpublished photos are not exposed.
- Guardian request editing ends at check-in or cancellation, with revision checks.

## Isolation and deployment
- Feature branch: feature/guardian-request-prototype only.
- Test Apps Script project and test spreadsheet only. Never touch production ERP, production Sheets, main, or live deployment without approval.
- Do not expose test-only token issuance, fixture setup, enrollment verification or activation methods through a web app.
- Build needs 16 source mappings, including GuardianActivationService.gs and GuardianActivationTest.gs; the previously uploaded local build is not yet reflected in GitHub.

## Open integration decision
Select an external credential service (e.g. Firebase Authentication with email/password or phone verification) and configure a trusted server that verifies its identity tokens. Apps Script alone must not be used as an unverified public identity broker.

## Required security tests
Two distinct guardians; cross-customer booking access; expired/replayed invite; wrong/expired/revoked credential; forged client identity; logout; session expiry; canceled/checked-in booking; unreviewed diary; concurrent revision conflict.
