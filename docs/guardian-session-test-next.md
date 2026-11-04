# Guardian session test deployment and verification

Target: isolated test Apps Script project `1-mxEXFQWdlXDK2VnLqgKEOYxFpfeoOVGrKXxZQg9O-GySqrM5g74iYyq`.
Never touch production script, spreadsheet, or main.

1. Check out `feature/guardian-request-prototype` and pull the latest commits.
2. Run `node scripts/build-guardian-test.cjs`. It must report **8** test files.
3. Authenticate clasp to the Google account that can edit the isolated test project, if needed.
4. Point clasp at `.clasp.guardian-test.json` using a local `.clasp.json` (do not commit tokens).
5. Review `clasp status`, then push only to the isolated test project. Do not deploy a public web app.
6. Execute `runGuardianSessionTest` from the isolated Apps Script editor or an authorized Apps Script execution tool.
7. Report the execution log and whether `ok: true` appears. Never print the session bearer token.

Expected test result includes `checks` for fixture, session issue, session resolve, invalid token rejection, and booking ownership.
If Google auth or execution is blocked, stop and request only the missing authorization.
The prior workflow test leaves synthetic request rows; do not rerun it blindly.
