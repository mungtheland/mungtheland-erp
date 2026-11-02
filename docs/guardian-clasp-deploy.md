# Guardian test-only clasp target

The repository feature branch contains:
- `.clasp.guardian-test.json`: the **separate test** Apps Script project ID and root directory.
- `guardian-test-app/appsscript.json`: V8 runtime manifest.
- `scripts/build-guardian-test.cjs`: builds seven .gs files from the reviewed source files.

Local setup (after authorizing Google with clasp):
```bash
npm install --global @google/clasp
clasp login
node scripts/build-guardian-test.cjs
cp .clasp.guardian-test.json .clasp.json
clasp status
clasp push
```
Run only from the feature branch and review `clasp status` before pushing. `clasp push` updates the separate test script, **not** the production ERP script. The test project must already have the script property `MD_GUARDIAN_TEST_SPREADSHEET_ID` set to the isolated sheet ID.

IMPORTANT:
- Do not commit `.clasprc.json`, OAuth tokens, credentials or local `.clasp.json`.
- Do not enable public web app deployment.
- Do not use `clasp push --force` until all remote test project files have been reviewed; the target might contain other files.
- This document and the builder do not establish that Google login, upload, or Apps Script execution has occurred.
