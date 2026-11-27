'use strict';

// Local registration checks and a pure V2 tab initialization plan. No cloud ports.
const MD_PASS_ISSUANCE_ENVIRONMENT_NAME_ = 'pass-issuance-isolated-test';
const MD_PASS_ISSUANCE_V2_TAB_ = '_\uC774\uC6A9\uAD8C\uBC1C\uAE09\uC6D0\uC7A5V2';
const MD_PASS_ISSUANCE_LEGACY_TAB_ = '_\uC774\uC6A9\uAD8C\uBC1C\uAE09\uC774\uB825';
const MD_PASS_ISSUANCE_PASS_TAB_ = '\uC774\uC6A9\uAD8C\uAD00\uB9AC';
const MD_PASS_ISSUANCE_REQUIRED_SCOPE_ = 'https://www.googleapis.com/auth/spreadsheets';

function mdPassIssuanceSafeRef_(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value);
}

function mdPassIssuanceParseUrl_(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    return url;
  } catch (_) { return null; }
}

function mdPassIssuanceValidateScriptUrl_(value, scriptId) {
  const url = mdPassIssuanceParseUrl_(value);
  if (!url || url.origin !== 'https://script.google.com' || url.search) return false;
  const match = url.pathname.match(/^\/home\/projects\/([A-Za-z0-9_-]{20,128})\/edit\/?$/);
  return !!match && match[1] === scriptId;
}

function mdPassIssuanceValidateSpreadsheetUrl_(value, spreadsheetId) {
  const url = mdPassIssuanceParseUrl_(value);
  if (!url || url.origin !== 'https://docs.google.com' || url.search) return false;
  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,128})\/edit\/?$/);
  return !!match && match[1] === spreadsheetId && !url.searchParams.has('usp');
}

function mdPassIssuanceValidatePermissionReview_(config) {
  const review = config && config.permissionReview;
  const owner = config && config.ownerAccount;
  if (!review || typeof review !== 'object' || review.status !== 'REVIEWED' ||
      review.runtimeIdentity !== owner || !Array.isArray(review.scriptEditors) ||
      !Array.isArray(review.workbookEditors) || !Array.isArray(review.oauthScopes)) return false;
  const onlyOwner = list => list.length === 1 && list[0] === owner;
  return onlyOwner(review.scriptEditors) && onlyOwner(review.workbookEditors) &&
    review.oauthScopes.length === 1 && review.oauthScopes[0] === MD_PASS_ISSUANCE_REQUIRED_SCOPE_ &&
    review.webAppAccess === 'DISABLED' && review.githubDeployment === 'DISABLED' &&
    review.tokenStorage === 'GOOGLE_MANAGED_ONLY' && mdPassIssuanceSafeRef_(review.reviewReference);
}

function mdPassIssuanceValidateRegistration_(config, knownTargets = {}) {
  const checks = [];
  const add = (name, ok, reason, approval = false) => checks.push({
    name, status: ok ? 'PASS' : approval ? 'NEEDS_APPROVAL' : 'BLOCKED', reason: ok ? 'OK' : reason
  });
  const c = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const scriptId = typeof c.scriptId === 'string' ? c.scriptId.trim() : '';
  const spreadsheetId = typeof c.spreadsheetId === 'string' ? c.spreadsheetId.trim() : '';
  const idPattern = /^[A-Za-z0-9_-]{20,128}$/;
  add('environment', c.environmentName === MD_PASS_ISSUANCE_ENVIRONMENT_NAME_, 'ENVIRONMENT_NAME_INVALID');
  add('project-name', c.projectName === '\uBA4D\uB354\uB79C\uB4DC \uBC1C\uAE09 \uC2E4\uC99D TEST', 'PROJECT_NAME_INVALID');
  add('workbook-title', c.spreadsheetTitle === '\uBA4D\uB354\uB79C\uB4DC \uBC1C\uAE09 \uC2E4\uC99D \uC804\uC6A9 TEST', 'WORKBOOK_TITLE_INVALID');
  add('script-id-format', idPattern.test(scriptId), 'SCRIPT_ID_INVALID');
  add('spreadsheet-id-format', idPattern.test(spreadsheetId), 'SPREADSHEET_ID_INVALID');
  add('distinct-resource-ids', !!scriptId && !!spreadsheetId && scriptId !== spreadsheetId, 'RESOURCE_ID_TYPE_COLLISION');
  add('guardian-script-separation', !!scriptId && !(knownTargets.guardianScriptIds || []).includes(scriptId), 'GUARDIAN_SCRIPT_ID_BLOCKED');
  add('guardian-workbook-separation', !!spreadsheetId && !(knownTargets.guardianSpreadsheetIds || []).includes(spreadsheetId), 'GUARDIAN_WORKBOOK_ID_BLOCKED');
  add('existing-erp-workbook-separation', !!spreadsheetId && !(knownTargets.erpSpreadsheetIds || []).includes(spreadsheetId), 'EXISTING_ERP_WORKBOOK_ID_BLOCKED');
  add('known-production-target-separation', !!scriptId && !!spreadsheetId &&
    !(knownTargets.productionScriptIds || []).includes(scriptId) &&
    !(knownTargets.productionSpreadsheetIds || []).includes(spreadsheetId), 'KNOWN_PRODUCTION_TARGET_BLOCKED');
  add('project-url-id-match', mdPassIssuanceValidateScriptUrl_(c.scriptProjectUrl, scriptId), 'SCRIPT_URL_ID_MISMATCH');
  add('workbook-url-id-match', mdPassIssuanceValidateSpreadsheetUrl_(c.spreadsheetUrl, spreadsheetId), 'SPREADSHEET_URL_ID_MISMATCH');
  add('owner-account-format', typeof c.ownerAccount === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.ownerAccount), 'OWNER_ACCOUNT_UNVERIFIED');
  add('distinct-owner-assertion', c.isolationEvidence && c.isolationEvidence.ownerAccountMatches === true, 'OWNER_MATCH_EVIDENCE_MISSING');
  const isolation = c.isolationEvidence || {};
  add('dedicated-resource-evidence', isolation.reviewStatus === 'OPERATOR_ATTESTED' &&
    isolation.dedicatedScript === true && isolation.dedicatedWorkbook === true &&
    isolation.syntheticDataOnly === true && isolation.noSharedSourceData === true &&
    mdPassIssuanceSafeRef_(isolation.evidenceReference), 'ISOLATION_EVIDENCE_MISSING');
  add('permission-profile', mdPassIssuanceValidatePermissionReview_(c), 'PERMISSION_REVIEW_INVALID', true);
  add('permission-scope-profile', c.permissionScopeProfile === 'DEDICATED_SCRIPT_SINGLE_TEST_WORKBOOK', 'PERMISSION_SCOPE_PROFILE_UNCONFIRMED', true);
  add('v2-and-legacy-tab-names', c.ledgerTabName === MD_PASS_ISSUANCE_V2_TAB_ &&
    c.legacyTabName === MD_PASS_ISSUANCE_LEGACY_TAB_ && c.passTabName === MD_PASS_ISSUANCE_PASS_TAB_ &&
    c.ledgerTabName !== c.legacyTabName, 'TAB_NAME_CONTRACT_INVALID');
  add('safe-switches', c.dryRunOnly === true && c.enableWrites === false && c.allowDeployment === false,
    'WRITES_OR_DEPLOYMENT_MUST_REMAIN_DISABLED');
  add('synthetic-prefix', typeof c.allowedTestRequestPrefix === 'string' &&
    /^SYNTH-ONLY-[A-Z0-9-]+$/.test(c.allowedTestRequestPrefix), 'TEST_PREFIX_INVALID');
  add('recovery-owner', typeof c.recoveryOwner === 'string' && !!c.recoveryOwner.trim(), 'RECOVERY_OWNER_MISSING', true);
  add('audit-policy', typeof c.auditPolicyVersion === 'string' && !!c.auditPolicyVersion.trim(), 'AUDIT_POLICY_MISSING');
  const approvals = c.approvalReferences || {};
  add('resource-creation-approval-reference', mdPassIssuanceSafeRef_(approvals.A) && c.approvalReference === approvals.A,
    'RESOURCE_CREATION_APPROVAL_MISSING', true);
  add('ledger-initialization-approval-reference', mdPassIssuanceSafeRef_(approvals.B), 'LEDGER_INITIALIZATION_APPROVAL_MISSING', true);
  add('approval-stages-independent', ['A','B','C','D','E','F'].every(key =>
    approvals[key] === undefined || approvals[key] === '' || mdPassIssuanceSafeRef_(approvals[key])), 'APPROVAL_REFERENCE_INVALID');

  const blockingChecks = checks.filter(item => item.status === 'BLOCKED');
  const approvalChecks = checks.filter(item => item.status === 'NEEDS_APPROVAL');
  const status = blockingChecks.length ? 'BLOCKED' : approvalChecks.length ? 'NEEDS_APPROVAL' : 'PASS';
  return {
    status,
    localStructureStatus: blockingChecks.length ? 'BLOCKED' : 'PASS',
    approvalReadiness: approvalChecks.length ? 'NEEDS_APPROVAL' : 'PASS',
    verificationLevel: 'LOCAL_FORMAT_AND_DECLARATION_ONLY',
    cloudOwnershipVerified: false,
    cloudMetadataCalls: 0,
    checks
  };
}

function mdBuildPassIssuanceV2InitializationPlan_({ config, knownTargets, v2Headers, snapshot } = {}) {
  const registration = mdPassIssuanceValidateRegistration_(config, knownTargets);
  const blocked = reason => ({ status: 'BLOCKED', reason, plan: null, remoteCalls: 0, writesPerformed: 0 });
  if (registration.localStructureStatus !== 'PASS') return blocked('ENVIRONMENT_REGISTRATION_NOT_VALIDATED');
  if (!Array.isArray(v2Headers) || v2Headers.length !== 16 || new Set(v2Headers).size !== 16 ||
      v2Headers.some(value => typeof value !== 'string' || !value.trim())) return blocked('V2_HEADER_CONTRACT_INVALID');
  if (!snapshot || snapshot.mode !== 'SYNTHETIC_FIXTURE_ONLY' || !Array.isArray(snapshot.existingTabTitles))
    return blocked('SYNTHETIC_TAB_SNAPSHOT_REQUIRED');
  if (snapshot.existingTabTitles.includes(config.ledgerTabName)) return blocked('V2_TAB_ALREADY_EXISTS_NO_REINITIALIZE');
  if (snapshot.existingTabTitles.includes(config.legacyTabName)) return blocked('LEGACY_TAB_PRESENT_IN_DEDICATED_WORKBOOK');
  if (config.ledgerTabName === config.legacyTabName) return blocked('LEGACY_TAB_PROTECTION_COLLISION');
  return {
    status: 'PLAN_ONLY', reason: 'LOCAL_INITIALIZATION_PLAN_NOT_EXECUTED', remoteCalls: 0, writesPerformed: 0,
    plan: {
      environmentName: config.environmentName,
      targetSpreadsheetId: '[CONFIGURED_TARGET_ID_REDACTED]',
      targetTabName: config.ledgerTabName,
      headers: v2Headers.slice(),
      expectedRows: 1,
      expectedColumns: 16,
      initialSnapshot: {
        requiredBeforeApprovalBExecution: true,
        actualCapturePerformed: false,
        capture: ['spreadsheet metadata and title', 'tab names and dimensions', 'legacy tab header and row-count fingerprint', 'capture timestamp and reviewer reference']
      },
      preCreationChecks: [
        'revalidate target IDs and canonical URLs against approved references',
        'confirm read-only metadata identity and owner for the dedicated synthetic workbook',
        'confirm V2 tab is absent using a fresh metadata read',
        'confirm legacy issuance tab and existing ERP/Guardian resources are outside this workbook',
        'capture and review the before snapshot'
      ],
      validation: ['exact ordered 16-column header', 'one header row and zero data rows', 'tab title is distinct from the legacy tab', 'independent readback after separately approved creation'],
      failureStop: ['do not retry an ambiguous create', 'do not rename or reuse another tab', 'preserve any partially created resource and stop for review'],
      recovery: ['no automatic delete or rollback', 'manual recovery owner and audit reference required', 'retain before/after evidence'],
      requiredApproval: 'B',
      additionalRequiredApproval: 'A for any resource provisioning; C for bundle deployment; D for synthetic data writes; E for fault injection and recovery; F for operational integration',
      approvalReferencesPresent: {
        A: !!(config.approvalReferences && config.approvalReferences.A),
        B: !!(config.approvalReferences && config.approvalReferences.B),
        C: !!(config.approvalReferences && config.approvalReferences.C),
        D: !!(config.approvalReferences && config.approvalReferences.D),
        E: !!(config.approvalReferences && config.approvalReferences.E),
        F: !!(config.approvalReferences && config.approvalReferences.F)
      },
      cloudOwnershipVerified: false,
      liveCreationAuthorized: false,
      writesPerformed: 0
    }
  };
}

if (typeof module !== 'undefined') module.exports = {
  mdPassIssuanceValidateRegistration_,
  mdBuildPassIssuanceV2InitializationPlan_,
  mdPassIssuanceValidateScriptUrl_,
  mdPassIssuanceValidateSpreadsheetUrl_
};
