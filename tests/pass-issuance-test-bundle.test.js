'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildPassIssuanceTestBundle } = require('../scripts/build-pass-issuance-test.cjs');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-issuance-bundle-test-'));
try {
  const output = path.join(temporaryRoot, 'bundle');
  const result = buildPassIssuanceTestBundle(output);
  assert.equal(result.manifestValidated, true);
  assert.equal(result.remoteCalls, 0);
  assert.deepEqual(result.files, [
    'PassCatalog.gs','PassIssuancePlan.gs','PassIssuanceLegacyReader.gs','PassIssuanceLedger.gs',
    'PassIssuancePreflight.gs','appsscript.json'
  ]);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'appsscript.json'), 'utf8'));
  assert.equal(manifest.timeZone, 'Asia/Seoul');
  assert.equal(manifest.runtimeVersion, 'V8');
  assert.equal(Object.hasOwn(manifest, 'scriptId'), false);
  assert.throws(() => buildPassIssuanceTestBundle(output), /OUTPUT_DIRECTORY_EXISTS/);
  const ledger = fs.readFileSync(path.join(output, 'PassIssuanceLedger.gs'), 'utf8');
  assert.ok(ledger.includes("const MD_PASS_ISSUANCE_STORAGE_ENABLED_=false"));
  assert.ok(ledger.includes("'_이용권발급원장V2'"));
  console.log('PASS: isolated pass issuance bundle builds and validates locally only.');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
