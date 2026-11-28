'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { collectKnownTargets } = require('../scripts/check-pass-issuance-environment.cjs');
const { headerSha256 } = require('../scripts/review-pass-issuance-v2-initialization.cjs');
const { v2Headers } = require('../scripts/pass-issuance-test-schema.cjs');
const { buildV2InitializationRequest, driveFileScope, initializationSheetId } =
  require('../scripts/build-pass-issuance-v2-request.cjs');

const configPath = process.env.ISSUANCE_TEST_LOCAL_CONFIG;
const local = configPath ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;
const known = collectKnownTargets();
const reference = 'SYNTHETIC-B-REQUEST-FIXTURE';
const fakeClient = 'MOCK-INITIALIZATION-CLIENT';

function scenario() {
  const config = {
    ...local,
    approvalReferences: { B: reference },
    initializationOAuthClientId: fakeClient
  };
  const workbookId = config.spreadsheetId;
  return {
    config,
    snapshot: {
      workbookId, timeZone: 'Asia/Seoul', complete: true, priorAttemptOutcome: 'NONE',
      tabs: [{ name: 'Sheet1', sheetId: 0 }]
    },
    approval: { reference, workbookId, sheetId: initializationSheetId, headerSha256 },
    oauthEvidence: { clientId: fakeClient, audience: fakeClient, scope: driveFileScope, pickedFileIds: [workbookId] }
  };
}

function expectStop(input, reason) {
  const result = buildV2InitializationRequest(input);
  assert.notEqual(result.status, 'MOCK_REQUEST_ONLY');
  assert.equal(result.reason, reason);
  assert.equal(result.remoteCalls, 0);
  assert.equal(result.writesPerformed, 0);
  assert.ok(!Object.hasOwn(result, 'request'));
}

test('request generator denies arbitrary, ERP and Guardian workbook IDs', () => {
  assert.ok(known.erpSpreadsheetIds.length && known.guardianWorkbookIds.length);
  for (const workbookId of [...known.erpSpreadsheetIds, ...known.guardianWorkbookIds, 'SYNTH-UNKNOWN-WORKBOOK-00001']) {
    const fixture = scenario();
    fixture.config.spreadsheetId = workbookId;
    fixture.snapshot.workbookId = workbookId;
    expectStop(fixture, 'DEDICATED_TARGET_MISMATCH');
  }
});

test('exact dedicated fixture prepares one addSheet and one header update', { skip: !local }, () => {
  const fixture = scenario();
  const result = buildV2InitializationRequest(fixture);
  assert.equal(result.status, 'MOCK_REQUEST_ONLY');
  assert.equal(result.remoteCalls, 0);
  assert.equal(result.writesPerformed, 0);
  assert.ok(result.request.spreadsheetId === fixture.config.spreadsheetId);
  assert.deepEqual(result.request.body, {
    includeSpreadsheetInResponse: false,
    requests: [
      {
        addSheet: {
          properties: {
            title: '_이용권발급원장V2', sheetId: initializationSheetId,
            gridProperties: { rowCount: 1, columnCount: 16 }
          }
        }
      },
      {
        updateCells: {
          start: { sheetId: initializationSheetId, rowIndex: 0, columnIndex: 0 },
          fields: 'userEnteredValue',
          rows: [{ values: v2Headers().map(value => ({ userEnteredValue: { stringValue: value } })) }]
        }
      }
    ]
  });
});

test('missing approval, mixed scopes, wrong client and wrong picker selection fail closed', { skip: !local }, () => {
  const fixture = scenario();
  expectStop({ ...fixture, config: { ...fixture.config, approvalReferences: {} } }, 'APPROVAL_B_EVIDENCE_MISSING_OR_MISMATCH');
  expectStop({ ...fixture, approval: { ...fixture.approval, headerSha256: 'wrong' } }, 'APPROVAL_B_EVIDENCE_MISSING_OR_MISMATCH');
  expectStop({ ...fixture, approval: { ...fixture.approval, sheetId: 7 } }, 'APPROVAL_B_SHEET_ID_MISMATCH');
  for (const patch of [
    { scope: '' }, { scope: `${driveFileScope} https://www.googleapis.com/auth/spreadsheets` },
    { scope: 'https://www.googleapis.com/auth/drive' }, { audience: 'OTHER' }, { clientId: 'OTHER' }
  ]) {
    expectStop({ ...fixture, oauthEvidence: { ...fixture.oauthEvidence, ...patch } }, 'DRIVE_FILE_SCOPE_OR_CLIENT_MISMATCH');
  }
  for (const pickedFileIds of [[], [known.erpSpreadsheetIds[0]], [fixture.config.spreadsheetId, known.guardianWorkbookIds[0]]]) {
    expectStop({ ...fixture, oauthEvidence: { ...fixture.oauthEvidence, pickedFileIds } }, 'PICKED_FILE_MISMATCH');
  }
});

test('incomplete, colliding, existing and ambiguous snapshots produce no request', { skip: !local }, () => {
  const fixture = scenario();
  const withSnapshot = patch => ({ ...fixture, snapshot: { ...fixture.snapshot, ...patch } });
  expectStop(withSnapshot({ complete: false }), 'SNAPSHOT_INCOMPLETE_OR_INVALID');
  expectStop(withSnapshot({ tabs: [{ name: 'Sheet1' }] }), 'SHEET_ID_INVENTORY_INVALID');
  expectStop(withSnapshot({ tabs: [{ name: 'Sheet1', sheetId: initializationSheetId }] }), 'FIXED_SHEET_ID_COLLISION');
  const ledger = { name: '_이용권발급원장V2', sheetId: initializationSheetId, headers: v2Headers(), dataRows: 0 };
  expectStop(withSnapshot({ tabs: [ledger] }), 'V2_ALREADY_INITIALIZED_NO_RETRY');
  expectStop(withSnapshot({ tabs: [{ ...ledger, headers: [] }] }), 'V2_PARTIAL_OR_MISMATCH_PRESERVE');
  expectStop(withSnapshot({ priorAttemptOutcome: 'UNKNOWN' }), 'PRIOR_ATTEMPT_REQUIRES_RECONCILIATION');
});
