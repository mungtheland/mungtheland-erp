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
