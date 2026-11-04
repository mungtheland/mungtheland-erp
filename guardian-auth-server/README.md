# Guardian email/password authentication — isolated integration

**Not deployed.** No real credentials, Firebase project, production spreadsheet, or public endpoint have been configured.

## Architecture
- Staff uses an authenticated staff-only workflow to issue a single-use invitation for an existing customer.
- Guardian accepts the invitation and completes an independently verified enrollment process.
- A Firebase Authentication **test project** manages email/password, email verification, password reset and revocation. Never store passwords in Sheets.
- A trusted Node.js backend uses the Firebase Admin SDK to verify ID tokens with revocation checking. `guardian-auth-server/authenticate.js` accepts an Admin Auth instance and a trusted account mapping store.
- Account mapping `firebaseUid -> customerId, verified email, active status` is server-managed. A public caller cannot create/modify this mapping.
- Only after authenticated enrollment and staff verification may an account be linked. The existing synthetic Apps Script activation gate is NOT sufficient proof.
- After token verification, the backend may query guardian-owned booking/diary data through a separately authenticated service interface. No such endpoint exists yet.

## Test the adapter without credentials
From the repository root, run `node --test guardian-auth-server/authenticate.test.js`. Tests use mock verifier and mapping; they do not contact Firebase or Apps Script.

## Firebase setup still required
1. Create a separate Firebase test project and enable Email/Password sign-in.
2. Configure verified sender domains and email verification/reset templates.
3. Provision server-only Firebase Admin credentials through a secrets manager or workload identity. Do not commit service-account JSON or private keys.
4. Implement an authenticated staff console and trusted invitation-to-Firebase-account linking workflow.
5. Implement a server-owned mapping store, access audit, rate limits, and an authenticated API that checks booking ownership.
6. Run end-to-end tests with two different test guardian accounts, expired/revoked tokens, duplicate mapping, password reset, and cross-account booking access before considering deployment.

## Boundaries
Do not expose test fixture identity or `mdIssueGuardianTestSession_`, `mdGuardianActivateInternal_`, or the test invitation functions publicly. Never deploy to main or production without explicit approval. Existing local 16-file Apps Script build changes still need separate GitHub synchronization.
