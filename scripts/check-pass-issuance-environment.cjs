#!/usr/bin/env node
'use strict';

// Static, local-only release gate. It cannot deploy or write to cloud services.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { spawnSync } = require('node:child_process');
const { buildPassIssuanceTestBundle } = require('./build-pass-issuance-test.cjs');
const { validateSnapshot } = require('./validate-pass-issuance-v2-snapshot.cjs');
const { mdPassIssuanceValidateRegistration_ } = require('../src/PassIssuanceEnvironment.js');

const root = path.resolve(__dirname, '..');
const expectedBranch = 'feature/staff-attendance-desktop';
const expectedEnvironment = 'pass-issuance-isolated-test';
const expectedFiles = [
  'PassCatalog.gs','PassIssuancePlan.gs','PassIssuanceLegacyReader.gs',
  'PassIssuanceLedger.gs','PassIssuancePreflight.gs','appsscript.json'
];
const PRIVATE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bBearer\s+\S+/i,
  /\b(?:ya29\.|gh[pousr]_|github_pat_|AIza)[A-Za-z0-9_-]{15,}/,
  /"(?:private_key|client_secret|refresh_token|access_token|id_token|password)"\s*:/i,
  /\.clasprc\.json|application_default_credentials\.json/i
];

function check(name, pass, blockedReason, approvalRequired = false) {
  return { name, status: pass ? 'PASS' : approvalRequired ? 'NEEDS_APPROVAL' : 'BLOCKED', reason: pass ? 'OK' : blockedReason };
}

function evaluateEnvironment(config, evidence = {}) {
  const results = [];
  const add = (name, pass, reason, approval = false) => results.push(check(name, pass, reason, approval));
  const safeConfig = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  add('branch', evidence.branch === expectedBranch, 'WRONG_BRANCH');
  add('working-directory', evidence.cwdMatches === true, 'WRONG_WORKING_DIRECTORY');
  add('environment-name', safeConfig.environmentName === expectedEnvironment, 'ENVIRONMENT_NAME_INVALID');
  const configText = JSON.stringify(safeConfig);
  add('config-no-secret-material', !PRIVATE_PATTERNS.some(pattern => pattern.test(configText)), 'CONFIG_SECRET_MATERIAL_FOUND');

  const workbookId = typeof safeConfig.spreadsheetId === 'string' ? safeConfig.spreadsheetId.trim() : '';
  const scriptId = typeof safeConfig.scriptId === 'string' ? safeConfig.scriptId.trim() : '';
  const validId = value => /^[A-Za-z0-9_-]{20,}$/.test(value);
  const blockedIds = new Set([...(evidence.guardianIds || []), ...(evidence.productionIds || [])].filter(Boolean));
  const blockedWorkbooks = new Set([...(evidence.guardianWorkbookIds || []), ...(evidence.productionWorkbookIds || [])].filter(Boolean));
  add('target-ids-configured', validId(scriptId) && validId(workbookId), 'TARGET_IDS_UNCONFIGURED');
  const idsPresent = !!scriptId && !!workbookId;
  add('guardian-target-separation', idsPresent && !blockedIds.has(scriptId) && !blockedWorkbooks.has(workbookId),
    idsPresent ? 'GUARDIAN_TEST_TARGET_BLOCKED' : 'TARGET_ISOLATION_UNVERIFIED', !idsPresent);
  const forbiddenMarker = /(?:^|[-_])(prod|production|live|guardian)(?:[-_]|$)/i;
  add('operating-target-block', !forbiddenMarker.test(scriptId) && !forbiddenMarker.test(workbookId), 'OPERATING_OR_GUARDIAN_MARKER_BLOCKED');

  add('test-isolation-evidence', safeConfig.evidence?.dedicatedAppsScriptProjectConfirmed === true &&
      safeConfig.evidence?.dedicatedWorkbookConfirmed === true &&
      safeConfig.evidence?.ownershipAndIsolationApproved === true &&
      typeof safeConfig.evidence?.evidenceReference === 'string' && safeConfig.evidence.evidenceReference.trim().length > 0,
    'TEST_ISOLATION_EVIDENCE_MISSING');
  add('permission-review', safeConfig.evidence?.permissionScopeReviewed === true &&
      safeConfig.permissionScopeProfile === 'DEDICATED_SCRIPT_SINGLE_TEST_WORKBOOK', 'PERMISSION_SCOPE_UNREVIEWED', true);

  const names = safeConfig.ledgerTabName === '_\uC774\uC6A9\uAD8C\uBC1C\uAE09\uC6D0\uC7A5V2' &&
    safeConfig.legacyTabName === '_\uC774\uC6A9\uAD8C\uBC1C\uAE09\uC774\uB825' &&
    safeConfig.ledgerTabName !== safeConfig.legacyTabName && safeConfig.passTabName === '\uC774\uC6A9\uAD8C\uAD00\uB9AC';
  add('tab-contract', names, 'TAB_CONTRACT_MISMATCH');
  add('dry-run-default', safeConfig.dryRunOnly === true, 'DRY_RUN_MUST_REMAIN_ENABLED');
  add('writes-disabled', safeConfig.enableWrites === false, 'WRITES_MUST_REMAIN_DISABLED');
  add('deployment-disabled', safeConfig.allowDeployment === false, 'DEPLOYMENT_MUST_REMAIN_DISABLED');
  add('request-prefix', typeof safeConfig.allowedTestRequestPrefix === 'string' && /^SYNTH-ONLY-[A-Z0-9-]+$/.test(safeConfig.allowedTestRequestPrefix),
    'TEST_REQUEST_PREFIX_INVALID');
  add('synthetic-fixture-prefix', evidence.syntheticFixtureRequestPrefix === true, 'SYNTHETIC_FIXTURE_PREFIX_MISMATCH');
  add('isolation-mode', safeConfig.testDataIsolationMode === 'DEDICATED_WORKBOOK_REQUIRED', 'DEDICATED_WORKBOOK_REQUIRED');
  add('recovery-and-audit', typeof safeConfig.recoveryOwner === 'string' && !!safeConfig.recoveryOwner.trim() &&
      typeof safeConfig.auditPolicyVersion === 'string' && !!safeConfig.auditPolicyVersion.trim(), 'RECOVERY_OR_AUDIT_POLICY_MISSING', true);

  const schema = evidence.schemaResult || { status: 'BLOCKED' };
  add('local-schema-fixture', schema.status === 'PASS' && schema.v2HeaderCount === 16 && schema.legacyHeaderCount === 13,
    'SCHEMA_FIXTURE_INVALID');
  add('build-file-list', Array.isArray(evidence.buildFiles) && JSON.stringify(evidence.buildFiles) === JSON.stringify(expectedFiles),
    'BUILD_FILE_LIST_MISMATCH');
  add('manifest-no-webapp', evidence.manifestValid === true, 'MANIFEST_OR_PUBLIC_WEBAPP_INVALID');
  add('no-public-or-outbound-endpoint', evidence.publicEndpoint === false && evidence.outboundEndpoint === false,
    'PUBLIC_OR_OUTBOUND_ENDPOINT_FOUND');
  add('no-secret-material', evidence.secretMaterial === false, 'SECRET_MATERIAL_FOUND');
  add('no-automatic-deploy', evidence.automaticDeployment === false, 'AUTOMATIC_DEPLOYMENT_PRESENT');
  add('manual-deploy-workflow-review', evidence.manualDeployment === false, 'MANUAL_DEPLOY_WORKFLOW_PRESENT', true);
  add('legacy-path-unchanged', evidence.legacyChanged === false, 'LEGACY_READER_CHANGED');
  add('existing-issuance-entry-unchanged', evidence.issuanceEntryChanged === false, 'EXISTING_ISSUANCE_ENTRY_CHANGED');
  const registration = evidence.registrationResult || { status: 'BLOCKED', cloudOwnershipVerified: false };
  add('environment-registration', registration.status === 'PASS', 'ENVIRONMENT_REGISTRATION_INVALID', registration.status === 'NEEDS_APPROVAL');
  add('cloud-ownership-not-claimed', registration.cloudOwnershipVerified === false,
    'LOCAL_CHECK_CANNOT_VERIFY_CLOUD_OWNERSHIP');

  // This tool is intentionally incapable of approving or invoking a deployment.
  const deployment = { name: 'deployment-execution', status: 'BLOCKED', reason: 'DEPLOYMENT_NOT_PERMITTED_IN_STAGE_66' };
  const statuses = results.map(item => item.status);
  const status = statuses.includes('BLOCKED') ? 'BLOCKED' : statuses.includes('NEEDS_APPROVAL') ? 'NEEDS_APPROVAL' : 'READY';
  return { status, deployment, checks: results, remoteCalls: 0, writesPerformed: 0 };
}

function git(args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return ''; }
}

function gitUnchanged(args) {
  const result = spawnSync('git', args, { cwd: root, stdio: 'ignore' });
  return result.status === 0;
}

function readJsonConfig(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readConfiguredTarget(filePath, key) {
  try {
    const value = readJsonConfig(filePath)[key];
    return typeof value === 'string' && value ? value : '';
  } catch (_) { return ''; }
}

function collectKnownTargets() {
  const guardianIds = [];
  const guardianConfig = path.join(root, '.clasp.guardian-test.json');
  const guardianId = readConfiguredTarget(guardianConfig, 'scriptId');
  if (guardianId) guardianIds.push(guardianId);
  const productionIds = [];
  for (const name of ['.clasp.json', '.clasp.production.json', '.clasp.prod.json']) {
    const value = readConfiguredTarget(path.join(root, name), 'scriptId');
    if (value) productionIds.push(value);
  }
  const guardianWorkbookIds = [];
  const productionWorkbookIds = [];
  const erpSpreadsheetIds = new Set();
  const sourceRoots = ['guardian-auth-server', 'src'];
  const idAssignment = /(?:const|let|var)\s+([A-Z0-9_]*(?:SPREADSHEET|WORKBOOK|SHEET)_ID)\s*=\s*['"]([A-Za-z0-9_-]{20,128})['"]/g;
  for (const relativeRoot of sourceRoots) {
    const absoluteRoot = path.join(root, relativeRoot);
    const pending = [absoluteRoot];
    while (pending.length) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(target);
        else if (/\.(?:js|cjs|gs)$/i.test(entry.name)) {
          const source = fs.readFileSync(target, 'utf8');
          for (const match of source.matchAll(idAssignment)) {
            erpSpreadsheetIds.add(match[2]);
            if (/GUARDIAN|INTEGRATION_TEST/i.test(match[1])) guardianWorkbookIds.push(match[2]);
          }
        }
      }
    }
  }
  for (const name of ['.clasp.json', '.clasp.production.json', '.clasp.prod.json']) {
    const value = readConfiguredTarget(path.join(root, name), 'spreadsheetId');
    if (value) productionWorkbookIds.push(value);
  }
  return { guardianIds, productionIds, guardianWorkbookIds, productionWorkbookIds, erpSpreadsheetIds: [...erpSpreadsheetIds] };
}

function scanBundle(directory, filenames) {
  const text = filenames.map(name => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
  return {
    publicEndpoint: /\bfunction\s+do(?:Get|Post)\s*\(/.test(text),
    outboundEndpoint: /\bUrlFetchApp\s*\.\s*fetch(?:All)?\s*\(|\bfetch\s*\(\s*['"]https?:\/\//i.test(text),
    secretMaterial: PRIVATE_PATTERNS.some(pattern => pattern.test(text))
  };
}

function inspect(configPath = path.join(root, 'pass-issuance-test-app', 'environment.template.json')) {
  const resolvedConfig = path.resolve(configPath);
  const allowedConfigRoot = path.join(root, 'pass-issuance-test-app') + path.sep;
  if (resolvedConfig !== path.join(root, 'pass-issuance-test-app', 'environment.template.json') &&
      (!resolvedConfig.startsWith(allowedConfigRoot) || !/\.local\.json$/i.test(resolvedConfig))) {
    return evaluateEnvironment({}, { branch: git(['branch', '--show-current']), cwdMatches: path.resolve(process.cwd()) === root });
  }
  if (fs.existsSync(resolvedConfig)) {
    const realConfigRoot = fs.realpathSync(path.join(root, 'pass-issuance-test-app'));
    const realConfig = fs.realpathSync(resolvedConfig);
    if (realConfig !== realConfigRoot && !realConfig.startsWith(realConfigRoot + path.sep))
      return evaluateEnvironment({}, { branch: git(['branch', '--show-current']), cwdMatches: path.resolve(process.cwd()) === root });
  }
  let config = {};
  try { config = readJsonConfig(resolvedConfig); } catch (_) { /* fail closed below */ }
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-issuance-gate-'));
  try {
    const build = buildPassIssuanceTestBundle(path.join(outputRoot, 'bundle'));
    const manifest = JSON.parse(fs.readFileSync(path.join(outputRoot, 'bundle', 'appsscript.json'), 'utf8'));
    const scans = scanBundle(path.join(outputRoot, 'bundle'), build.files);
    const syntheticFixture = JSON.parse(fs.readFileSync(path.join(root, 'pass-issuance-test-app', 'fixtures', 'normal-synthetic-issuance.json'), 'utf8'));
    const workflowFiles = fs.existsSync(path.join(root, '.github', 'workflows'))
      ? fs.readdirSync(path.join(root, '.github', 'workflows')).filter(name => /\.ya?ml$/i.test(name)) : [];
    let automaticDeployment = false;
    let manualDeployment = false;
    for (const file of workflowFiles) {
      const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', file), 'utf8');
      if (!/\bclasp\s+(?:push|deploy)\b/i.test(workflow)) continue;
      const hasAutomaticTrigger = /(?:^|\n)\s*(?:push|schedule|workflow_run|pull_request|release|repository_dispatch|workflow_call)\s*(?::|\[)/m.test(workflow) ||
        /^\s*on:\s*\[[^\]]*\b(?:push|schedule|workflow_run|pull_request|release|repository_dispatch)\b/m.test(workflow);
      if (hasAutomaticTrigger) automaticDeployment = true;
      else manualDeployment = true;
    }
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const command of Object.values(packageJson.scripts || {})) {
      if (!/\bclasp\s+(?:push|deploy)\b/i.test(command)) continue;
      if (/\b(?:prepublish|postinstall|prepare|pretest|precheck)\b/i.test(command)) automaticDeployment = true;
      else manualDeployment = true;
    }
    const known = collectKnownTargets();
    const evidence = {
      branch: git(['branch', '--show-current']),
      cwdMatches: path.resolve(process.cwd()) === root,
      ...known,
      registrationResult: mdPassIssuanceValidateRegistration_(config, {
        guardianScriptIds: known.guardianIds,
        productionScriptIds: known.productionIds,
        guardianSpreadsheetIds: known.guardianWorkbookIds,
        erpSpreadsheetIds: known.erpSpreadsheetIds,
        productionSpreadsheetIds: known.productionWorkbookIds
      }),
      schemaResult: validateSnapshot({
        mode: 'SYNTHETIC_FIXTURE_ONLY',
        v2SheetName: config.ledgerTabName,
        legacySheetName: config.legacyTabName,
        v2Headers: require('./pass-issuance-test-schema.cjs').v2Headers(),
        legacyHeaders: require('./pass-issuance-test-schema.cjs').legacyHeaders(),
        v2Rows: [], legacyRows: [], passRows: []
      }),
      syntheticFixtureRequestPrefix: syntheticFixture.mode === 'SYNTHETIC_FIXTURE_ONLY' &&
        typeof syntheticFixture.request?.requestId === 'string' &&
        syntheticFixture.request.requestId.startsWith(config.allowedTestRequestPrefix || '') &&
        typeof syntheticFixture.candidatePassId === 'string' && syntheticFixture.candidatePassId.startsWith('PASS-SYNTH-'),
      buildFiles: build.files,
      manifestValid: manifest.runtimeVersion === 'V8' && manifest.timeZone === 'Asia/Seoul' &&
        !Object.hasOwn(manifest, 'scriptId') && !manifest.webapp,
      ...scans,
      automaticDeployment,
      manualDeployment,
      legacyChanged: !gitUnchanged(['diff', '--quiet', 'HEAD', '--', 'src/PassIssuanceLegacyReader.js']),
      issuanceEntryChanged: !gitUnchanged(['diff', '--quiet', 'HEAD', '--', 'src/Passes.js'])
    };
    return {
      ...evaluateEnvironment(config, evidence),
      registrationBlockers: evidence.registrationResult.checks.filter(item => item.status !== 'PASS')
    };
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const configArg = process.argv[2];
  const configPath = configArg ? path.resolve(process.cwd(), configArg) : path.join(root, 'pass-issuance-test-app', 'environment.template.json');
  const result = inspect(configPath);
  console.log(JSON.stringify(result));
  if (result.status !== 'READY' || result.deployment.status !== 'READY') process.exitCode = 2;
}

module.exports = { evaluateEnvironment, inspect, expectedFiles, collectKnownTargets };
