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
2. Create a standalone Apps Script project named `Mungtheland ERP Pass Issuance Proof - Isolated`. Do not copy the Guardian project or use its clasp configuration.
3. Create a new spreadsheet named `Mungtheland ERP Pass Issuance Proof - Synthetic Only`. Do not copy the existing ERP workbook, its rows, formulas, or tabs.
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
