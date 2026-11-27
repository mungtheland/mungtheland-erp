# Pass issuance test environment: runtime and recovery plan

## Environment boundary

| Environment | Script target | Workbook target | Stage 66 behavior |
| --- | --- | --- | --- |
| Existing Guardian test | Existing Guardian-only Apps Script bundle | Existing integration workbook | Read its local configuration only; never reuse it for issuance |
| Issuance proof test | Not created; ID unset | Not created; ID unset | Local fixtures and static checks only |
| Production ERP | Existing operational deployment | No operational workbook is configured here | Never inspect, invoke, deploy, or write |
| Existing integration workbook | Existing 13-column issuance history and other test data | Preserved as-is | No cell, tab, formula, or permission changes |

The future issuance proof environment requires a separately approved script and a separately created synthetic-only workbook. Neither target ID is present in the template. The current Guardian script and its workbook are explicitly rejected by the safety gate. Do not copy the Guardian clasp file or use the integration workbook as the issuance proof target.

`pass-issuance-test-app/environment.template.json` is a non-secret template. A future local override may be stored as `pass-issuance-test-app/environment.local.json`, which must remain untracked. Keep `dryRunOnly=true`, `enableWrites=false`, and `allowDeployment=false` until separate approvals. The static checker never performs a deployment, even if a local override is supplied.

Run the local checks from the repository root on `feature/staff-attendance-desktop`:

```text
node scripts/check-pass-issuance-environment.cjs
node scripts/validate-pass-issuance-v2-snapshot.cjs pass-issuance-test-app/fixtures/empty-synthetic-snapshot.json
node scripts/build-pass-issuance-test.cjs
```

The safety checker reports `BLOCKED` for the current template because target IDs, isolation evidence, permission review, recovery owner, and audit approval are missing. A manual Apps Script deployment workflow exists in the repository; this is an approval boundary, not an automatic deployment. The checker reports it as `NEEDS_APPROVAL`. Its deployment result is hard-coded `BLOCKED` in Stage 66.

## V2 schema and fixture policy

`_이용권발급이력` remains the immutable 13-column legacy tab. `_이용권발급원장V2` is the distinct 16-column V2 contract. The local snapshot validator obtains exact header contracts from the repository modules and rejects reordered, missing, duplicate, extra, or mistyped data. A V2 tab name collision, missing V2 tab, legacy 13-column data presented as V2, or a live-data marker is blocked. No adapter in this stage creates or repairs a tab.

Fixtures in `pass-issuance-test-app/fixtures/` contain only synthetic values. `APPROVED` on a synthetic fixture means approved by that fixture's local test contract only; it does not approve a real catalog item or prove payment. The test request's stable ID and receipt references are not production identifiers. No customer or animal identity is included.

## Failure and concurrency rehearsal cases

| Case | Preconditions and injected point | Expected result | Forbidden automatic action | Evidence and recovery |
| --- | --- | --- | --- | --- |
| Normal issue | Empty isolated V2/pass snapshot; synthetic approved recurring product and verified fixture evidence | Synthetic `COMMITTED` in mock only | No live call or real row | Compare both mock rows; retain fixture run output |
| Same request retry | Same durable request ID and same evidence; after commit or simulated response loss | Return exact existing result | No second pass ID or append | Exact lookup by request and pass IDs; manual review if pair differs |
| Duplicate payment | Existing payment reference under another request ID | `BLOCKED` or `NEEDS_REVIEW` | No new issuance | Compare exact references and audit the conflict |
| Concurrent same request | Two or more callers share one request ID | Lock serializes mock callers; one logical result | No duplicate append | Count ledger/pass rows; runtime claim remains unproven until Apps Script test |
| Lock unavailable | Lock acquisition returns false | `BLOCKED` before snapshot mutation | No fallback lock and no write | Record fixed lock failure code; rerun only after operator review |
| Pending marker interruption | Failure before/after PENDING append | No false committed result; uncertain state is `NEEDS_REVIEW` | No new request ID or reissue | Read both stores independently; operator reconciliation |
| Pass row interruption | Failure immediately before/after pass append | `NEEDS_REVIEW` if the outcome is uncertain | No delete, balance reset, or duplicate append | Exact pass/request lookup and compare; retain partial rows |
| Commit marker interruption | Pass exists but COMMITTED update fails or response is lost | `NEEDS_REVIEW` until exact readback proves a committed pair | No blind retry | Re-read exact rows; manual audited decision if unresolved |
| Ledger only | PENDING/ledger record exists, pass record absent | `PARTIAL` or `NEEDS_REVIEW` | Do not mark committed or create pass automatically | Compare snapshot and assign recovery owner |
| Pass only | Pass record exists, ledger absent | `NEEDS_REVIEW` | Do not recreate ledger or issue again automatically | Exact pass lookup; manual audit record required |
| Readback timeout | Flush returned but post-write readback timed out | `NEEDS_REVIEW` | No retry with a new request ID | Independent read-only reconciliation before any decision |
| Legacy collision | Exact legacy pass/request ID collides or legacy linkage is incomplete | `NEEDS_REVIEW`; payment coverage gap blocks new issuance | No fabricated legacy payment reference | Preserve 13-column row; manual review and documented evidence |
| Catalog mismatch | Draft, unknown, inactive, TEST_ONLY, or wrong use count | `BLOCKED`/`NEEDS_REVIEW` | Do not infer type from name or price | Correct catalog approval separately; do not change fixture to mimic production |
| Pet/guardian mismatch | Stable IDs do not have exact authoritative link evidence | `NEEDS_REVIEW` | No name-based matching | Resolve relationship evidence outside issuance flow |
| Manual recovery | Any partial or ambiguous state | Audited manual approval required | No auto-delete, restore, reissue, or balance reset | Record reason, reviewer, exact before/after evidence, and approval |

Every fixture declares `autoCleanup=false`. There is no cleanup command. Synthetic artifacts may be removed only by a separately approved operator action after preserving evidence; this stage does not provide a deletion path.

## Future Apps Script runtime checklist

All items below are not run in Stage 66. They require a dedicated project and workbook, explicit deployment and execution approval, named recovery owner, reviewed least-privilege access, and a bounded synthetic request allowlist.

1. Verify exact target IDs and workbook title against separately approved test-only evidence without printing credentials.
2. Confirm the 13-column legacy tab is unchanged and the V2 tab has exactly the ordered 16-column header before enabling any writer.
3. Run two identical requests behind `ScriptLock`; then run distinct requests sharing one payment reference. Verify one issue maximum and the duplicate conflict.
4. Hold the lock in a controlled test and verify a second invocation stops before reading or writing.
5. Test each failure point around PENDING, pass append, `SpreadsheetApp.flush()`, readback, and COMMITTED update. Capture fixed status codes and exact row counts.
6. Simulate response loss after COMMITTED and prove a retry returns the same pass without appending.
7. Terminate an invocation after each partial-write point. Reconcile read-only; never delete or auto-reissue.
8. Confirm Apps Script execution limits and lock wait behavior. A script lock does not create a multi-sheet transaction.
9. Reopen the workbook in a fresh execution and verify persisted values, status, timestamp serialization, and row linkage.
10. Preserve a pre-test snapshot, exact request list, operator and recovery owner, execution time, audit references, and post-test snapshot. Do not run automatic cleanup.

Runtime acceptance requires every expected synthetic request to have one coherent V2 issuance row and one matching pass row, no duplicate request/payment/pass keys, no non-allowlisted rows changed, and all injected partial failures to stop in reviewable states. Any ambiguous outcome blocks further execution. Restore or delete actions require separate approval and a named operator; default recovery is preserve-and-review.

## Existing ERP impact and remaining gates

This stage changes no `mdRegisterPass` behavior, Guardian project, 13-column legacy data, existing attendance path, or issuance adapter activation flag. It adds local-only validation and documentation. Live proof remains blocked until there is a separately approved isolated script/workbook, authoritative product catalog, payment reference source, durable request ID intake, legacy duplicate-risk disposition, least-privilege permission review, recovery owner, and separate approval to create the V2 tab and execute the test.
