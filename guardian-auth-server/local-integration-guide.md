# Local-only Firebase + Sheets integration (not yet verified)

## Current status
This code has NOT been run against real Firebase or Sheets. It is intentionally bound to 127.0.0.1 and is not production-ready. Do not deploy to Cloud Run, Firebase Functions, Hosting rewrites, or expose port 8787.

## Local preparation
```cmd
cd C:\Users\likea\mungtheland-guardian-dev
git pull origin feature/guardian-request-prototype
cd guardian-auth-server
npm install
npm test
```

The `npm test` command runs mock-based tests only. Do not send Firebase service account JSON, private keys, or user passwords in chat or commit them to GitHub.

## Before starting local-server.js
1. A trusted Google Cloud identity must have Firebase Auth verification permissions for `mungtheland-guardian-test` and **read-only access to only** the isolated test spreadsheet `1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY`.
2. Configure Application Default Credentials on the PC using a supported Google Cloud workflow. This may require additional Cloud SDK installation, project permissions, or a billing-enabled Google Cloud environment. Stop if asked to enable billing unexpectedly.
3. `GOOGLE_CLOUD_PROJECT` must be `mungtheland-guardian-test`.
4. `MD_TEST_GUARDIAN_UID` and `MD_TEST_GUARDIAN_EMAIL` are temporary **test-only** explicit allowlist values. These do NOT implement the approved staff invitation process and MUST be replaced by a durable staff-authorized mapping store before any remote deployment.
5. The Firebase user must have verified email. The test spreadsheet must contain matching `CUS-TEST-001`, `DOG-TEST-001`, and `RSV-TEST-001` records.
6. Current browser page is on HTTPS Hosting and cannot be assumed to access local HTTP loopback from every browser; no frontend API connection has been made.

## Known limitations / safety gates
- There is no staff identity verification, persistent account linking, audit log, rate limit, or end-to-end test.
- The local server currently has a fixed test-origin CORS header; this is NOT authorization. Requests still require Firebase bearer tokens and a matching server-side UID/email allowlist.
- Do not place an Admin SDK credential in the web page or Firebase Hosting `public` directory.
- The Sheets adapter uses the test-only workbook and reads booking/dog IDs; visitDate and display dogName are placeholders pending schema verification.
- The test login page remains unchanged. The real integration is not yet verified.

## Suggested next checkpoint
First run the existing mock tests after `npm install`. Then configure Google Cloud ADC and test spreadsheet read permissions with the user supervising. Do not attempt real token tests until both credentials and mapping approval are verified.
