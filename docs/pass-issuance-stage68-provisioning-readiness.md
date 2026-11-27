# Stage 68 issuance proof environment readiness

## Scope and current decision

This is a local preparation checklist for the synthetic issuance proof environment. It does not create Google Cloud resources, inspect cloud metadata, initialize a sheet, authenticate, or deploy. The proposed resource labels are `멍더랜드 발급 실증 TEST` for the standalone Apps Script project and `멍더랜드 발급 실증 전용 TEST` for its dedicated workbook. Labels are not evidence that either resource exists.

The existing ERP integration workbook, the Guardian test project, and all production resources are deny-listed targets. The existing ERP workbook may be used only as a local known-target comparison value. It must not be queried or copied for provisioning. Guardian source, settings, Firestore data, and deployments remain untouched.

Current readiness is **BLOCKED**: dedicated IDs and URLs, ownership metadata, sharing review, isolation evidence, recovery owner, and approval references are absent. The local template remains `dryRunOnly=true`, `enableWrites=false`, and `allowDeployment=false`. No cloud ownership or isolation claim is made.

## Human provisioning sequence after approval A

1. Use the approved owner account to create a new standalone script project with the proposed project label. Do not clone Guardian or bind it to the existing ERP clasp target.
2. Create a new blank synthetic-only workbook with the proposed workbook label. Do not copy sheets, rows, formulas, or data from the ERP integration workbook.
3. Record the resulting script ID, spreadsheet ID, canonical editor URLs, owner, creation time, and approval reference in the ignored local override. Never place credentials or tokens there.
4. Independently inspect read-only metadata for both resources. Confirm resource types, exact IDs and labels, owner identity, and that neither ID equals a production, Guardian, or ERP target. A local ID-format check is not cloud verification.
5. Confirm the workbook has no source-system records and contains only the approved empty synthetic structure. Capture a before snapshot of metadata, tab names, dimensions, and non-sensitive row-count fingerprints.
6. Review sharing and execution identities. Default to one designated owner as the only editor and runner. No public web app, broad audience, or GitHub deployment binding is allowed.
7. Review OAuth scopes and effective reach. Keep the minimum reviewed spreadsheet scope and constrain access through a dedicated identity and workbook sharing. Do not add Drive, external-request, Firebase, or administrative scopes without separate review.
8. Compare IDs and URLs to local deny lists and verify exact canonical URL-to-ID correspondence. If any target, owner, permission, title, or isolation evidence is uncertain, stop and preserve the resources for review.

## V2 initialization preflight

The local planner uses the ordered 16-field contract from `PassIssuanceLedger.js` and the synthetic empty snapshot. It checks that the V2 tab is absent and that the legacy 13-column tab is not present in the dedicated workbook. It plans one header row and 16 columns, then requires a fresh independent readback after separately approved creation.

Before any initialization action, record the reviewer, recovery owner, approval reference B, exact workbook target, expected header digest, before snapshot, and stop conditions. If the V2 tab already exists or the result of a create action is ambiguous, do not retry, rename, clear, or delete; perform read-only review and retain evidence. There is no automatic cleanup or rollback.

The existing legacy tab and its three historical rows remain in the ERP integration workbook. They are not copied, transformed, or migrated. A pass-balance tab is outside the V2 initialization scope and requires its own schema and review.

## Independent approval gates

| Gate | Separate scope | Required evidence before proceeding | Explicitly excluded |
| --- | --- | --- | --- |
| A | Create the dedicated script project and blank synthetic workbook | Owner, IDs, canonical URLs, separate-resource proof, sharing review, and recovery owner | V2 tab, bundle deployment, data writes |
| B | Create the V2 tab with exact 16 headers | Fresh workbook metadata, absent-tab check, before snapshot, exact target and header contract | Deployment, fixture rows, operational issuance |
| C | Deploy the reviewed test bundle to the dedicated script | Source diff, target identity, no public entry point, reviewed scopes and deployment identity | Script execution, sheet writes |
| D | Write bounded synthetic issuance fixtures | Exact request allowlist, maximum rows, before snapshot, audit and recovery owner | Real payment, customer or pass data |
| E | Run bounded fault injection and recovery rehearsal | Named scenarios, request allowlist, preservation policy, operator and evidence plan | Cleanup, deletion, production data |
| F | Consider operational issuance integration | Approved catalog, authoritative payment reference, durable idempotency, reconciliation and recovery design | Any unspecified live operation |

Approval for one gate does not imply approval for another. In this stage all gates remain unapproved; the template and tooling must not infer approval from an earlier stage.

## Minimum permission review

- Dedicated project and workbook owned by the same designated test identity.
- One reviewed editor and runtime identity by default; additions require a recorded reason and approval.
- No public web app; deployment remains disabled until gate C.
- No GitHub deployment binding for the new project.
- Spreadsheet scope only if confirmed necessary by the bundle; scope is not per-file, so use a dedicated identity and workbook ACL to constrain effective reach.
- Tokens stay in Google-managed local auth storage and never enter the repository or report.
- Recovery is manual and evidence-backed; no automatic deletion, rollback, or reissue.

## Local validation and 69-stage entry conditions

Run `node --test tests/*.test.js`, `npm.cmd run check`, `npm.cmd run test:ci`, `node scripts/build-pass-issuance-test.cjs`, `node scripts/check-pass-issuance-environment.cjs`, and `node scripts/plan-pass-issuance-v2-initialization.cjs`. With the current blank template, the final two gates should return BLOCKED. A local synthetic `PLAN_ONLY` result is not evidence of actual resource ownership, cloud isolation, or runtime behavior.

Stage 69 may proceed with local registration verification only after A has separately been approved and a human has created the dedicated resources. Any read-only cloud identity check requires an explicitly approved target and existing authorized read access. V2 creation still requires B; deployment C; synthetic writes D; fault injection E; operational integration F. No current approval authorizes those actions.
