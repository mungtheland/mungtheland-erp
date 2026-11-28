'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SHEET_ID, TAB_NAME, EXPECTED_COLUMN_COUNT, SOURCE_COLUMN_RANGES,
  HEADER_MANIFEST, validateHeaderManifest, normalizeSheetRow, reconcileSheetsDuplicateValues,
  createReadOnlySheetsIntakeAdapter, createReadOnlySheetsResponseDiagnostic, diagnoseSheetResponseRow,
  classifySubmissionReplay, fingerprintSheetsSubmission
} = require('./tally-admission-sheets');

const headers = Array.from({ length: EXPECTED_COLUMN_COUNT }, (_, i) => `SYNTHETIC HEADER ${i + 1}`);
const config = {
  fingerprintKey: 'SYNTHETIC_ONLY_FINGERPRINT_KEY_0123456789',
  expectedHeaders: headers,
  bindings: {
    submissionId: { index: 0, header: headers[0], verified: true },
    respondentId: { index: 1, header: headers[1], verified: true },
    submittedAt: { index: 2, header: headers[2], verified: true },
    guardianName: { index: 3, header: headers[3], verified: true },
    phone: { index: 4, header: headers[4], verified: true },
    emergencyPhone: { index: 5, header: headers[5], verified: true },
    dogName: { index: 7, header: headers[7], verified: true },
    photoVideoConsent: { index: 48, header: headers[48], verified: true },
    signatureReference: { index: 49, header: headers[49], verified: true },
    signerName: { index: 50, header: headers[50], verified: true }
  },
  requiredFields: ['guardianName', 'phone', 'emergencyPhone', 'dogName']
};
function makeRow() {
  const row = Array(EXPECTED_COLUMN_COUNT).fill('');
  row[0] = 'SYNTHETIC-SUBMISSION-001'; row[1] = 'SYNTHETIC-RESPONDENT-001'; row[2] = '2026-11-28T00:00:00Z';
  row[3] = 'Synthetic guardian'; row[4] = '01000000001'; row[5] = '01000000002'; row[7] = 'Synthetic dog';
  row[49] = 'https://synthetic.invalid/signature'; row[50] = 'Synthetic signer';
  return row;
}
const code = expected => error => error.code === expected;

test('51-column synthetic Sheets contract normalizes known bound fields only', () => {
  const result = normalizeSheetRow(headers, makeRow(), config);
  assert.equal(result.source, 'TALLY_GOOGLE_SHEETS');
  assert.equal(result.sourceStatus, 'PENDING_VERIFICATION');
  assert.equal(result.submissionId, 'SYNTHETIC-SUBMISSION-001');
  assert.equal(result.data.phone, '01000000001');
  assert.equal(result.photoVideoConsent.accepted, false);
  assert.deepEqual(result.marketingConsent, { status: 'NOT_PRESENT_DEFAULT_FALSE', accepted: false });
  assert.equal(result.signature.status, 'HTTPS_REFERENCE_FORMAT_ONLY');
  assert.equal(result.signerNamePresent, true);
  assert.equal(result.guardianAutoLink, 'BLOCKED_UNTIL_FIRST_VISIT_IDENTITY_CHECK');
  assert.equal(result.approvalTransition, 'BLOCKED');
  assert.equal(result.contractedTransition, 'BLOCKED');
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.equal(JSON.stringify(result).includes('synthetic.invalid'), false);
});

test('source schema enforces exactly 51 unique headers in their expected order', () => {
  assert.equal(validateHeaderManifest(headers, headers), true);
  const reordered = [...headers]; [reordered[3], reordered[4]] = [reordered[4], reordered[3]];
  assert.throws(() => validateHeaderManifest(reordered, headers), code('SHEETS_INTAKE_HEADER_MISMATCH'));
  assert.throws(() => validateHeaderManifest(headers.slice(1), headers), code('SHEETS_INTAKE_SCHEMA_PENDING'));
  const duplicate = [...headers]; duplicate[3] = duplicate[2];
  assert.throws(() => validateHeaderManifest(duplicate, duplicate), code('SHEETS_INTAKE_HEADER_MISMATCH'));
  assert.throws(() => validateHeaderManifest([...headers, 'NEW'], [...headers, 'NEW']), code('SHEETS_INTAKE_SCHEMA_PENDING'));
});

test('captured source manifest is 51 exact ordered headers with distinct consent groups', () => {
  assert.equal(HEADER_MANIFEST.sourceEvidence, 'CONNECTED_SHEETS_HEADER_RANGE_A1_AY1');
  assert.equal(HEADER_MANIFEST.spreadsheetId, SHEET_ID);
  assert.equal(HEADER_MANIFEST.range, 'A1:AY1');
  assert.equal(HEADER_MANIFEST.columnCount, 51);
  assert.equal(HEADER_MANIFEST.columns.length, 51);
  assert.equal(validateHeaderManifest(HEADER_MANIFEST.headers, HEADER_MANIFEST.headers), true);
  assert.deepEqual(HEADER_MANIFEST.columns.slice(36, 38).map(column => column.erpCandidate), ['daycareCautions', 'daycareCautionDetails']);
  assert.deepEqual(HEADER_MANIFEST.consentGroups.map(group => group.id), [
    'contractTerms', 'incidentLiability', 'truthfulSafetyDisclosure', 'emergencyCare', 'personalDataUse'
  ]);
  assert.deepEqual(HEADER_MANIFEST.consentGroups.map(group => group.responseMeaning), Array(5).fill('PENDING_VERIFICATION'));
  const changed = [...HEADER_MANIFEST.headers]; changed[0] = 'Different header';
  assert.throws(() => validateHeaderManifest(changed, HEADER_MANIFEST.headers), code('SHEETS_INTAKE_HEADER_MISMATCH'));
  const reordered = [...HEADER_MANIFEST.headers]; [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.throws(() => validateHeaderManifest(reordered, HEADER_MANIFEST.headers), code('SHEETS_INTAKE_HEADER_MISMATCH'));
  assert.throws(() => validateHeaderManifest(HEADER_MANIFEST.headers.slice(0, 50), HEADER_MANIFEST.headers), code('SHEETS_INTAKE_SCHEMA_PENDING'));
  assert.throws(() => validateHeaderManifest([...HEADER_MANIFEST.headers, 'Extra'], [...HEADER_MANIFEST.headers, 'Extra']), code('SHEETS_INTAKE_SCHEMA_PENDING'));
});

test('unverified or reordered column binding fails closed without returning source values', () => {
  const bad = structuredClone(config);
  bad.bindings.phone = { index: 4, header: headers[3], verified: true };
  assert.throws(() => normalizeSheetRow(headers, makeRow(), bad), code('SHEETS_INTAKE_BINDING_UNVERIFIED'));
  const pending = structuredClone(config); pending.bindings.phone.verified = false;
  assert.throws(() => normalizeSheetRow(headers, makeRow(), pending), code('SHEETS_INTAKE_BINDING_UNVERIFIED'));
  assert.throws(() => normalizeSheetRow(headers, makeRow().slice(1), config), code('SHEETS_INTAKE_ROW_WIDTH'));
  assert.throws(() => normalizeSheetRow(headers, makeRow(), { ...config, fingerprintKey: '' }), code('SHEETS_INTAKE_FINGERPRINT_KEY_REQUIRED'));
});

test('required contacts, conditional details and consent semantics remain review-gated', () => {
  const row = makeRow(); row[4] = ''; row[49] = ''; row[50] = '';
  const missing = normalizeSheetRow(headers, row, config);
  assert.ok(missing.missingRequiredFields.includes('phone'));
  assert.equal(missing.signature.status, 'MISSING');
  assert.equal(missing.status, 'NEEDS_REVIEW');
  const conditionalConfig = { ...config, conditionalRulesStatus: 'VERIFIED_FROM_TALLY_CONFIGURATION',
    conditionalRules: [{ controllerField: 'biteHistory', equals: 'YES', detailField: 'biteDetails' }],
    bindings: { ...config.bindings,
      biteHistory: { index: 15, header: headers[15], verified: true },
      biteDetails: { index: 16, header: headers[16], verified: true } } };
  row[15] = 'YES'; row[16] = '';
  assert.ok(normalizeSheetRow(headers, row, conditionalConfig).missingRequiredFields.includes('biteDetails'));
  const pending = normalizeSheetRow(headers, makeRow(), config);
  assert.equal(pending.conditionalDetails, 'PENDING_VERIFICATION');
  assert.equal(pending.contractConsent, 'PENDING_VERIFICATION');
  assert.equal(pending.privacyNoticeConsent, 'PENDING_VERIFICATION');
});

test('the read adapter is pinned to the named source, tab and values-only GET surface', async () => {
  const calls = [];
  const adapter = createReadOnlySheetsIntakeAdapter({
    reader: { get: async request => { calls.push(request); return { values: [headers, makeRow()] }; } },
    spreadsheetId: SHEET_ID, expectedHeaders: headers, bindings: config.bindings, requiredFields: config.requiredFields,
    fingerprintKey: config.fingerprintKey
  });
  const result = await adapter.read();
  assert.equal(adapter.kind, 'READ_ONLY_SHEETS_INTAKE');
  assert.equal(result.length, 1);
  assert.deepEqual(calls, [{ spreadsheetId: SHEET_ID, range: `'${TAB_NAME}'!A:AY` }]);
  assert.deepEqual(SOURCE_COLUMN_RANGES.submission, [0, 2]);
  assert.throws(() => createReadOnlySheetsIntakeAdapter({ reader: { get() {}, update() {} }, spreadsheetId: SHEET_ID, expectedHeaders: headers }), code('SHEETS_INTAKE_READ_ONLY_PORT_REQUIRED'));
  assert.throws(() => createReadOnlySheetsIntakeAdapter({ reader: { get() {} }, spreadsheetId: 'different', expectedHeaders: headers }), code('SHEETS_INTAKE_SOURCE_NOT_ALLOWLISTED'));
});

test('failed read can be retried by a later scan without writing a cursor or source row', async () => {
  let attempts = 0;
  const adapter = createReadOnlySheetsIntakeAdapter({
    reader: { get: async () => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error('synthetic transport fault'), { code: 'SYNTHETIC_READ_FAILURE' });
      return { values: [headers, makeRow()] };
    } }, spreadsheetId: SHEET_ID, expectedHeaders: headers,
    bindings: config.bindings, requiredFields: config.requiredFields, fingerprintKey: config.fingerprintKey
  });
  await assert.rejects(adapter.read(), error => error.code === 'SYNTHETIC_READ_FAILURE');
  const retry = await adapter.read();
  assert.equal(attempts, 2);
  assert.equal(retry[0].submissionId, 'SYNTHETIC-SUBMISSION-001');
});

test('submission replay is exact-ID fingerprint based; changed content conflicts', () => {
  assert.equal(classifySubmissionReplay({ incomingSubmissionId: 'SYNTH-ID', incomingFingerprint: 'hash-a' }), 'NEW_SUBMISSION');
  assert.equal(classifySubmissionReplay({ existingSubmissionId: 'SYNTH-ID', incomingSubmissionId: 'SYNTH-ID', existingFingerprint: 'hash-a', incomingFingerprint: 'hash-a' }), 'DUPLICATE_UNCHANGED');
  assert.equal(classifySubmissionReplay({ existingSubmissionId: 'SYNTH-ID', incomingSubmissionId: 'SYNTH-ID', existingFingerprint: 'hash-a', incomingFingerprint: 'hash-b' }), 'CONFLICT_CHANGED_CONTENT');
  assert.equal(classifySubmissionReplay({ existingSubmissionId: 'OLD-ID', incomingSubmissionId: 'SYNTH-ID', existingFingerprint: 'hash-a', incomingFingerprint: 'hash-a' }), 'DIFFERENT_SUBMISSION');
  assert.equal(classifySubmissionReplay({}), 'BLOCKED_MISSING_FINGERPRINT');
  const a = normalizeSheetRow(headers, makeRow(), config);
  const changed = makeRow(); changed[4] = '01000000099';
  const b = normalizeSheetRow(headers, changed, config);
  const first = fingerprintSheetsSubmission(a);
  assert.equal(classifySubmissionReplay({ existingSubmissionId: a.submissionId, incomingSubmissionId: a.submissionId, existingFingerprint: first, incomingFingerprint: fingerprintSheetsSubmission(a) }), 'DUPLICATE_UNCHANGED');
  assert.equal(classifySubmissionReplay({ existingSubmissionId: a.submissionId, incomingSubmissionId: b.submissionId, existingFingerprint: first, incomingFingerprint: fingerprintSheetsSubmission(b) }), 'CONFLICT_CHANGED_CONTENT');
  const signatureChanged = makeRow(); signatureChanged[49] = 'https://synthetic.invalid/changed-signature';
  assert.notEqual(fingerprintSheetsSubmission(a), fingerprintSheetsSubmission(normalizeSheetRow(headers, signatureChanged, config)));
});

test('duplicate-value and signature evidence reuse conservative CSV diagnostics', () => {
  assert.equal(reconcileSheetsDuplicateValues('0101', '0101').status, 'SAME_VALUE_SOURCE_UNVERIFIED');
  assert.equal(reconcileSheetsDuplicateValues('0101', '0102', { sourceVerified: true }).status, 'CONFLICT');
  assert.equal(reconcileSheetsDuplicateValues('', '').status, 'REQUIRED_VALUE_MISSING');
});

function makeSensitiveResponseRow() {
  const row = Array(EXPECTED_COLUMN_COUNT).fill('');
  row[0] = 'REAL-LIKE-SYNTHETIC-SUBMISSION-DO-NOT-LEAK'; row[1] = 'SYNTHETIC-RESPONDENT-PRIVATE';
  row[2] = '2026-11-28T08:30:00Z'; row[3] = 'SYNTHETIC-GUARDIAN-PRIVATE';
  row[4] = '010-1234-5678'; row[5] = '010-9876-5432'; row[6] = 'SYNTHETIC-RELATIONSHIP';
  row[7] = 'SYNTHETIC-DOG-PRIVATE'; row[8] = 'SYNTHETIC-BREED'; row[9] = '2020-01-01';
  row[15] = 'SYNTHETIC-BITE-ANSWER'; row[16] = 'SYNTHETIC-BITE-DESCRIPTION';
  row[38] = 'AGREE-RAW-CONSENT-1'; row[39] = 'AGREE-RAW-CONSENT-1';
  row[48] = 'PHOTO-YES-RAW'; row[49] = 'https://private.example/signature/token-value';
  row[50] = 'SYNTHETIC-SIGNER-PRIVATE';
  return row;
}
const sensitiveStrings = row => row.filter(value => typeof value === 'string' && value.length > 0);

test('safe response diagnostic exposes only field statuses, never personal values or IDs', () => {
  const row = makeSensitiveResponseRow();
  const diagnostic = diagnoseSheetResponseRow(HEADER_MANIFEST.headers, row);
  const serialized = JSON.stringify(diagnostic);
  for (const value of sensitiveStrings(row)) assert.equal(serialized.includes(value), false);
  assert.equal(diagnostic.submissionId, 'PRESENT');
  assert.equal(diagnostic.respondentId, 'PRESENT');
  assert.deepEqual(diagnostic.submittedAt, { presence: 'PRESENT', format: 'FORMAT_VALID' });
  assert.equal(diagnostic.guardianAndEmergencyContacts[1].status, 'PRESENT');
  assert.equal(diagnostic.dogBasicInformation[0].status, 'PRESENT');
  assert.equal(diagnostic.persistence, 'NONE');
  assert.equal(diagnostic.writes, 0);
  assert.equal(Object.hasOwn(diagnostic, 'sourceFingerprint'), false);
  assert.equal(Object.hasOwn(diagnostic, 'data'), false);
});

test('diagnostic never logs source values and sanitizes reader exceptions', async () => {
  const secret = 'SYNTHETIC-EXCEPTION-PRIVATE-VALUE';
  const logged = [];
  const oldLog = console.log; const oldError = console.error;
  console.log = (...args) => logged.push(args.join(' '));
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const diagnostic = createReadOnlySheetsResponseDiagnostic({
      reader: { get: async () => { throw new Error(`transport failed: ${secret}`); } }, spreadsheetId: SHEET_ID
    });
    await assert.rejects(diagnostic.read(), error => error.message === 'SHEETS_DIAGNOSTIC_READ_FAILED' && !error.message.includes(secret));
  } finally { console.log = oldLog; console.error = oldError; }
  assert.deepEqual(logged, []);
});

test('signature URL and signer value are not serialized in diagnostic output', () => {
  const row = makeSensitiveResponseRow();
  const diagnostic = diagnoseSheetResponseRow(HEADER_MANIFEST.headers, row);
  const serialized = JSON.stringify(diagnostic);
  assert.equal(serialized.includes(row[49]), false);
  assert.equal(serialized.includes(row[50]), false);
  assert.deepEqual(diagnostic.signatureReference, { presence: 'PRESENT', format: 'PENDING_VERIFICATION', fieldType: 'PENDING_VERIFICATION' });
  assert.equal(diagnostic.signerName, 'PRESENT');
});

test('consent values remain pending and conditional detail blanks are not treated as errors', () => {
  const row = makeSensitiveResponseRow(); row[16] = ''; row[39] = 'DIFFERENT-RAW-CONSENT'; row[36] = '';
  const diagnostic = diagnoseSheetResponseRow(HEADER_MANIFEST.headers, row);
  assert.equal(diagnostic.consentGroups[0].meaning, 'PENDING_VERIFICATION');
  assert.deepEqual(diagnostic.consentGroups[0].columns.map(cell => cell.status), ['PRESENT', 'PRESENT']);
  assert.equal(diagnostic.conditionalDetails[0].status, 'EMPTY');
  assert.equal(diagnostic.conditionalDetails[0].validation, 'PENDING_VERIFICATION');
  assert.equal(diagnostic.photoVideoConsent.meaning, 'PENDING_VERIFICATION');
  assert.equal(diagnostic.marketingConsent.status, 'NOT_PRESENT_DEFAULT_FALSE');
});

test('manifest mismatch is rejected with a constant message that excludes header content', () => {
  const altered = [...HEADER_MANIFEST.headers]; altered[0] = 'SYNTHETIC-HEADER-SECRET';
  assert.throws(() => diagnoseSheetResponseRow(altered, makeSensitiveResponseRow()), error =>
    error.code === 'SHEETS_INTAKE_HEADER_MISMATCH' && !error.message.includes('SYNTHETIC-HEADER-SECRET'));
});

test('bounded diagnostic reads only A1:AY2 once and exposes no writer or persistence surface', async () => {
  const calls = [];
  const row = makeSensitiveResponseRow();
  const reader = { get: async request => { calls.push(request); return { values: [HEADER_MANIFEST.headers, row] }; } };
  const adapter = createReadOnlySheetsResponseDiagnostic({ reader, spreadsheetId: SHEET_ID });
  const result = await adapter.read();
  assert.deepEqual(calls, [{ spreadsheetId: SHEET_ID, range: `'${TAB_NAME}'!A1:AY2` }]);
  assert.equal(result.responseRowCount, 1);
  assert.equal(result.persistence, 'NONE');
  assert.equal(result.writes, 0);
  assert.equal(Object.hasOwn(adapter, 'write'), false);
  assert.equal(JSON.stringify(result).includes(row[4]), false);
  assert.throws(() => createReadOnlySheetsResponseDiagnostic({ reader: { get() {}, append() {} }, spreadsheetId: SHEET_ID }), code('SHEETS_DIAGNOSTIC_READ_ONLY_PORT_REQUIRED'));
});
