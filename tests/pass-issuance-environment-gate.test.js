'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { evaluateEnvironment, inspect, expectedFiles } = require('../scripts/check-pass-issuance-environment.cjs');
const { validateSnapshot, validateFixtureFile } = require('../scripts/validate-pass-issuance-v2-snapshot.cjs');
const schema = require('../scripts/pass-issuance-test-schema.cjs');
const vm = require('node:vm');

function baseConfig() {
  return {
    environmentName: 'pass-issuance-isolated-test', spreadsheetId: 'SYNTHETIC_SHEET_ID_000000000001',
    scriptId: 'SYNTHETIC_SCRIPT_ID_000000000001', ledgerTabName: '_이용권발급원장V2',
    legacyTabName: '_이용권발급이력', passTabName: '이용권관리', dryRunOnly: true,
    enableWrites: false, allowDeployment: false, allowedTestRequestPrefix: 'SYNTH-ONLY-ISSUE-',
    testDataIsolationMode: 'DEDICATED_WORKBOOK_REQUIRED', recoveryOwner: 'UNASSIGNED_TEST_OPERATOR',
    auditPolicyVersion: 'DRAFT-1', evidence: {
      dedicatedAppsScriptProjectConfirmed: true, dedicatedWorkbookConfirmed: true,
      ownershipAndIsolationApproved: true, permissionScopeReviewed: true, evidenceReference: 'SYNTHETIC-APPROVAL-REF'
    }, permissionScopeProfile: 'DEDICATED_SCRIPT_SINGLE_TEST_WORKBOOK'
  };
}

function readyEvidence() {
  return {
    branch: 'feature/staff-attendance-desktop', cwdMatches: true,
    schemaResult: { status: 'PASS', v2HeaderCount: 16, legacyHeaderCount: 13 },
    registrationResult: { status: 'PASS', cloudOwnershipVerified: false },
    syntheticFixtureRequestPrefix: true,
    buildFiles: expectedFiles, manifestValid: true, publicEndpoint: false, outboundEndpoint: false,
    secretMaterial: false, automaticDeployment: false, manualDeployment: false,
    legacyChanged: false, issuanceEntryChanged: false
  };
}

function snapshot(overrides = {}) {
  return {
    mode: 'SYNTHETIC_FIXTURE_ONLY', v2SheetName: '_이용권발급원장V2', legacySheetName: '_이용권발급이력',
    v2Headers: schema.v2Headers(), legacyHeaders: schema.legacyHeaders(), v2Rows: [], legacyRows: [], passRows: [],
    ...overrides
  };
}

const result = validateSnapshot(snapshot());
assert.equal(result.status, 'PASS');
assert.equal(result.v2HeaderCount, 16);
assert.equal(result.legacyHeaderCount, 13);
assert.equal(result.remoteCalls, 0);
assert.equal(result.writesPerformed, 0);
const emptySnapshotFile = path.join(__dirname, '..', 'pass-issuance-test-app', 'fixtures', 'empty-synthetic-snapshot.json');
assert.equal(validateFixtureFile(emptySnapshotFile).status, 'PASS');
assert.equal(validateFixtureFile(__filename).reason, 'FIXTURE_PATH_OUTSIDE_ALLOWLIST');
assert.equal(validateSnapshot(snapshot({ v2Headers: [...schema.v2Headers()].reverse() })).reason, 'V2_HEADER_CONTRACT_INVALID');
assert.equal(validateSnapshot(snapshot({ v2Headers: schema.v2Headers().slice(0, 15) })).reason, 'V2_HEADER_CONTRACT_INVALID');
assert.equal(validateSnapshot(snapshot({ v2Headers: [...schema.v2Headers().slice(0, 15), schema.v2Headers()[0]] })).reason, 'V2_HEADER_CONTRACT_INVALID');
assert.equal(validateSnapshot(snapshot({ legacyHeaders: schema.legacyHeaders().slice(0, 12) })).reason, 'LEGACY_13_HEADER_CONTRACT_INVALID');
assert.equal(validateSnapshot(snapshot({ v2SheetName: '_이용권발급이력' })).reason, 'ISSUANCE_TAB_NAME_MISMATCH');
assert.equal(validateSnapshot(snapshot({ mode: 'LIVE_SHEETS' })).reason, 'SYNTHETIC_FIXTURE_REQUIRED');

const syntheticLedgerRow = {
  issuanceRequestId: 'REQ-SYNTH-66002', idempotencyKey: 'PASS-ISSUE:v4:REQ-SYNTH-66002',
  paymentReference: 'PAY-SYNTH-66002', productId: 'SYNTH-PASS-8', catalogVersion: 4,
  petId: 'PET-SYNTH-66002', guardianId: 'GUARD-SYNTH-66002', passId: 'PASS-SYNTH-66002',
  totalUses: 8, issuanceStatus: 'COMMITTED', requestedAt: '2026-11-27T00:00:00.000Z',
  committedAt: '2026-11-27T00:00:01.000Z', attemptCount: 1, lastErrorCode: '', sourceChannel: 'synthetic-test', auditReference: 'AUDIT-SYNTH-66002'
};
const syntheticPassRow = { passId: syntheticLedgerRow.passId, petId: syntheticLedgerRow.petId,
  productId: syntheticLedgerRow.productId, totalUses: 8, usedUses: 0, remainingUses: 8 };
assert.equal(validateSnapshot(snapshot({ v2Rows: [syntheticLedgerRow], passRows: [syntheticPassRow] })).status, 'PASS');
assert.equal(validateSnapshot(snapshot({ v2Rows: [{ ...syntheticLedgerRow, totalUses: '8' }] })).reason, 'V2_ROW_TYPE_INVALID');
assert.equal(validateSnapshot(snapshot({ v2Rows: [syntheticLedgerRow, { ...syntheticLedgerRow, passId: 'PASS-SYNTH-OTHER' }] })).reason, 'V2_DUPLICATE_ISSUANCEREQUESTID');
assert.equal(validateSnapshot(snapshot({ v2Rows: [{ ...syntheticLedgerRow, issuanceStatus: 'UNKNOWN' }] })).reason, 'V2_ROW_TYPE_INVALID');
assert.equal(validateSnapshot(snapshot({ v2Rows: [{ ...syntheticLedgerRow, issuanceStatus: 'PENDING', committedAt: '' }], passRows: [syntheticPassRow] })).status, 'NEEDS_REVIEW');
assert.equal(validateSnapshot(snapshot({ v2Rows: [syntheticLedgerRow], passRows: [] })).status, 'NEEDS_REVIEW');
assert.equal(validateSnapshot(snapshot({ legacyRows: [['only', 'one', 'cell']] })).reason, 'LEGACY_ROW_WIDTH_MISMATCH');
const legacyFixtureRow = ['REQ-SYNTH-OLD-1','PASS-SYNTH-OLD-1','PET-SYNTH-OLD-1',8,
  '2026-11-27','2027-11-27',80000,0,80000,'synthetic-test','TEST-OP','2026-11-27T00:00:00.000Z','APPROVED'];
const legacyPassRow = { passId: 'PASS-SYNTH-OLD-1', petId: 'PET-SYNTH-OLD-1', productId: 'SYNTH-UNKNOWN',
  totalUses: 8, usedUses: 0, remainingUses: 8 };
assert.equal(validateSnapshot(snapshot({ legacyRows: [legacyFixtureRow], passRows: [legacyPassRow] })).status, 'PASS');
assert.equal(validateSnapshot(snapshot({ legacyRows: [legacyFixtureRow, legacyFixtureRow] })).reason, 'LEGACY_REQUEST_ID_DUPLICATE');
assert.equal(validateSnapshot(snapshot({ legacyRows: [[...legacyFixtureRow.slice(0, 3), '8', ...legacyFixtureRow.slice(4)]] })).reason, 'LEGACY_ROW_FIELDS_NEEDS_REVIEW');

const ready = evaluateEnvironment(baseConfig(), readyEvidence());
assert.equal(ready.status, 'READY');
assert.equal(ready.deployment.status, 'BLOCKED');
assert.equal(ready.remoteCalls, 0);
assert.equal(ready.writesPerformed, 0);
assert.equal(evaluateEnvironment({}, readyEvidence()).status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), branch: 'main' }).checks.find(x => x.name === 'branch').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), cwdMatches: false }).checks.find(x => x.name === 'working-directory').status, 'BLOCKED');
assert.equal(evaluateEnvironment({ ...baseConfig(), environmentName: 'production' }, readyEvidence()).checks.find(x => x.name === 'environment-name').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), guardianIds: ['SYNTHETIC_SCRIPT_ID_000000000001'] }).checks.find(x => x.name === 'guardian-target-separation').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), guardianWorkbookIds: ['SYNTHETIC_SHEET_ID_000000000001'] }).checks.find(x => x.name === 'guardian-target-separation').status, 'BLOCKED');
assert.equal(evaluateEnvironment({ ...baseConfig(), scriptId: 'production-script-id-00000000000001' }, readyEvidence()).checks.find(x => x.name === 'operating-target-block').status, 'BLOCKED');
assert.equal(evaluateEnvironment({ ...baseConfig(), spreadsheetId: '' }, readyEvidence()).checks.find(x => x.name === 'target-ids-configured').status, 'BLOCKED');
assert.equal(evaluateEnvironment({ ...baseConfig(), enableWrites: true }, readyEvidence()).checks.find(x => x.name === 'writes-disabled').status, 'BLOCKED');
assert.equal(evaluateEnvironment({ ...baseConfig(), allowDeployment: true }, readyEvidence()).checks.find(x => x.name === 'deployment-disabled').status, 'BLOCKED');
assert.equal(evaluateEnvironment({ ...baseConfig(), ledgerTabName: '_이용권발급이력' }, readyEvidence()).checks.find(x => x.name === 'tab-contract').status, 'BLOCKED');
assert.equal(evaluateEnvironment({ ...baseConfig(), allowedTestRequestPrefix: 'REQ-' }, readyEvidence()).checks.find(x => x.name === 'request-prefix').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), syntheticFixtureRequestPrefix: false }).checks.find(x => x.name === 'synthetic-fixture-prefix').status, 'BLOCKED');
assert.equal(evaluateEnvironment({ ...baseConfig(), evidence: { ...baseConfig().evidence, evidenceReference: '' } }, readyEvidence()).checks.find(x => x.name === 'test-isolation-evidence').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), publicEndpoint: true }).checks.find(x => x.name === 'no-public-or-outbound-endpoint').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), outboundEndpoint: true }).checks.find(x => x.name === 'no-public-or-outbound-endpoint').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), secretMaterial: true }).checks.find(x => x.name === 'no-secret-material').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), automaticDeployment: true }).checks.find(x => x.name === 'no-automatic-deploy').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), manualDeployment: true }).checks.find(x => x.name === 'manual-deploy-workflow-review').status, 'NEEDS_APPROVAL');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), buildFiles: [] }).checks.find(x => x.name === 'build-file-list').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), legacyChanged: true }).checks.find(x => x.name === 'legacy-path-unchanged').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), issuanceEntryChanged: true }).checks.find(x => x.name === 'existing-issuance-entry-unchanged').status, 'BLOCKED');
assert.equal(evaluateEnvironment(baseConfig(), { ...readyEvidence(), manualDeployment: true }).deployment.status, 'BLOCKED');

const inspected = inspect();
assert.equal(inspected.status, 'BLOCKED');
assert.equal(inspected.deployment.status, 'BLOCKED');
assert.equal(inspected.remoteCalls, 0);
assert.equal(inspected.writesPerformed, 0);
assert.equal(inspected.checks.find(item => item.name === 'manual-deploy-workflow-review').status, 'NEEDS_APPROVAL');
const gateText = JSON.stringify(inspected);
assert.ok(!gateText.includes('SYNTHETIC_SCRIPT_ID_000000000001'));

const bomConfigPath = path.join(__dirname, '..', 'pass-issuance-test-app', `bom-test-${randomUUID()}.local.json`);
fs.writeFileSync(bomConfigPath, '\uFEFF' + JSON.stringify(baseConfig()), { flag: 'wx' });
try {
  const bomResult = inspect(bomConfigPath);
  for (const name of ['target-ids-configured', 'dry-run-default', 'writes-disabled', 'deployment-disabled']) {
    assert.equal(bomResult.checks.find(item => item.name === name).status, 'PASS', name);
  }
  fs.writeFileSync(bomConfigPath, '\uFEFF{');
  const malformedResult = inspect(bomConfigPath);
  assert.equal(malformedResult.status, 'BLOCKED');
  assert.equal(malformedResult.checks.find(item => item.name === 'target-ids-configured').status, 'BLOCKED');
} finally {
  fs.unlinkSync(bomConfigPath);
}

const normalFixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pass-issuance-test-app', 'fixtures', 'normal-synthetic-issuance.json'), 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pass-issuance-test-app', 'fixtures', 'failure-scenarios.json'), 'utf8'));
assert.equal(normalFixture.mode, 'SYNTHETIC_FIXTURE_ONLY');
assert.equal(scenarios.mode, 'SYNTHETIC_SCENARIO_CATALOG_ONLY');
assert.ok(scenarios.scenarios.length >= 10);
assert.ok(scenarios.scenarios.every(item => item.autoCleanup === false));
assert.ok(!JSON.stringify([normalFixture, scenarios]).match(/(?:@|Bearer\s|AIza|-----BEGIN)/i));

const preflightContext = { Array, Date, Error, JSON, Map, Math, Number, Object, Set, String };
for (const relative of ['src/PassCatalog.js','src/PassIssuancePlan.js','src/PassIssuanceLegacyReader.js',
  'src/PassIssuanceLedger.js','src/PassIssuancePreflight.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), preflightContext, { filename: relative });
}
const syntheticPlan = preflightContext.mdPassIssuancePreflight_({
  ...normalFixture,
  snapshot: {
    mode: 'SYNTHETIC_FIXTURE', complete: true,
    v2SheetName: preflightContext.mdPassIssuanceV2SheetName_(),
    legacySheetName: preflightContext.mdPassIssuanceLegacySheetName_(),
    v2Headers: preflightContext.mdPassIssuanceV2Headers_(), v2Rows: [], legacyRows: [], passRows: [],
    legacyPaymentReferenceCoverage: 'COMPLETE'
  }
});
assert.equal(syntheticPlan.validationStatus, 'PLAN_ONLY');
assert.ok(syntheticPlan.plan.warnings.includes('LIVE_ISSUANCE_DISABLED'));

console.log('PASS: environment safety gate, V2/legacy snapshot validator, and synthetic plan/scenario fixtures; no cloud calls or writes.');
