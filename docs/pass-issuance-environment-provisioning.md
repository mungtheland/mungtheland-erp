# Issuance proof environment provisioning and isolation

## Environment separation

| Environment | Permitted role | Forbidden reuse |
| --- | --- | --- |
| Existing ERP test workbook | Historical comparison only; preserve its existing issuance rows | Never use as the issuance proof target or copy its rows |
| Existing Guardian test project and Firestore collection | Existing Guardian tests only | No new source, deployment, settings, or data changes |
| New issuance proof project and workbook | Synthetic-only, separately approved proof environment | Never connect production or Guardian data |

The new resources are not created by this procedure or by the local tools. The project name and workbook title in the template are intended labels, not proof that a resource exists. The local validator checks formats, configured local deny lists, URL-to-ID consistency, and operator-declared evidence only. It does not contact Google, verify resource ownership, inspect sharing, or establish isolation. Its output always states `cloudOwnershipVerified=false`.

## Human provisioning procedure after separate approval A

1. The designated recovery owner records the approval reference and signs in as the approved resource owner.
2. Create a standalone Apps Script project named `멍더랜드 발급 실증 TEST`. Do not copy the Guardian project or use its clasp configuration.
3. Create a new spreadsheet named `멍더랜드 발급 실증 전용 TEST`. Do not copy the existing ERP workbook, its rows, formulas, or tabs.
4. Record the project ID, spreadsheet ID, canonical editor URLs, owner, creation time, and approval reference in the ignored local environment override. Never place tokens or credentials there.
5. Independently read project and spreadsheet metadata. Confirm exact IDs, names, owner, resource types, and that neither identifier matches a production, Guardian, or existing ERP target. The local deny list is only a cross-check; a human must review the cloud metadata.
6. Confirm the workbook contains only approved synthetic test structures and no real customer, pet, payment, or legacy issuance records. Keep original ERP and Guardian resources unchanged.
7. Keep the Web App disabled, no public access, and no GitHub deployment binding. Do not run `clasp push`, `clasp pull`, or `clasp deploy` during provisioning.
8. Review the script and workbook ACLs. Limit editors and execution to the designated owner unless a separately approved test runner is required. Record each additional principal and its reason.
9. Review OAuth scopes. The current spreadsheet service contract uses the Sheets scope; that OAuth scope is not per-file. Restrict the account's effective data reach through workbook sharing and a dedicated account, and do not add Drive, external request, Firebase, or broad administrative scopes without separate review.
10. Capture a read-only pre-initialization snapshot: workbook metadata, tab titles and dimensions, any existing data-row counts, and a digest of the approved synthetic fixture. Exclude row contents and personal data from logs.
11. Run the local environment validator. A local `PASS` means only that the declarations and formats are internally consistent; it is not proof of ownership, ACLs, or cloud isolation. Keep provisioning blocked until the required human review and separate approval are recorded.

## Identifier contract

`environment.local.json` is ignored by Git. It may contain the real project and workbook identifiers only after approval A. The script ID must match the ID in the canonical URL `https://script.google.com/home/projects/{scriptId}/edit`. The workbook ID must match `https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit`. URLs must use HTTPS, the exact Google host and path, and contain no credentials, fragments, or query parameters. IDs must be distinct and must not match known production, Guardian, or existing ERP targets.

The configuration records project name, workbook title, owner, isolation attestation and evidence reference, permission review, recovery owner, audit policy, and separate approval references A through F. The validator never prints these values. URL and ID consistency is a local syntactic check; actual resource ownership and identity must be independently confirmed from read-only cloud metadata after resource creation approval.

## Approval boundaries

| Approval | Scope | Does not authorize |
| --- | --- | --- |
| A | Create the dedicated proof project and synthetic-only workbook | V2 tab creation, source deployment, or data writes |
| B | Initialize the V2 tab in the verified dedicated workbook | Bundle deployment or fixture row insertion |
| C | Deploy the reviewed bundle to the dedicated project | Script execution or spreadsheet writes |
| D | Insert the bounded synthetic request rows | Fault injection, cleanup, or operational issuance |
| E | Run bounded failure injection and recovery rehearsal | Deleting artifacts or changing real ERP data |
| F | Consider production integration and real issuance | Any action outside its separately stated exact scope |

Each reference is recorded separately. A reference for one letter cannot satisfy another letter. In Stage 67 all references remain blank and no action is approved by this document.

### Stage 69 approval A record

- Reference `ERP-ISSUANCE-A-20261127-01`
- Decision recorded on 2026-11-27 KST against baseline `d6e1ffaf00d9d49f4fbfcdb8c833f293653d35bb`
- Scope covers the existing standalone issuance-proof Apps Script and the existing dedicated issuance-proof workbook, matched to the two exact identifiers supplied with the decision and retained in the ignored local environment configuration. The previously designated review and recovery owner remains responsible for these two resources.

> 멍더랜드 승인 A를 확정합니다. 기존 전용 테스트 Apps Script와 Google Sheets 사용을 승인합니다. 승인 B와 실제 원장 생성은 아직 승인하지 않습니다.

This decision authorizes use of the existing resource pair. New resource creation, V2 initialization, data writes, deployment, and live issuance remain outside its scope. Approval B remains pending. Record the same reference in `approvalReferences.A` and `approvalReference` to satisfy the validator's approval A reference check. Isolation and permission reviews are independent requirements.

## V2 initialization dry-run

`scripts/plan-pass-issuance-v2-initialization.cjs` reads only the local environment file, repository schema, and explicitly synthetic snapshot fixture. It creates no tab and has no network or Apps Script storage port. A plan returns the exact ordered headers from `PassIssuanceLedger.js`, target tab `_이용권발급원장V2`, one header row, 16 columns, a pre-initialization snapshot checklist, duplicate-tab detection, readback checks, and stop/recovery steps. The target identifier is redacted in output.

Before a separately approved B action, a human must verify the target workbook metadata and owner again, verify the V2 tab is absent from a fresh read-only metadata snapshot, and verify no legacy tab or source records were copied into the dedicated workbook. If the V2 tab already exists, do not reinitialize, rename, clear, or overwrite it. A partial or ambiguous creation is preserved and reviewed; no automatic retry or deletion is allowed.

The initialization plan does not create or approve the separate pass-balance tab required by a future issuance runtime. Any additional synthetic pass table has its own schema and approval review. The legacy 13-column history remains in its original ERP workbook and is never copied or migrated.

## Minimal permission and runtime boundary

- Dedicated script and workbook owner should be the same approved test identity.
- Script editors and workbook editors are limited to the designated owner by default.
- Runtime identity must equal the reviewed test owner; no public web app is enabled.
- The bundle must have no public `doGet`/`doPost`, no external fetch, and no stored credentials.
- The repository's manual deployment workflow is an explicit review boundary. Stage 67 does not invoke it or authorize it.
- OAuth tokens remain in Google-managed local auth storage, never the repository or environment template.
- Runtime uses only the dedicated synthetic workbook after approvals A, B, and C. Fixture writes require D; failure injection requires E.

## Stop, snapshot, and recovery rules

Before an approved action, record the target resource references, reviewer, recovery owner, fixture request allowlist, expected row/column counts, and before snapshot. Afterward, compare the V2 tab title, exact 16 headers, one header row, zero or explicitly approved synthetic rows, pass/ledger linkage, and audit evidence.

On an ID, owner, URL, ACL, schema, or row-count mismatch, stop immediately. Do not switch to the existing ERP or Guardian resources. On timeout or ambiguous result, perform read-only verification before any separately approved continuation. Preserve partial resources and evidence. There is no automatic cleanup or rollback; any removal requires a separate explicit approval and a named operator.

## Stage 69 evidence and gate diagnostics

Run `node scripts/check-pass-issuance-environment.cjs pass-issuance-test-app/environment.local.json`. The outer checklist covers release readiness and the nested `registrationBlockers` lists the unresolved registration checks with stable reason codes. A local ID comparison against an empty production deny list establishes only that the configured list contains no collision. Record coverage separately.

| Local fields | Evidence required |
| --- | --- |
| `evidence.dedicatedAppsScriptProjectConfirmed`, `evidence.dedicatedWorkbookConfirmed`, `isolationEvidence.ownerAccountMatches` | Read-only project and workbook metadata matched to the configured IDs, resource types, and designated owner. |
| `isolationEvidence.reviewStatus` and its dedicated, synthetic-only, and no-shared-source booleans, plus `evidence.ownershipAndIsolationApproved` | An operator's documented review of resource separation, permitted execution identities, source-data boundaries, and the before snapshot. Record `OPERATOR_ATTESTED` only after that review. Each checklist keeps its own evidence reference. |
| `permissionReview`, `permissionScopeProfile`, `evidence.permissionScopeReviewed` | A reviewed runtime identity equal to the designated owner, one editor per resource equal to that owner, exactly the Sheets OAuth scope, disabled web-app access and GitHub deployment, and Google-managed token storage. The validator requires `REVIEWED`, `DEDICATED_SCRIPT_SINGLE_TEST_WORKBOOK`, `DISABLED`, and `GOOGLE_MANAGED_ONLY` in the corresponding fields. The current project's requested scopes and the intended runtime's effective authorization are separate observations. |
| `approvalReferences.A`, `approvalReference`, `approvalReferences.B`, `recoveryOwner`, `auditPolicyVersion` | The creation approval reference A must equal `approvalReference`. Record the separate initialization reference B, named recovery operator, and audit policy version. |

The referenced evidence and approval identifiers used by registration have 3–128 characters. Start with an ASCII letter or digit and use only ASCII letters, digits, periods, underscores, colons, or hyphens. Keep raw ACLs and private comparison material outside Git. A diagnostic can appear in both checklists because the release gate and registration validator check separate declarations. Keep both until they can use the same reviewed evidence without weakening either gate.

### Private deployment target comparison

The manual GitHub workflow injects the actual Script ID from a secret and builds its own clasp configuration. GitHub's secret API exposes metadata, so repository inspection can verify the source of the target but cannot verify its value. An authorized maintainer can compare the actual currently configured value from its controlled source against the dedicated project ID in a private session. Record only the outcome (different, same, or unverified), workflow and revision, evidence date, and reviewer reference. If the private source cannot be tied to the currently configured secret, leave the comparison unverified. Do not run the deployment workflow for this check or publish either the secret value or a derivative.

### Dedicated-resource recovery

For Stage 69, the user designated a business co-owner to review the dedicated issuance-proof environment and coordinate its recovery. The assignee is recorded in the ignored local `recoveryOwner` field. The assignment covers reviewing the baseline, preserving incident evidence, identifying the exact dedicated target and proposed recovery action, and coordinating independent readback. Approvals A and B remain pending and require separate decisions.

1. Record the two exact IDs from the ignored local configuration and confirm the canonical URLs and owner. The only recovery targets are the dedicated issuance-proof workbook and standalone script. Exclude existing ERP and Guardian workbooks, scripts, deployments, and data from recovery, including as sources for restoration.
2. Before an approved operation, retain a private, read-only baseline with capture time, reviewer, workbook tab inventory and dimensions, nonempty row counts, ordered header digest where applicable, and the dedicated script revision, manifest, deployment summary and visible trigger count. Capture counts and checksums in the incident record without customer data or credentials.
3. On timeout, partial creation, target mismatch, or unexpected data, stop. Preserve both resources and compare current metadata and counts with the baseline. A missing or mismatched baseline requires review before any action. Record the attempted operation and the readback result.
4. The named recovery operator determines the exact dedicated target and remediation from the evidence. Require separate explicit approval for any rollback, deletion, reinitialization, or deployment. Keep the safe switches in place during investigation and record an independent readback and closure reference after an approved remediation.

### Stage 69 operating workbook access finding

Review reference `ERP-ISSUANCE-ISOLATION-20261127-01`. The workbook configured by `MD_SPREADSHEET_ID` in `src/Code.js` differs from the dedicated workbook. A targeted Drive metadata read using the designated test Google account returned an owner role for that same account on the configured ERP workbook. The review did not read sheet cells or test writes. This confirms that the designated account has ERP workbook access. The current project's effective OAuth grants and actual execution identity are still unverified.

Record this finding in the ignored local config under `observedIsolationEvidence`. This field records observations and has no effect on the gate. Keep the approved isolation and permission declarations pending. For the planned Sheets-enabled runtime, review a test execution identity whose effective access excludes ERP and Guardian resources. Under the current contract the runtime identity must match the reviewed dedicated resource owner, so review that ownership requirement alongside the execution identity. Any account, ownership, or sharing change needs separate approval.

The manual deployment workflow still resolves its target from the Actions secret. Provide an independent private comparison tied to the current secret configuration before attesting that the target differs from the dedicated project. Repository inspection found the secret reference; file metadata and historical workflow results cannot establish the current input value.

### Stage 69 application-level target restriction

The existing account owns both workbooks, so account-level isolation is absent. The local issuance-proof bundle now limits application-level access to the dedicated Apps Script and workbook pair. It hashes the supplied workbook ID and the current script ID and compares each to its fixed SHA-256 fingerprint before opening anything. A missing, malformed, or different ID stops the call. The only workbook opener is `SpreadsheetApp.openById`. The reader checks the returned workbook ID before reading tab names and returns names only.

The builder excludes the shared ledger's ERP workbook opener, range reads, write adapter, and live persistence entry from the test bundle. The bundle's replacement persistence entry always returns disabled. The local planner and preflight still use fixture snapshots. The builder rejects service references in the included shared modules and allows only the existing minimal manifest keys. No active-sheet, URL opener, Drive, external fetch, properties-based routing, library, or advanced-service path is part of the reviewed output. The source scan is a regression check, and the bundle still requires review if its code changes.

The local checker validates both configured IDs against the same fingerprints and reports application restriction, account isolation and effective OAuth separately. The restriction applies to the generated source, which was tested with mocks and has not been deployed. It does not change the account's ERP access, establish effective OAuth scope, verify the manual deployment target, or satisfy the independent isolation, permission and approval B gates. The ledger creation, writes, deployment and issuance remain blocked.

### Stage 69 deployment and OAuth read-only review

The checked-in workflow is `.github/workflows/deploy.yml`, shown in **Actions → Deploy Apps Script (manual)**. It uses `workflow_dispatch` and has no job environment binding. It maps `APPS_SCRIPT_ID` to the temporary clasp project's Script ID and uses `CLASP_CREDENTIALS` for the client. The workflow publishes from `src`; the local test bundle is built separately. The current private target remains unverified.

1. In GitHub, open **repository → Settings → Secrets and variables → Actions → Secrets** and inspect the repository-level entry names and available update metadata. If an organization manages the secret, check **organization → Settings → Secrets and variables → Actions → Secrets** and repository access eligibility. These screens and the REST API expose metadata only. Avoid the edit form and workflow run controls. [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) · [Secret API](https://docs.github.com/en/rest/actions/secrets)
2. To verify the actual target, an authorized maintainer should privately locate the previously recorded source used to set the current secret and tie it to the current secret update using an approved change record. In the dedicated Apps Script project, use **Project Settings → IDs → Script ID** as the test-side comparison. Record only same, different, or unverified, with the source reference, reviewer, workflow revision and date. A project ID from an editor or a historical workflow run alone cannot establish the current secret value. If there is no matching private record, leave the target unverified.
3. For requested scopes, open the dedicated project and use **Overview → Project OAuth Scopes**. If the manifest is already visible, use **Editor → Files → appsscript.json** and check `oauthScopes`; otherwise use the previously authorized read-only Apps Script content API. The project may infer scopes when the manifest field is absent. This check used the API and left the editor's manifest visibility setting unchanged. [Apps Script scopes](https://developers.google.com/apps-script/concepts/scopes)
4. Use **Deploy → Manage deployments** to inspect existing entries, and **Triggers** to review entries visible to the signed-in account. Record any displayed deployment execution mode and trigger creator. Each relevant account must inspect its own trigger view. In **Executions**, review only existing records, including execution type and any identity shown. A zero-result screen gives no observed execution identity. [Execution identities](https://developers.google.com/apps-script/guides/services/authorization) · [Installable triggers](https://developers.google.com/apps-script/guides/triggers/installable)
5. To review an existing grant, the designated user can open **Google Account → Third-party connections → Access to your Google Account → matching app → See details**. Use only an existing connection that can be uniquely tied to the dedicated project. Record its displayed access categories and whether exact scopes are available. If the connection is missing, ambiguous, or shows only coarse categories, keep the exact effective grant unverified. Do not run the script, grant consent, reconnect or revoke access for this review. [Google Account connections](https://support.google.com/accounts/answer/13533235)

The latest read-only content and deployment responses showed no explicit OAuth scope list, web app, execution API configuration, or advanced dependencies. The remote HEAD file list did not contain the local target restriction module. The deployment list showed one HEAD entry with no entry points. The execution-list API returned HTTP 403 with existing authorization; the project's Executions screen showed zero visible entries for the last seven days. These observations leave the effective OAuth grant and actual execution identity unverified. The designated account's ERP workbook ownership remains documented separately.
