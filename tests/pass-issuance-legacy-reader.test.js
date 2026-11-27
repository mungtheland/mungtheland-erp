'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { Array, Number, Set, Error, Object };
vm.runInNewContext(fs.readFileSync('src/PassIssuanceLegacyReader.js', 'utf8'), context,
  { filename: 'src/PassIssuanceLegacyReader.js' });
const headers = [
  '발급 요청 ID', '이용권 ID', '반려견 ID', '이용권 횟수', '시작일', '만료일',
  '판매금액', '할인금액', '결제금액', '결제수단', '승인 담당자', '승인일시', '처리상태'
];
const row = (overrides = {}) => Object.assign([
  'ISSUE-SYNTH-1', 'PASS-SYNTH-1', 'PET-SYNTH-1', 8, '2026-01-01', '2026-12-31',
  80000, 0, 80000, 'CARD', 'SYNTH-APPROVER', '2026-01-01T00:00:00Z', '완료'
], overrides);
const read = (rows, source = {}) => context.mdPassIssuanceLegacyReadRows_(headers, rows, source);
let passed = 0;
function test(name, run) {
  run();
  passed++;
  console.log('PASS ' + name);
}

test('accepts only the exact ordered 13-column legacy header', () => {
  assert.equal(context.mdPassIssuanceLegacyValidateHeaders_(headers).valid, true);
  assert.equal(context.mdPassIssuanceLegacyValidateHeaders_([...headers].reverse()).reason, 'LEGACY_SCHEMA_MISMATCH');
  assert.equal(context.mdPassIssuanceLegacyValidateHeaders_(headers.slice(0, 12)).reason, 'LEGACY_SCHEMA_MISMATCH');
  assert.equal(context.mdPassIssuanceLegacyValidateHeaders_([...headers.slice(0, 12), headers[0]]).reason, 'LEGACY_HEADERS_DUPLICATE');
});

test('empty data maps to an empty read-only snapshot', () => {
  assert.equal(read([]).length, 0);
});

test('normalizes three synthetic legacy rows without inventing missing identity fields', () => {
  const records = read([row(), row({ 0: 'ISSUE-SYNTH-2', 1: 'PASS-SYNTH-2' }),
    row({ 0: 'ISSUE-SYNTH-3', 1: 'PASS-SYNTH-3' })]);
  assert.equal(records.length, 3);
  for (const record of records) {
    assert.equal(record.source.schema, 'LEGACY_13_V1');
    assert.equal(record.productId, null);
    assert.equal(record.paymentReference, null);
    assert.equal(record.idempotencyKey, null);
    assert.equal(record.catalogVersion, null);
    assert.equal(record.guardianId, null);
    assert.equal(record.issuanceStatus, 'UNKNOWN');
  }
});

test('preserves exact legacy IDs and the original source row location', () => {
  const record = read([row()], { sourceSheet: '_이용권발급이력', firstDataRow: 7 })[0];
  assert.equal(record.issuanceRequestId, 'ISSUE-SYNTH-1');
  assert.equal(record.passId, 'PASS-SYNTH-1');
  assert.equal(record.petId, 'PET-SYNTH-1');
  assert.equal(record.totalUses, 8);
  assert.equal(record.source.sheet, '_이용권발급이력');
  assert.equal(record.source.rowNumber, 7);
  assert.equal(record.source.schema, 'LEGACY_13_V1');
});

test('does not reinterpret legacy approval time and status as commit fields', () => {
  const record = read([row()])[0];
  assert.equal(record.legacy.approvedAt, '2026-01-01T00:00:00Z');
  assert.equal(record.legacy.status, '완료');
  assert.equal(record.legacy.approverPresent, true);
  assert.equal(Object.hasOwn(record.legacy, 'approver'), false);
  assert.equal(record.requestedAt, null);
  assert.equal(record.committedAt, null);
});

test('skips blank rows but retains their effect on original row numbering', () => {
  const records = read([row(), Array(13).fill(''), row({ 0: 'ISSUE-SYNTH-2' })]);
  assert.equal(records.length, 2);
  assert.equal(records[1].source.rowNumber, 4);
});

test('rejects nonempty rows with missing or extra cells', () => {
  assert.throws(() => read([row().slice(0, 12)]), /LEGACY_ROW_WIDTH_MISMATCH/);
  assert.throws(() => read([[...row(), 'extra']]), /LEGACY_ROW_WIDTH_MISMATCH/);
});

test('distinguishes the legacy 13-column contract from the new 16-column contract', () => {
  assert.equal(context.mdPassIssuanceLegacyValidateHeaders_(headers).valid, true);
  assert.equal(context.mdPassIssuanceLegacyValidateHeaders_([...headers, 'extra', 'extra-2', 'extra-3']).reason,
    'LEGACY_SCHEMA_MISMATCH');
});

test('duplicate legacy pass links are classified as DUPLICATE', () => {
  const record = read([row()])[0];
  assert.equal(context.mdPassIssuanceLegacyConflict_([record, record], {
    passId: 'PASS-SYNTH-1', petId: 'PET-SYNTH-1', totalUses: 8
  }).status, 'DUPLICATE');
});

test('duplicate legacy request IDs are classified as DUPLICATE', () => {
  const first = read([row()])[0];
  const second = read([row({ 1: 'PASS-SYNTH-2' })])[0];
  assert.equal(context.mdPassIssuanceLegacyConflict_([first, second], {
    passId: 'PASS-SYNTH-1', petId: 'PET-SYNTH-1', totalUses: 8
  }).status, 'DUPLICATE');
});

test('an exact pass ID with matching pet and uses still needs review without product/payment evidence', () => {
  const record = read([row()])[0];
  const result = context.mdPassIssuanceLegacyConflict_([record], {
    passId: 'PASS-SYNTH-1', petId: 'PET-SYNTH-1', totalUses: 8,
    productId: 'PASS-SYNTH-8', paymentReference: 'PAY-SYNTH-1'
  });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.equal(result.reason, 'LEGACY_IDENTITY_EVIDENCE_MISSING');
});

test('exact pass ID with a different pet or use count is MISMATCH', () => {
  const record = read([row()])[0];
  assert.equal(context.mdPassIssuanceLegacyConflict_([record], {
    passId: 'PASS-SYNTH-1', petId: 'PET-SYNTH-OTHER', totalUses: 8
  }).status, 'MISMATCH');
  assert.equal(context.mdPassIssuanceLegacyConflict_([record], {
    passId: 'PASS-SYNTH-1', petId: 'PET-SYNTH-1', totalUses: 12
  }).status, 'MISMATCH');
});

test('known product mismatch is blocked even when other legacy evidence is missing', () => {
  const record = Object.assign({}, read([row()])[0], { productId: 'PASS-SYNTH-8' });
  const result = context.mdPassIssuanceLegacyConflict_([record], {
    passId: 'PASS-SYNTH-1', petId: 'PET-SYNTH-1', totalUses: 8, productId: 'PASS-SYNTH-12'
  });
  assert.equal(result.status, 'MISMATCH');
});

test('does not infer NO_MATCH when exact legacy payment references are unavailable', () => {
  const record = read([row()])[0];
  assert.equal(context.mdPassIssuanceLegacyConflict_([record], {
    passId: 'PASS-SYNTH-OTHER', petId: 'PET-SYNTH-1', totalUses: 8,
    productId: 'PASS-SYNTH-8', paymentReference: 'PAY-SYNTH-1'
  }).status, 'UNKNOWN');
  assert.equal(context.mdPassIssuanceLegacyConflict_([record], {
    petId: 'PET-SYNTH-1', totalUses: 8
  }).status, 'UNKNOWN');
});

test('validates comparison input without exposing fixture values', () => {
  assert.equal(context.mdPassIssuanceLegacyConflict_(null, {}).status, 'NEEDS_REVIEW');
  assert.equal(context.mdPassIssuanceLegacyConflict_([], {}).status, 'UNKNOWN');
});

console.log('PASS: ' + passed + ' legacy issuance reader contract checks; synthetic fixtures only.');
