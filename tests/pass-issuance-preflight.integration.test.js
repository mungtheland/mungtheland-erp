'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { Array, Date, Error, JSON, Map, Math, Number, Object, Set, String };
for (const file of ['src/PassCatalog.js','src/PassIssuancePlan.js','src/PassIssuanceLegacyReader.js',
  'src/PassIssuanceLedger.js','src/PassIssuancePreflight.js']) {
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const baseRequest = {
  requestId: 'REQ-SYNTH-65001', productId: 'SYNTH-PASS-8', catalogVersion: 4,
  petId: 'PET-SYNTH-65001', guardianId: 'GUARD-SYNTH-65001', paymentStatus: 'COMPLETED',
  paymentReference: 'PAY-SYNTH-65001', requestedUses: 8,
  requestedStartDate: '2026-11-27', requestedExpiryDate: '2027-11-27', amount: 80000,
  sourceChannel: 'synthetic-test'
};
const baseProduct = {
  productId: 'SYNTH-PASS-8', productType: 'PASS', displayName: 'Synthetic 8-use pass', totalUses: 8,
  active: true, deductionPolicy: 'REGULAR_PASS', source: 'synthetic fixture',
  approvalStatus: 'APPROVED', version: 4
};
const baseCatalog = { catalogVersion: 4, products: [baseProduct] };
function fixture(overrides = {}) {
  const request = { ...baseRequest, ...(overrides.request || {}) };
  const verification = {
    mode: 'SYNTHETIC_FIXTURE',
    requestIdentity: {
      source: 'SYNTHETIC_FIXTURE', value: request.requestId, createdBeforeProcessing: true,
      persistedForRetry: true, stableAcrossRetries: true
    },
    pet: {
      exists: true, petId: request.petId, guardianId: request.guardianId, relationshipVerified: true,
      source: 'SYNTHETIC_FIXTURE', evidenceRef: 'PET-LINK-SYNTH-65001'
    },
    payment: {
      verified: true, status: 'COMPLETED', reference: request.paymentReference, amount: request.amount,
      source: 'SYNTHETIC_FIXTURE', evidenceRef: 'PAYMENT-RECEIPT-SYNTH-65001'
    },
    issuanceHistory: {
      complete: true, issuanceLedgerStatus: 'KNOWN_EMPTY_OR_COMPLETE', requestIdStatus: 'NOT_FOUND',
      paymentReferenceStatus: 'NOT_FOUND'
    },
    ...(overrides.verification || {})
  };
  const snapshot = {
    mode: 'SYNTHETIC_FIXTURE', complete: true,
    v2SheetName: context.mdPassIssuanceV2SheetName_(),
    legacySheetName: context.mdPassIssuanceLegacySheetName_(),
    v2Headers: context.mdPassIssuanceV2Headers_(), v2Rows: [], legacyRows: [], passRows: [],
    legacyPaymentReferenceCoverage: 'COMPLETE', ...(overrides.snapshot || {})
  };
  return {
    request, catalog: overrides.catalog || baseCatalog, verification, snapshot,
    candidatePassId: 'PASS-SYNTH-65001', ...Object.fromEntries(Object.entries(overrides).filter(([key]) =>
      !['request','catalog','verification','snapshot'].includes(key)))
  };
}
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
function gate(input = fixture()) { return context.mdPassIssuancePreflight_(input); }
function committedRow(overrides = {}) {
  return {
    issuanceRequestId: 'REQ-SYNTH-OLD-1', idempotencyKey: 'PASS-ISSUE:v4:REQ-SYNTH-OLD-1',
    paymentReference: 'PAY-SYNTH-OLD-1', productId: 'SYNTH-PASS-8', catalogVersion: 4,
    petId: 'PET-SYNTH-OLD-1', guardianId: 'GUARD-SYNTH-OLD-1', passId: 'PASS-SYNTH-OLD-1',
    totalUses: 8, issuanceStatus: 'COMMITTED', requestedAt: '2026-11-27T00:00:00.000Z',
    committedAt: '2026-11-27T00:00:01.000Z', attemptCount: 1, lastErrorCode: '',
    sourceChannel: 'synthetic-test', auditReference: 'AUDIT-SYNTH-OLD-1', ...overrides
  };
}
function passRow(overrides = {}) {
  return {
    passId: 'PASS-SYNTH-OLD-1', petId: 'PET-SYNTH-OLD-1', productId: 'SYNTH-PASS-8',
    totalUses: 8, usedUses: 0, remainingUses: 8, paymentReference: 'PAY-SYNTH-OLD-1',
    ...overrides
  };
}

test('V2 ledger name is distinct from the immutable legacy name and headers are ordered', () => {
  assert.equal(context.mdPassIssuanceV2SheetName_(), '_이용권발급원장V2');
  assert.equal(context.mdPassIssuanceLegacySheetName_(), '_이용권발급이력');
  assert.notEqual(context.mdPassIssuanceV2SheetName_(), context.mdPassIssuanceLegacySheetName_());
  assert.equal(context.mdPassIssuanceValidateV2Headers_(context.mdPassIssuanceV2Headers_()).valid, true);
  assert.equal(context.mdPassIssuanceV2Headers_().length, 16);
});

test('V2 schema rejects reordered, missing, duplicate and extra headers', () => {
  const headers = context.mdPassIssuanceV2Headers_();
  assert.equal(context.mdPassIssuanceValidateV2Headers_([...headers].reverse()).reason, 'V2_SCHEMA_MISMATCH');
  assert.equal(context.mdPassIssuanceValidateV2Headers_(headers.slice(0, 15)).reason, 'V2_SCHEMA_MISMATCH');
  assert.equal(context.mdPassIssuanceValidateV2Headers_([...headers.slice(0, 15), headers[0]]).reason, 'V2_HEADERS_DUPLICATE');
  assert.equal(context.mdPassIssuanceValidateV2Headers_([...headers, 'unexpected']).reason, 'V2_SCHEMA_MISMATCH');
});

test('valid synthetic evidence returns PLAN_ONLY and a retry-stable idempotency key', () => {
  const input = fixture();
  const first = gate(input), second = gate(input);
  assert.equal(first.validationStatus, 'PLAN_ONLY');
  assert.equal(first.reason, 'SYNTHETIC_PREFLIGHT_PASSED');
  assert.equal(first.plan.proposedPassId, 'PASS-SYNTH-65001');
  assert.equal(first.plan.idempotencyKey, 'PASS-ISSUE:v4:REQ-SYNTH-65001');
  assert.equal(first.plan.idempotencyKey, second.plan.idempotencyKey);
  assert.ok(first.plan.warnings.includes('LIVE_ISSUANCE_DISABLED'));
  assert.equal(first.plan.totalUses, 8);
});

test('non-synthetic evidence cannot enter the issuance preflight', () => {
  assert.equal(gate(fixture({ verification: { mode: 'LIVE' } })).validationStatus, 'BLOCKED');
  assert.equal(gate(fixture({ snapshot: { mode: 'LIVE' } })).validationStatus, 'BLOCKED');
});

test('missing, colliding or unconfirmed V2 sheet names and snapshots block', () => {
  assert.equal(gate(fixture({ snapshot: { complete: false } })).reason, 'SNAPSHOT_INCOMPLETE');
  assert.equal(gate(fixture({ snapshot: { v2SheetName: '_이용권발급이력' } })).reason, 'ISSUANCE_SHEET_NAMES_INVALID');
  assert.equal(gate(fixture({ snapshot: { v2Headers: [] } })).reason, 'V2_SCHEMA_MISMATCH');
});

test('malformed V2 rows and type errors require review', () => {
  assert.equal(gate(fixture({ snapshot: { v2Rows: [{}] } })).reason, 'V2_ROW_SHAPE_INVALID');
  assert.equal(gate(fixture({ snapshot: { v2Rows: [committedRow({ totalUses: '8' })] } })).reason, 'V2_ROW_TYPE_INVALID');
});

test('duplicate V2 request, idempotency, payment and pass keys require review', () => {
  const duplicateCases = [
    { issuanceRequestId: 'REQ-SYNTH-65001' },
    { idempotencyKey: 'PASS-ISSUE:v4:REQ-SYNTH-65001' },
    { paymentReference: 'PAY-SYNTH-65001' },
    { passId: 'PASS-SYNTH-65001' }
  ];
  for (const keyPatch of duplicateCases) {
    const row = committedRow({ ...keyPatch, passId: keyPatch.passId || 'PASS-SYNTH-OLD-1' });
    const result = gate(fixture({ snapshot: { v2Rows: [row], passRows: [passRow()] } }));
    assert.notEqual(result.validationStatus, 'PLAN_ONLY');
  }
});

test('an unresolved V2 record or a mismatched V2-to-pass pair needs review', () => {
  assert.equal(gate(fixture({ snapshot: { v2Rows: [committedRow({ issuanceStatus: 'PENDING' })], passRows: [passRow()] } })).reason,
    'V2_ISSUANCE_HISTORY_UNRESOLVED');
  assert.equal(gate(fixture({ snapshot: { v2Rows: [committedRow()], passRows: [passRow({ totalUses: 12, remainingUses: 12 })] } })).reason,
    'V2_PASS_PAIR_UNVERIFIED');
});

test('duplicate and malformed existing pass IDs are blocked', () => {
  assert.equal(gate(fixture({ snapshot: { passRows: [passRow(), passRow()] } })).reason, 'PASS_ID_DUPLICATE');
  assert.equal(gate(fixture({ snapshot: { passRows: [{ passId: 'P', petId: 'D', productId: 'SKU', totalUses: 8, usedUses: 1, remainingUses: 2 }] } })).reason,
    'PASS_ROW_INVALID');
});

test('request IDs already in V2, legacy or pass history are never planned as new', () => {
  assert.equal(gate(fixture({ snapshot: { v2Rows: [committedRow({ issuanceRequestId: 'REQ-SYNTH-65001' })], passRows: [passRow()] } })).reason,
    'REQUEST_ID_EXISTS_LOOKUP_REQUIRED');
  const linkedLegacy = { issuanceRequestId: 'REQ-SYNTH-65001', passId: 'PASS-SYNTH-OLD-1', petId: 'PET-SYNTH-OLD-1', totalUses: 8, paymentReference: null };
  assert.equal(gate(fixture({ snapshot: { legacyRows: [linkedLegacy], passRows: [passRow()] } })).reason,
    'REQUEST_ID_EXISTS_LOOKUP_REQUIRED');
  assert.equal(gate(fixture({ snapshot: { passRows: [passRow({ issuanceRequestId: 'REQ-SYNTH-65001' })] } })).reason,
    'REQUEST_ID_EXISTS_LOOKUP_REQUIRED');
});

test('legacy request/pass duplicates and broken legacy links require review', () => {
  const item = { issuanceRequestId: 'REQ-LEGACY-1', passId: 'PASS-LEGACY-1', petId: 'PET-LEGACY-1', totalUses: 8, paymentReference: null };
  assert.equal(gate(fixture({ snapshot: { legacyRows: [item, { ...item }], passRows: [passRow({ passId: item.passId, petId: item.petId })] } })).reason,
    'LEGACY_REQUEST_ID_DUPLICATE');
  assert.equal(gate(fixture({ snapshot: { legacyRows: [item], passRows: [] } })).reason, 'LEGACY_PASS_LINK_UNVERIFIED');
});

test('legacy pass ID collision blocks and unknown old payment references block all new planning', () => {
  const item = { issuanceRequestId: 'REQ-LEGACY-1', passId: 'PASS-SYNTH-65001', petId: 'PET-LEGACY-1', totalUses: 8, paymentReference: null };
  assert.equal(gate(fixture({ snapshot: { legacyRows: [item], passRows: [passRow({ passId: item.passId, petId: item.petId })] } })).reason,
    'PASS_ID_EXISTS');
  assert.equal(gate(fixture({ snapshot: { legacyPaymentReferenceCoverage: 'INCOMPLETE' } })).reason,
    'LEGACY_PAYMENT_REFERENCE_COVERAGE_INCOMPLETE');
  assert.equal(gate(fixture({ snapshot: { legacyRows: [{ issuanceRequestId: 'R', passId: 'P', petId: 'D', totalUses: 8, paymentReference: null }],
    passRows: [passRow({ passId: 'P', petId: 'D' })] } })).reason, 'LEGACY_PAYMENT_REFERENCE_COVERAGE_INCOMPLETE');
});

test('duplicate payment reference in V2, legacy or pass evidence is blocked', () => {
  const v2 = committedRow({ paymentReference: 'PAY-SYNTH-65001' });
  assert.equal(gate(fixture({ snapshot: { v2Rows: [v2], passRows: [passRow()] } })).reason, 'PAYMENT_REFERENCE_DUPLICATE');
  const legacy = { issuanceRequestId: 'REQ-LEGACY-1', passId: 'PASS-LEGACY-1', petId: 'PET-LEGACY-1',
    totalUses: 8, paymentReference: 'PAY-SYNTH-65001' };
  assert.equal(gate(fixture({ snapshot: { legacyRows: [legacy], passRows: [passRow({ passId: legacy.passId, petId: legacy.petId, paymentReference: legacy.paymentReference })] } })).reason,
    'PAYMENT_REFERENCE_DUPLICATE');
});

test('candidate pass ID collisions and malformed IDs do not produce plans', () => {
  assert.equal(gate(fixture({ candidatePassId: 'bad id' })).reason, 'CANDIDATE_PASS_ID_INVALID');
  assert.equal(gate(fixture({ snapshot: { passRows: [passRow({ passId: 'PASS-SYNTH-65001' })] } })).reason, 'PASS_ID_EXISTS');
});

test('incomplete retry-stable request ID evidence requires review', () => {
  assert.equal(gate(fixture({ verification: { requestIdentity: { source: 'SYNTHETIC_FIXTURE', value: 'REQ-SYNTH-65001',
    createdBeforeProcessing: true, persistedForRetry: true, stableAcrossRetries: false } } })).reason,
    'REQUEST_ID_STABILITY_UNVERIFIED');
});

test('pet and guardian relation requires exact linked IDs and evidence', () => {
  assert.equal(gate(fixture({ verification: { pet: { exists: true, petId: 'PET-OTHER', guardianId: 'GUARD-SYNTH-65001',
    relationshipVerified: true, source: 'SYNTHETIC_FIXTURE', evidenceRef: 'PET-LINK-SYNTH' } } })).reason,
    'PET_GUARDIAN_LINK_UNVERIFIED');
  assert.equal(gate(fixture({ verification: { pet: { exists: true, petId: 'PET-SYNTH-65001', guardianId: 'GUARD-SYNTH-65001',
    relationshipVerified: false, source: 'SYNTHETIC_FIXTURE', evidenceRef: 'PET-LINK-SYNTH' } } })).reason,
    'PET_GUARDIAN_LINK_UNVERIFIED');
});

test('payment source, reference, completion and exact amount evidence are mandatory', () => {
  assert.equal(gate(fixture({ verification: { payment: { verified: true, status: 'COMPLETED', reference: 'PAY-SYNTH-65001', amount: 80000 } } })).reason,
    'PAYMENT_SOURCE_UNVERIFIED');
  assert.equal(gate(fixture({ verification: { payment: { verified: true, status: 'PENDING', reference: 'PAY-SYNTH-65001', amount: 80000,
    source: 'SYNTHETIC_FIXTURE', evidenceRef: 'PAYMENT-RECEIPT-SYNTH' } } })).reason, 'PAYMENT_EVIDENCE_MISMATCH');
  assert.equal(gate(fixture({ request: { paymentStatus: 'PENDING' } })).validationStatus, 'NEEDS_REVIEW');
});

test('unapproved, draft, unknown, daily and hotel products cannot produce recurring issuance plans', () => {
  assert.equal(gate(fixture({ catalog: { catalogVersion: 4, products: [{ ...baseProduct, approvalStatus: 'DRAFT' }] } })).validationStatus,
    'NEEDS_REVIEW');
  assert.equal(gate(fixture({ catalog: { catalogVersion: 4, products: [{ ...baseProduct, productType: 'TEST_ONLY', totalUses: null,
    deductionPolicy: 'NOT_APPLICABLE' }] } })).validationStatus, 'BLOCKED');
  for (const productType of ['DAYCARE_DAILY','HOTEL']) {
    const result = gate(fixture({ catalog: { catalogVersion: 4, products: [{ ...baseProduct, productType, totalUses: null,
      deductionPolicy: 'NOT_APPLICABLE' }] } }));
    assert.equal(result.validationStatus, 'NEEDS_REVIEW');
  }
  assert.equal(gate(fixture({ request: { productId: 'UNKNOWN-PRODUCT' } })).validationStatus, 'NEEDS_REVIEW');
});

test('catalog total, version and date errors cannot produce plans', () => {
  assert.equal(gate(fixture({ request: { catalogVersion: 5 } })).validationStatus, 'BLOCKED');
  assert.equal(gate(fixture({ request: { requestedUses: 12 } })).validationStatus, 'NEEDS_REVIEW');
  assert.equal(gate(fixture({ request: { requestedStartDate: '2026-02-30' } })).validationStatus, 'NEEDS_REVIEW');
});

test('request history lookup conflicts are blocked by the existing plan validator', () => {
  const result = gate(fixture({ verification: { issuanceHistory: { complete: true, issuanceLedgerStatus: 'KNOWN_EMPTY_OR_COMPLETE',
    requestIdStatus: 'FOUND', requestIdPaymentReference: 'PAY-SYNTH-65001', paymentReferenceStatus: 'FOUND' } } }));
  assert.equal(result.validationStatus, 'NEEDS_REVIEW');
});

console.log('PASS: ' + passed + ' synthetic issuance preflight contract checks; no storage ports invoked.');
