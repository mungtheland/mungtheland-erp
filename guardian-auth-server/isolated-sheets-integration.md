# Isolated Sheets + Firebase API integration checkpoint

Status: repository adapter and tests only. **No public API or deployed server**. Do not send Firebase ID tokens to Apps Script or expose the synthetic test functions.

## Current code
- `isolated-sheets-bookings.js` reads only test spreadsheet `1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY` through a server-injected Sheets API client.
- It derives booking ownership via booking dog ID -> dog customer ID, matching existing isolated Apps Script prototype positions.
- The `dogName` field currently contains the dog ID, and `visitDate` is empty; actual column headers need inspection before displaying them to users.
- `booking-http.js` and `authenticate.js` are server-side components. A trusted persistent UID/customer mapping is still missing; do not fabricate it from an arbitrary browser-provided UID.

## Local regression
```cmd
cd C:\Users\likea\mungtheland-guardian-dev
git pull origin feature/guardian-request-prototype
node --test guardian-auth-server\*.test.js
```
Expected total after adding the isolated Sheets tests: 30 tests. This does not contact Firebase or Google Sheets.

## Before real integration
1. Establish a **trusted staff-authorized** test UID -> CUS-TEST-001 mapping with durable atomic uniqueness, not a hard-coded mapping of whoever logs in.
2. Select a trusted backend hosting environment for Firebase Admin SDK + Google Sheets API; Firebase Hosting alone serves static files.
3. Provision credentials using workload identity or a secret manager; grant Sheets **read-only** access only to the isolated test spreadsheet. Never commit credentials or share the production spreadsheet.
4. Verify actual test spreadsheet header layout and update display fields accordingly.
5. Implement authenticated API bootstrap with explicit CORS allowlist for the test Hosting origin and rate limits. No wildcard CORS.
6. Run real end-to-end tests with two separate verified test users, revocation, and cross-customer booking access before public deployment.

The current Firebase Hosting login page remains login-only; no ERP access is enabled.
