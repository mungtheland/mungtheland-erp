'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { buildPassIssuanceTestBundle, matchesDedicatedTargets } = require('../scripts/build-pass-issuance-test.cjs');
const { collectKnownTargets } = require('../scripts/check-pass-issuance-environment.cjs');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-issuance-bundle-test-'));
try {
  const output = path.join(temporaryRoot, 'bundle');
  const result = buildPassIssuanceTestBundle(output);
  assert.equal(result.manifestValidated, true);
  assert.equal(result.remoteCalls, 0);
  assert.deepEqual(result.files, [
    'PassCatalog.gs','PassIssuancePlan.gs','PassIssuanceLegacyReader.gs','PassIssuanceLedger.gs',
    'PassIssuancePreflight.gs','WorkbookAccess.gs','appsscript.json'
  ]);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'appsscript.json'), 'utf8'));
  assert.equal(manifest.timeZone, 'Asia/Seoul');
  assert.equal(manifest.runtimeVersion, 'V8');
  assert.equal(Object.hasOwn(manifest, 'scriptId'), false);
  assert.throws(() => buildPassIssuanceTestBundle(output), /OUTPUT_DIRECTORY_EXISTS/);
  const ledger = fs.readFileSync(path.join(output, 'PassIssuanceLedger.gs'), 'utf8');
  assert.ok(ledger.includes("const MD_PASS_ISSUANCE_STORAGE_ENABLED_=false"));
  assert.ok(ledger.includes("'_이용권발급원장V2'"));
  assert.doesNotMatch(ledger, /mdBook_|SpreadsheetApp|appendRow|setValues/);

  const sheets = collectKnownTargets();
  assert.ok(sheets.erpSpreadsheetIds.length && sheets.guardianWorkbookIds.length);
  assert.equal(matchesDedicatedTargets({ spreadsheetId: sheets.erpSpreadsheetIds[0], scriptId: sheets.guardianIds[0] }), false);
  const code = result.files.filter(file => file.endsWith('.gs'))
    .map(file => fs.readFileSync(path.join(output, file), 'utf8')).join('\n;\n');
  assert.equal((code.match(/SpreadsheetApp\b/g) || []).length, 1);
  assert.doesNotMatch(code, /\b(?:getActiveSpreadsheet|openByUrl|DriveApp|UrlFetchApp|PropertiesService|appendRow|setValues|insertSheet)\b/);
  const workbookPin = code.match(/MD_ISSUANCE_TEST_SPREADSHEET_PIN_ = '([a-f0-9]{64})'/)[1];
  const scriptPin = code.match(/MD_ISSUANCE_TEST_SCRIPT_PIN_ = '([a-f0-9]{64})'/)[1];
  const testId = 'SYNTHETIC_TEST_WORKBOOK_ID_001';
  const testScriptId = 'SYNTHETIC_TEST_SCRIPT_ID_00001';
  let scriptId = testScriptId;
  let returnedWorkbookId = testId;
  let opens = 0;
  let sheetReads = 0;
  const context = vm.createContext({
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(algorithm, id, charset) {
        assert.equal(algorithm, 'SHA_256');
        assert.equal(charset, 'UTF_8');
        // Stand-in IDs exercise the generated pins without putting real IDs in the test.
        if (id === testId) return [...Buffer.from(workbookPin, 'hex')];
        if (id === testScriptId) return [...Buffer.from(scriptPin, 'hex')];
        return [...createHash('sha256').update(id).digest()];
      }
    },
    ScriptApp: { getScriptId: () => scriptId },
    SpreadsheetApp: {
      openById(id) {
        assert.equal(id, testId);
        opens++;
        return {
          getId: () => returnedWorkbookId,
          getSheets() {
            sheetReads++;
            return [{ getName: () => 'Sheet1' }];
          }
        };
      }
    }
  });
  vm.runInContext(code, context);
  for (const id of new Set([...sheets.erpSpreadsheetIds, ...sheets.guardianWorkbookIds, undefined, '', ` ${testId}`])) {
    assert.throws(() => context.mdReadPassIssuanceTestWorkbook_(id), /TEST_WORKBOOK_TARGET_REJECTED/);
  }
  scriptId = sheets.guardianIds[0];
  assert.throws(() => context.mdReadPassIssuanceTestWorkbook_(testId), /TEST_SCRIPT_TARGET_REJECTED/);
  assert.equal(context.mdPersistPassIssuance_({ spreadsheetId: testId }).status, 'DISABLED');
  assert.equal(opens, 0);
  scriptId = testScriptId;
  returnedWorkbookId = sheets.erpSpreadsheetIds[0];
  assert.throws(() => context.mdReadPassIssuanceTestWorkbook_(testId), /TEST_WORKBOOK_ID_MISMATCH/);
  assert.equal(sheetReads, 0);
  returnedWorkbookId = testId;
  assert.deepEqual(Array.from(context.mdReadPassIssuanceTestWorkbook_(testId).sheetNames), ['Sheet1']);
  assert.equal(opens, 2);
  assert.equal(sheetReads, 1);
  console.log('PASS: isolated pass issuance bundle builds and validates locally only.');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
