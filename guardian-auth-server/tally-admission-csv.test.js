'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_COLUMN_COUNT, KNOWN_HEADERS, parseCsvRows, reconcileDuplicateColumns,
  normalizeConsentPair, normalizeConsentPairs, normalizeOptionalConsentCell,
  validateSignatureReference, inspectTallyAdmissionCsv
} = require('./tally-admission-csv');
const { createSyntheticCsv, createSyntheticCsvRow } = require('./tally-admission-csv.fixture.cjs');

test('synthetic CSV fixture has the confirmed 55-column layout and diagnostics omit response values', () => {
  const result = inspectTallyAdmissionCsv(createSyntheticCsv());
  assert.equal(result.structureStatus, 'VERIFIED_FROM_CSV');
  assert.equal(result.columnCount, 55);
  assert.equal(result.responseCount, 1);
  assert.equal(result.editorQuestionIds, 'PENDING_VERIFICATION');
  assert.equal(result.conditionalRules, 'PENDING_VERIFICATION');
  assert.equal(result.webhookFormat, 'PENDING_VERIFICATION');
  assert.equal(result.rows[0].submissionId, 'PRESENT_UNVERIFIED_CANDIDATE');
  assert.equal(result.rows[0].phoneStatus, 'SAME_VALUE_SOURCE_UNVERIFIED');
  assert.equal(result.rows[0].emergencyPhoneStatus, 'SINGLE_VALUE_SOURCE_UNVERIFIED');
  assert.equal(result.rows[0].phonePreservesString, true);
  assert.equal(result.rows[0].parasitePrevention, 'EMPTY_CAUSE_UNVERIFIED');
  assert.equal(result.rows[0].photoVideoConsent, 'DEFAULT_FALSE');
  assert.equal(result.rows[0].marketingConsent, 'NOT_PRESENT_IN_CONFIRMED_COLUMNS_DEFAULT_FALSE');
  assert.equal(result.rows[0].signatureStatus, 'HTTPS_REFERENCE_FORMAT_ONLY');
  assert.equal(JSON.stringify(result).includes('01000000001'), false);
  assert.equal(JSON.stringify(result).includes('synthetic.invalid'), false);
});

test('CSV parser handles BOM, quoted comma, escaped quotes, leading zero strings, and CRLF', () => {
  const rows = parseCsvRows('\uFEFFa,b,c\r\n"last, first","said ""yes""",00123\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['last, first', 'said "yes"', '00123']]);
});

test('CSV shape and known header positions fail closed when width or a confirmed label changes', () => {
  const good = createSyntheticCsv();
  assert.equal(Object.keys(KNOWN_HEADERS).length, 7);
  assert.equal(EXPECTED_COLUMN_COUNT, 55);
  assert.throws(() => inspectTallyAdmissionCsv(good.replace('Respondent ID', 'Changed label')),
    error => error.code === 'CSV_KNOWN_HEADER_MISMATCH');
  assert.throws(() => inspectTallyAdmissionCsv('a,b,c\n1,2,3'), error => error.code === 'CSV_HEADER_WIDTH_UNEXPECTED');
  assert.throws(() => parseCsvRows('a,b\n1'), error => error.code === 'CSV_ROW_WIDTH_MISMATCH');
  assert.throws(() => parseCsvRows('a,"unclosed'), error => error.code === 'CSV_QUOTE_UNCLOSED');
});

test('duplicate contact columns distinguish equal, conflicting, empty, and unverified single values', () => {
  assert.deepEqual(reconcileDuplicateColumns('001010', '001010'), { status: 'SAME_VALUE_SOURCE_UNVERIFIED', value: null });
  assert.deepEqual(reconcileDuplicateColumns('010-A', '010-B'), { status: 'CONFLICT', value: null });
  assert.deepEqual(reconcileDuplicateColumns('', ''), { status: 'REQUIRED_VALUE_MISSING', value: null });
  assert.deepEqual(reconcileDuplicateColumns('', '001010'), { status: 'SINGLE_VALUE_SOURCE_UNVERIFIED', value: null });
  assert.deepEqual(reconcileDuplicateColumns('', '001010', { sourceVerified: true }), { status: 'SINGLE_SOURCE_VERIFIED', value: '001010' });
});

test('emergency contact pair uses the same conflict and missing guards as the guardian phone pair', () => {
  const conflict = createSyntheticCsvRow();
  conflict[5] = '001100';
  conflict[54] = '001101';
  assert.equal(inspectTallyAdmissionCsv(createSyntheticCsv([conflict])).rows[0].emergencyPhoneStatus, 'CONFLICT');
  const missing = createSyntheticCsvRow();
  missing[54] = '';
  assert.equal(inspectTallyAdmissionCsv(createSyntheticCsv([missing])).rows[0].emergencyPhoneStatus, 'REQUIRED_VALUE_MISSING');
});

test('consent pair normalization requires verified output semantics and detects duplicate logical consent IDs', () => {
  assert.deepEqual(normalizeConsentPair('yes', 'yes'), { status: 'PENDING_VERIFICATION', accepted: null });
  assert.deepEqual(normalizeConsentPair('yes', 'yes', { verified: true, acceptedTokens: ['yes'], declinedTokens: ['no'] }),
    { status: 'NORMALIZED', accepted: true });
  assert.deepEqual(normalizeConsentPair('yes', 'no', { verified: true, acceptedTokens: ['yes'], declinedTokens: ['no'] }),
    { status: 'CONFLICT', accepted: null });
  assert.deepEqual(normalizeConsentPair('', '', { verified: true, acceptedTokens: ['yes'], declinedTokens: ['no'] }),
    { status: 'MISSING', accepted: null });
  assert.deepEqual(normalizeConsentPairs([{ consentId: 'SYNTHETIC-TERMS', first: 'yes', second: 'yes' }])[0],
    { consentId: 'SYNTHETIC-TERMS', status: 'PENDING_VERIFICATION', accepted: null });
  assert.throws(() => normalizeConsentPairs([
    { consentId: 'SYNTHETIC-DUP', first: '', second: '' }, { consentId: 'SYNTHETIC-DUP', first: '', second: '' }
  ]), error => error.code === 'CONSENT_LOGICAL_ID_DUPLICATE_OR_MISSING');
});

test('CSV consent outputs that differ are held pending semantic verification', () => {
  const row = createSyntheticCsvRow();
  row[40] = 'Synthetic representation A';
  row[41] = 'Synthetic representation B';
  const statuses = inspectTallyAdmissionCsv(createSyntheticCsv([row])).rows[0].contractConsentPairStatuses;
  assert.equal(statuses[0], 'RAW_OUTPUTS_DIFFER_PENDING_SEMANTIC_VERIFICATION');
});

test('optional photo/video consent defaults false, while nonempty values stay pending without verified tokens', () => {
  assert.deepEqual(normalizeOptionalConsentCell(''), { status: 'DEFAULT_FALSE', accepted: false });
  assert.deepEqual(normalizeOptionalConsentCell('yes'), { status: 'PENDING_VERIFICATION', accepted: null });
  assert.deepEqual(normalizeOptionalConsentCell('yes', { verified: true, acceptedTokens: ['yes'], declinedTokens: ['no'] }),
    { status: 'NORMALIZED', accepted: true });
  assert.deepEqual(normalizeOptionalConsentCell('unexpected', { verified: true, acceptedTokens: ['yes'], declinedTokens: ['no'] }),
    { status: 'INVALID_FORMAT', accepted: null });
});

test('signature evidence detects missing and malformed references without returning URL or signer data', () => {
  assert.deepEqual(validateSignatureReference('', ''), { status: 'MISSING' });
  assert.deepEqual(validateSignatureReference('javascript:alert(1)', 'Synthetic Signer'), { status: 'INVALID_FORMAT' });
  const checked = validateSignatureReference('https://synthetic.invalid/a-secret-looking-reference', 'Synthetic Signer');
  assert.deepEqual(checked, { status: 'HTTPS_REFERENCE_FORMAT_ONLY' });
  assert.equal(JSON.stringify(checked).includes('secret-looking'), false);
});

test('synthetic fixture separates CSV structure from webhook format and leaves parasite blanks unexplained', () => {
  const result = inspectTallyAdmissionCsv(createSyntheticCsv());
  assert.equal(result.rows[0].parasitePrevention, 'EMPTY_CAUSE_UNVERIFIED');
  assert.equal(result.webhookFormat, 'PENDING_VERIFICATION');
});
