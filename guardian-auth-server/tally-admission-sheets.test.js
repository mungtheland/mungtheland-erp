'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SHEET_ID, TAB_NAME, EXPECTED_COLUMN_COUNT, SOURCE_COLUMN_RANGES,
  validateHeaderManifest, normalizeSheetRow, reconcileSheetsDuplicateValues,
  createReadOnlySheetsIntakeAdapter, classifySubmissionReplay, fingerprintSheetsSubmission
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
