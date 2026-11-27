'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mdPassIssuanceValidateRegistration_, mdBuildPassIssuanceV2InitializationPlan_ } = require('../src/PassIssuanceEnvironment.js');
const { v2Headers } = require('../scripts/pass-issuance-test-schema.cjs');
const { createInitializationPlan } = require('../scripts/plan-pass-issuance-v2-initialization.cjs');

function registration(overrides = {}) {
  const owner = 'synthetic-owner@example.invalid';
  return {
    environmentName: 'pass-issuance-isolated-test',
    projectName: '멍더랜드 발급 실증 TEST',
    spreadsheetTitle: '멍더랜드 발급 실증 전용 TEST',
    scriptId: 'SYNTHETIC_SCRIPT_TARGET_67000001',
    spreadsheetId: 'SYNTHETIC_WORKBOOK_TARGET_67000001',
    scriptProjectUrl: 'https://script.google.com/home/projects/SYNTHETIC_SCRIPT_TARGET_67000001/edit',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SYNTHETIC_WORKBOOK_TARGET_67000001/edit',
    ownerAccount: owner,
    ledgerTabName: '_이용권발급원장V2',
    legacyTabName: '_이용권발급이력',
    passTabName: '이용권관리',
    dryRunOnly: true,
    enableWrites: false,
    allowDeployment: false,
    allowedTestRequestPrefix: 'SYNTH-ONLY-ISSUE-',
    testDataIsolationMode: 'DEDICATED_WORKBOOK_REQUIRED',
    permissionScopeProfile: 'DEDICATED_SCRIPT_SINGLE_TEST_WORKBOOK',
    recoveryOwner: 'SYNTHETIC_RECOVERY_OWNER',
    auditPolicyVersion: 'SYNTH-AUDIT-1',
    approvalReference: 'SYNTH-APPROVAL-A',
    approvalReferences: {
      A: 'SYNTH-APPROVAL-A', B: 'SYNTH-APPROVAL-B', C: 'SYNTH-APPROVAL-C',
      D: 'SYNTH-APPROVAL-D', E: 'SYNTH-APPROVAL-E', F: 'SYNTH-APPROVAL-F'
    },
    isolationEvidence: {
      reviewStatus: 'OPERATOR_ATTESTED', dedicatedScript: true, dedicatedWorkbook: true,
      syntheticDataOnly: true, noSharedSourceData: true, ownerAccountMatches: true,
      evidenceReference: 'SYNTH-ISOLATION-REVIEW'
    },
    permissionReview: {
      status: 'REVIEWED', runtimeIdentity: owner, scriptEditors: [owner], workbookEditors: [owner],
      oauthScopes: ['https://www.googleapis.com/auth/spreadsheets'], webAppAccess: 'DISABLED',
      githubDeployment: 'DISABLED', tokenStorage: 'GOOGLE_MANAGED_ONLY', reviewReference: 'SYNTH-PERMISSION-REVIEW'
    },
    ...overrides
  };
}

const known = {
  guardianScriptIds: ['GUARDIAN_SCRIPT_TARGET_67000001'],
  guardianSpreadsheetIds: ['GUARDIAN_WORKBOOK_TARGET_67000001'],
  erpSpreadsheetIds: ['ERP_TEST_WORKBOOK_TARGET_67000001'],
  productionScriptIds: ['PRODUCTION_SCRIPT_TARGET_67000001'],
  productionSpreadsheetIds: ['PRODUCTION_WORKBOOK_TARGET_67000001']
};
const good = registration();
const valid = mdPassIssuanceValidateRegistration_(good, known);
assert.equal(valid.status, 'PASS');
assert.equal(valid.localStructureStatus, 'PASS');
assert.equal(valid.verificationLevel, 'LOCAL_FORMAT_AND_DECLARATION_ONLY');
assert.equal(valid.cloudOwnershipVerified, false);
assert.equal(valid.cloudMetadataCalls, 0);

assert.equal(mdPassIssuanceValidateRegistration_(registration({ scriptId: '' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ spreadsheetId: '' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ scriptId: 'GUARDIAN_SCRIPT_TARGET_67000001' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ spreadsheetId: 'GUARDIAN_WORKBOOK_TARGET_67000001' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ spreadsheetId: 'ERP_TEST_WORKBOOK_TARGET_67000001' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ scriptId: 'PRODUCTION_SCRIPT_TARGET_67000001' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ spreadsheetId: 'PRODUCTION_WORKBOOK_TARGET_67000001' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ spreadsheetId: good.scriptId }), known).checks.find(x => x.name === 'distinct-resource-ids').status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ scriptProjectUrl: good.spreadsheetUrl }), known).checks.find(x => x.name === 'project-url-id-match').status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/WRONG_WORKBOOK_TARGET_67000001/edit' }), known).checks.find(x => x.name === 'workbook-url-id-match').status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ scriptProjectUrl: 'http://script.google.com/home/projects/SYNTHETIC_SCRIPT_TARGET_67000001/edit' }), known).checks.find(x => x.name === 'project-url-id-match').status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ isolationEvidence: { ...good.isolationEvidence, noSharedSourceData: false } }), known).checks.find(x => x.name === 'dedicated-resource-evidence').status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ permissionReview: { ...good.permissionReview, oauthScopes: ['https://www.googleapis.com/auth/drive'] } }), known).checks.find(x => x.name === 'permission-profile').status, 'NEEDS_APPROVAL');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ permissionReview: { ...good.permissionReview, workbookEditors: [good.ownerAccount, 'extra@example.invalid'] } }), known).status, 'NEEDS_APPROVAL');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ permissionReview: { ...good.permissionReview, webAppAccess: 'ANYONE' } }), known).status, 'NEEDS_APPROVAL');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ recoveryOwner: '' }), known).status, 'NEEDS_APPROVAL');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ approvalReference: '' }), known).status, 'NEEDS_APPROVAL');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ approvalReferences: { ...good.approvalReferences, A: '', B: '' }, approvalReference: '' }), known).status, 'NEEDS_APPROVAL');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ approvalReferences: { ...good.approvalReferences, C: 'bad/reference' } }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ projectName: 'Guardian Test Project' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ spreadsheetTitle: 'Existing ERP Workbook' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ ownerAccount: '' }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ isolationEvidence: { ...good.isolationEvidence, ownerAccountMatches: false } }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ permissionScopeProfile: 'UNCONFIRMED' }), known).status, 'NEEDS_APPROVAL');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ enableWrites: true }), known).status, 'BLOCKED');
assert.equal(mdPassIssuanceValidateRegistration_(registration({ allowDeployment: true }), known).status, 'BLOCKED');

const emptySnapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pass-issuance-test-app', 'fixtures', 'empty-synthetic-snapshot.json'), 'utf8'));
const plan = mdBuildPassIssuanceV2InitializationPlan_({ config: good, knownTargets: known, v2Headers: v2Headers(), snapshot: emptySnapshot });
assert.equal(plan.status, 'PLAN_ONLY');
assert.equal(plan.plan.targetTabName, good.ledgerTabName);
assert.equal(plan.plan.headers.length, 16);
assert.equal(plan.plan.expectedRows, 1);
assert.equal(plan.plan.expectedColumns, 16);
assert.equal(plan.plan.liveCreationAuthorized, false);
assert.equal(plan.plan.cloudOwnershipVerified, false);
assert.equal(plan.plan.writesPerformed, 0);
assert.ok(!JSON.stringify(plan).includes(good.spreadsheetId));
assert.ok(!JSON.stringify(plan).includes(good.scriptId));
assert.equal(plan.plan.requiredApproval, 'B');
assert.equal(plan.plan.approvalReferencesPresent.A, true);
assert.equal(plan.plan.approvalReferencesPresent.F, true);
assert.equal(plan.plan.initialSnapshot.actualCapturePerformed, false);
assert.ok(plan.plan.preCreationChecks.some(item => item.includes('fresh metadata read')));
const noApprovals = registration({ approvalReference: '', approvalReferences: { A: '', B: '', C: '', D: '', E: '', F: '' } });
const noApprovalPlan = mdBuildPassIssuanceV2InitializationPlan_({ config: noApprovals, knownTargets: known, v2Headers: v2Headers(), snapshot: emptySnapshot });
assert.equal(noApprovalPlan.status, 'PLAN_ONLY');
assert.equal(noApprovalPlan.plan.approvalReferencesPresent.A, false);
assert.equal(noApprovalPlan.plan.liveCreationAuthorized, false);
assert.equal(mdBuildPassIssuanceV2InitializationPlan_({ config: good, knownTargets: known, v2Headers: v2Headers().slice(0, 15), snapshot: emptySnapshot }).status, 'BLOCKED');
assert.equal(mdBuildPassIssuanceV2InitializationPlan_({ config: good, knownTargets: known, v2Headers: v2Headers(), snapshot: { ...emptySnapshot, mode: 'LIVE_METADATA' } }).status, 'BLOCKED');
assert.equal(mdBuildPassIssuanceV2InitializationPlan_({ config: good, knownTargets: known, v2Headers: v2Headers(), snapshot: { ...emptySnapshot, existingTabTitles: [good.ledgerTabName] } }).reason, 'V2_TAB_ALREADY_EXISTS_NO_REINITIALIZE');
assert.equal(mdBuildPassIssuanceV2InitializationPlan_({ config: good, knownTargets: known, v2Headers: v2Headers(), snapshot: { ...emptySnapshot, existingTabTitles: [good.legacyTabName] } }).reason, 'LEGACY_TAB_PRESENT_IN_DEDICATED_WORKBOOK');
assert.equal(mdBuildPassIssuanceV2InitializationPlan_({ config: registration({ spreadsheetId: '' }), knownTargets: known, v2Headers: v2Headers(), snapshot: emptySnapshot }).status, 'BLOCKED');
assert.equal(mdBuildPassIssuanceV2InitializationPlan_({ config: good, knownTargets: known, v2Headers: v2Headers(), snapshot: { existingTabTitles: [] } }).status, 'BLOCKED');
const defaultCli = createInitializationPlan();
assert.equal(defaultCli.status, 'BLOCKED');
assert.equal(defaultCli.plan, null);
assert.equal(defaultCli.remoteCalls, 0);
assert.equal(defaultCli.writesPerformed, 0);

console.log('PASS: isolated environment registration and V2 initialization plan; synthetic fixtures only, cloud ownership unverified, writes 0.');
