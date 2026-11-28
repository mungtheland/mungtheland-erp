'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { parse } = require('acorn');
const { buildIssuanceSyntheticBundle } = require('../scripts/build-pass-issuance-synthetic.cjs');
const { reviewInitialization, headerSha256 } = require('../scripts/review-pass-issuance-v2-initialization.cjs');
const { collectKnownTargets } = require('../scripts/check-pass-issuance-environment.cjs');
const { v2Headers } = require('../scripts/pass-issuance-test-schema.cjs');

const configuredPath = process.env.ISSUANCE_TEST_LOCAL_CONFIG;
const config = configuredPath ? JSON.parse(fs.readFileSync(configuredPath, 'utf8')) : null;
const known = collectKnownTargets();
const sha256 = text => createHash('sha256').update(text).digest();

function walk(node, parent, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, node, visit));
    else walk(value, node, visit);
  }
}

test('synthetic candidate contains fixed fixture and no workbook or storage code', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'issuance-synthetic-test-'));
  try {
    const output = path.join(temporary, 'bundle');
    const result = buildIssuanceSyntheticBundle(output);
    t.diagnostic(`Synthetic bundle SHA-256: ${result.bundleHash}`);
    assert.deepEqual(result.files, [
      'PassCatalog.gs', 'PassIssuancePlan.gs', 'PassIssuancePreflight.gs',
      'SyntheticCheck.gs', 'SyntheticSchema.gs', 'appsscript.json'
    ]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'appsscript.json'), 'utf8')),
      { timeZone: 'Asia/Seoul', runtimeVersion: 'V8', exceptionLogging: 'STACKDRIVER' });
    const forbidden = /^(?:SpreadsheetApp|DriveApp|UrlFetchApp|Sheets|Drive|LockService|PropertiesService|Script|Session|Jdbc|GmailApp|MailApp|ContentService|HtmlService|XMLHttpRequest|WebSocket|fetch|globalThis|global|window|eval|Function|Reflect|Proxy|constructor|__proto__|openById|openByUrl|getActiveSpreadsheet|appendRow|setValues|insertSheet|mdPersistPassIssuance_|mdPassIssuanceRunWithPorts_|doGet|doPost|onOpen|onEdit)$/;
    const serviceMembers = [];
    const code = result.files.filter(file => file.endsWith('.gs')).map(file => {
      const source = fs.readFileSync(path.join(output, file), 'utf8');
      walk(parse(source, { ecmaVersion: 'latest' }), null, (node, parent) => {
        assert.ok(!['ImportExpression', 'ThisExpression', 'WithStatement'].includes(node.type), file);
        if (node.type === 'Identifier') {
          assert.ok(!forbidden.test(node.name), `${file} contains ${node.name}`);
          if (['ScriptApp', 'Utilities', 'console'].includes(node.name)) {
            assert.equal(file, 'SyntheticCheck.gs');
            assert.ok(parent.type === 'MemberExpression' && parent.object === node && !parent.computed);
            serviceMembers.push(`${node.name}.${parent.property.name}`);
          }
        }
        if (node.type === 'CallExpression') {
          assert.ok(node.callee.type === 'Identifier' ||
            (node.callee.type === 'MemberExpression' && !node.callee.computed), file);
        }
        if (node.type === 'Literal' && typeof node.value === 'string') assert.doesNotMatch(node.value, /https?:\/\//);
      });
      return source;
    }).join('\n;\n');
    assert.deepEqual(serviceMembers.sort(), ['ScriptApp.getScriptId', 'Utilities.Charset', 'Utilities.DigestAlgorithm', 'Utilities.computeDigest', 'console.log']);

    const scriptPin = code.match(/join\(''\) !== '([a-f0-9]{64})'/)[1];
    const validId = config?.scriptId ?? 'SYNTHETIC_TEST_SCRIPT_00001';
    let currentId = known.guardianIds[0];
    const log = [];
    const context = vm.createContext({
      console: { log: message => log.push(message) },
      ScriptApp: { getScriptId: () => currentId },
      Utilities: {
        DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
        computeDigest: (_algorithm, id) => Array.from(
          !config && id === validId ? Buffer.from(scriptPin, 'hex') : sha256(id),
          byte => byte > 127 ? byte - 256 : byte
        )
      }
    });
    vm.runInContext(code, context);
    assert.ok(known.guardianIds.length);
    assert.equal(context.runIssuanceSyntheticCheck().reason, 'TEST_SCRIPT_TARGET_REJECTED');
    currentId = undefined;
    assert.equal(context.runIssuanceSyntheticCheck().status, 'BLOCKED');
    assert.deepEqual(log, []);
    currentId = validId;
    const expected = '{"status":"PLAN_ONLY","reason":"SYNTHETIC_PREFLIGHT_PASSED"}';
    assert.equal(JSON.stringify(context.runIssuanceSyntheticCheck()), expected);
    assert.equal(JSON.stringify(context.runIssuanceSyntheticCheck({ snapshot: { mode: 'LIVE' } })), expected);
    assert.deepEqual(log, [expected, expected]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('initialization review rejects known ERP and Guardian IDs', () => {
  assert.ok(known.erpSpreadsheetIds.length && known.guardianWorkbookIds.length);
  for (const workbookId of [...known.erpSpreadsheetIds, ...known.guardianWorkbookIds]) {
    assert.equal(reviewInitialization({ ...config, spreadsheetId: workbookId }, { workbookId }).reason,
      'DEDICATED_TARGET_MISMATCH');
  }
});

test('dedicated initialization is plan-only and ambiguous or duplicate attempts stop', { skip: !config }, () => {
  const workbookId = config.spreadsheetId;
  const snapshot = { workbookId, timeZone: 'Asia/Seoul', complete: true, priorAttemptOutcome: 'NONE', tabs: [{ name: 'Sheet1' }] };
  const approval = { reference: 'SYNTHETIC-B-FIXTURE', workbookId, headerSha256 };
  const approvedFixture = { ...config, approvalReferences: { B: approval.reference } };
  assert.equal(reviewInitialization(config, snapshot, approval).reason, 'APPROVAL_B_EVIDENCE_MISSING_OR_MISMATCH');
  assert.equal(reviewInitialization(approvedFixture, snapshot, { ...approval, headerSha256: 'wrong' }).status, 'BLOCKED');
  assert.equal(reviewInitialization(approvedFixture, { ...snapshot, priorAttemptOutcome: 'UNKNOWN' }, approval).reason,
    'PRIOR_ATTEMPT_REQUIRES_RECONCILIATION');
  assert.equal(reviewInitialization(approvedFixture, { ...snapshot, workbookId: known.erpSpreadsheetIds[0] }, approval).status, 'BLOCKED');
  assert.equal(reviewInitialization(approvedFixture, { ...snapshot, tabs: [{ name: '_이용권발급이력' }] }, approval).reason,
    'LEGACY_TAB_PRESENT');
  const existing = headers => ({ ...snapshot, tabs: [{ name: '_이용권발급원장V2', headers, dataRows: 0 }] });
  assert.equal(reviewInitialization(approvedFixture, existing(v2Headers()), approval).reason, 'V2_ALREADY_INITIALIZED_NO_RETRY');
  assert.equal(reviewInitialization(approvedFixture, existing([]), approval).reason, 'V2_PARTIAL_OR_MISMATCH_PRESERVE');
  const ready = reviewInitialization(approvedFixture, snapshot, approval);
  assert.equal(ready.status, 'PLAN_ONLY');
  assert.deepEqual(ready.plan.headers, v2Headers());
  assert.equal(ready.plan.headers.length, 16);
  assert.equal(ready.plan.dataRows, 0);
  assert.equal(ready.writesPerformed, 0);
});
