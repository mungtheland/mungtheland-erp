#!/usr/bin/env node
'use strict';

// Prints a redacted local plan only. It has no SpreadsheetApp or network client.
const fs = require('node:fs');
const path = require('node:path');
const {
  mdPassIssuanceValidateRegistration_, mdBuildPassIssuanceV2InitializationPlan_
} = require('../src/PassIssuanceEnvironment.js');
const { validateSnapshot } = require('./validate-pass-issuance-v2-snapshot.cjs');
const { v2Headers } = require('./pass-issuance-test-schema.cjs');
const { collectKnownTargets } = require('./check-pass-issuance-environment.cjs');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'pass-issuance-test-app', 'environment.template.json');
const allowedLocalPath = path.join(root, 'pass-issuance-test-app', 'environment.local.json');

function createInitializationPlan(configPath = templatePath) {
  const resolved = path.resolve(configPath);
  if (resolved !== templatePath && resolved !== allowedLocalPath)
    return { status: 'BLOCKED', reason: 'CONFIG_PATH_OUTSIDE_ALLOWLIST', plan: null, remoteCalls: 0, writesPerformed: 0 };
  let config;
  try {
    if (fs.existsSync(resolved)) {
      const realRoot = fs.realpathSync(path.join(root, 'pass-issuance-test-app'));
      const realConfig = fs.realpathSync(resolved);
      if (!realConfig.startsWith(realRoot + path.sep)) throw Error('LOCAL_CONFIG_PATH_INVALID');
    }
    config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (_) {
    return { status: 'BLOCKED', reason: 'LOCAL_CONFIG_INVALID', plan: null, remoteCalls: 0, writesPerformed: 0 };
  }
  const snapshotPath = path.join(root, 'pass-issuance-test-app', 'fixtures', 'empty-synthetic-snapshot.json');
  let snapshot;
  try { snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')); }
  catch (_) { return { status: 'BLOCKED', reason: 'SYNTHETIC_SNAPSHOT_INVALID', plan: null, remoteCalls: 0, writesPerformed: 0 }; }
  const snapshotCheck = validateSnapshot(snapshot);
  if (snapshotCheck.status !== 'PASS')
    return { status: 'BLOCKED', reason: 'SYNTHETIC_SNAPSHOT_INVALID', plan: null, remoteCalls: 0, writesPerformed: 0 };
  const known = collectKnownTargets();
  const knownTargets = {
    guardianScriptIds: known.guardianIds,
    productionScriptIds: known.productionIds,
    guardianSpreadsheetIds: known.guardianWorkbookIds,
    erpSpreadsheetIds: known.erpSpreadsheetIds,
    productionSpreadsheetIds: known.productionWorkbookIds
  };
  const registration = mdPassIssuanceValidateRegistration_(config, knownTargets);
  const planned = mdBuildPassIssuanceV2InitializationPlan_({
    config, knownTargets, v2Headers: v2Headers(), snapshot
  });
  return {
    status: planned.status,
    reason: planned.reason,
    registrationStatus: registration.status,
    verificationLevel: registration.verificationLevel,
    cloudOwnershipVerified: false,
    plan: planned.plan,
    remoteCalls: 0,
    writesPerformed: 0,
    deletesPerformed: 0
  };
}

if (require.main === module) {
  const configPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : templatePath;
  const result = createInitializationPlan(configPath);
  console.log(JSON.stringify(result));
  if (result.status !== 'PLAN_ONLY') process.exitCode = 2;
}

module.exports = { createInitializationPlan };
