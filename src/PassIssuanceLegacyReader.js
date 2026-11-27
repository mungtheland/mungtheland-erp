'use strict';

// Read-only compatibility boundary for the existing 13-column issuance tab.
// This module has no Apps Script, Sheets, Firestore, or write-port dependency.
const MD_PASS_ISSUANCE_LEGACY_SHEET_ = '_이용권발급이력';
const MD_PASS_ISSUANCE_LEGACY_HEADERS_ = Object.freeze([
  '발급 요청 ID', '이용권 ID', '반려견 ID', '이용권 횟수', '시작일', '만료일',
  '판매금액', '할인금액', '결제금액', '결제수단', '승인 담당자', '승인일시', '처리상태'
]);

function mdPassIssuanceLegacyValidateHeaders_(headers) {
  if (!Array.isArray(headers)) return { valid: false, reason: 'LEGACY_HEADERS_INVALID' };
  if (new Set(headers).size !== headers.length) return { valid: false, reason: 'LEGACY_HEADERS_DUPLICATE' };
  if (headers.length !== MD_PASS_ISSUANCE_LEGACY_HEADERS_.length ||
      MD_PASS_ISSUANCE_LEGACY_HEADERS_.some((header, index) => headers[index] !== header)) {
    return { valid: false, reason: 'LEGACY_SCHEMA_MISMATCH' };
  }
  return { valid: true, reason: 'LEGACY_SCHEMA_V1' };
}

function mdPassIssuanceLegacyReadRows_(headers, rows, options) {
  const validation = mdPassIssuanceLegacyValidateHeaders_(headers);
  if (!validation.valid) throw Error(validation.reason);
  if (!Array.isArray(rows)) throw Error('LEGACY_ROWS_INVALID');
  const sourceSheet = options && options.sourceSheet || MD_PASS_ISSUANCE_LEGACY_SHEET_;
  const firstDataRow = options && Number.isInteger(options.firstDataRow) ? options.firstDataRow : 2;
  const output = [];
  rows.forEach((row, index) => {
    if (!Array.isArray(row)) throw Error('LEGACY_ROW_INVALID');
    if (row.every(value => value === '' || value === null || value === undefined)) return;
    if (row.length !== MD_PASS_ISSUANCE_LEGACY_HEADERS_.length) throw Error('LEGACY_ROW_WIDTH_MISMATCH');
    output.push({
      source: { sheet: sourceSheet, rowNumber: firstDataRow + index, schema: 'LEGACY_13_V1' },
      issuanceRequestId: row[0] === '' || row[0] == null ? null : row[0],
      passId: row[1] === '' || row[1] == null ? null : row[1],
      petId: row[2] === '' || row[2] == null ? null : row[2],
      totalUses: row[3] === '' || row[3] == null ? null : row[3],
      productId: null,
      catalogVersion: null,
      guardianId: null,
      idempotencyKey: null,
      paymentReference: null,
      issuanceStatus: 'UNKNOWN',
      requestedAt: null,
      committedAt: null,
      attemptCount: null,
      lastErrorCode: null,
      sourceChannel: null,
      auditReference: null,
      legacy: {
        startDate: row[4], expiryDate: row[5], saleAmount: row[6], discountAmount: row[7],
        paymentAmount: row[8], paymentMethod: row[9], approverPresent: row[10] !== '' && row[10] != null,
        approvedAt: row[11], status: row[12]
      }
    });
  });
  return output;
}

// Legacy rows have no payment reference or product ID. An absent exact pass ID
// therefore cannot establish NO_MATCH or approve a new issuance plan.
function mdPassIssuanceLegacyConflict_(legacyRows, plan) {
  if (!Array.isArray(legacyRows) || !plan || typeof plan !== 'object')
    return { status: 'NEEDS_REVIEW', reason: 'LEGACY_COMPARISON_INVALID' };
  const duplicateRequestIds = new Set();
  const seenRequestIds = new Set();
  legacyRows.forEach(row => {
    if (!row || row.issuanceRequestId === null || row.issuanceRequestId === undefined || row.issuanceRequestId === '') return;
    if (seenRequestIds.has(row.issuanceRequestId)) duplicateRequestIds.add(row.issuanceRequestId);
    seenRequestIds.add(row.issuanceRequestId);
  });
  if (duplicateRequestIds.size) return { status: 'DUPLICATE', reason: 'LEGACY_REQUEST_ID_DUPLICATE' };
  const duplicatePassIds = new Set();
  const seenPassIds = new Set();
  legacyRows.forEach(row => {
    if (!row || row.passId === null || row.passId === undefined || row.passId === '') return;
    if (seenPassIds.has(row.passId)) duplicatePassIds.add(row.passId);
    seenPassIds.add(row.passId);
  });
  if (duplicatePassIds.size) return { status: 'DUPLICATE', reason: 'LEGACY_PASS_ID_DUPLICATE' };
  if (!plan.passId) return { status: 'UNKNOWN', reason: 'PLAN_PASS_ID_MISSING' };
  const matches = legacyRows.filter(row => row && row.passId === plan.passId);
  if (matches.length > 1) return { status: 'DUPLICATE', reason: 'LEGACY_PASS_ID_DUPLICATE' };
  if (matches.length === 1) {
    const legacy = matches[0];
    if ((plan.petId != null && legacy.petId !== plan.petId) ||
        (plan.totalUses != null && legacy.totalUses !== plan.totalUses)) {
      return { status: 'MISMATCH', reason: 'LEGACY_PASS_FIELDS_DIFFER' };
    }
    if ((legacy.productId && plan.productId && legacy.productId !== plan.productId) ||
        (legacy.paymentReference && plan.paymentReference && legacy.paymentReference !== plan.paymentReference))
      return { status: 'MISMATCH', reason: 'LEGACY_PRODUCT_OR_PAYMENT_DIFFERS' };
    if (!legacy.productId || !legacy.paymentReference || !plan.productId || !plan.paymentReference)
      return { status: 'NEEDS_REVIEW', reason: 'LEGACY_IDENTITY_EVIDENCE_MISSING' };
    return { status: 'MATCH', reason: 'EXACT_LEGACY_IDENTITY_MATCH' };
  }
  if (!plan.paymentReference || legacyRows.some(row => !row || !row.paymentReference))
    return { status: 'UNKNOWN', reason: 'LEGACY_PAYMENT_REFERENCE_UNAVAILABLE' };
  const paymentMatches = legacyRows.filter(row => row.paymentReference === plan.paymentReference);
  if (paymentMatches.length > 1) return { status: 'DUPLICATE', reason: 'LEGACY_PAYMENT_REFERENCE_DUPLICATE' };
  if (paymentMatches.length === 1) return { status: 'NEEDS_REVIEW', reason: 'PAYMENT_MATCH_WITHOUT_PASS_ID' };
  return { status: 'NO_MATCH', reason: 'EXACT_IDENTIFIERS_NOT_FOUND' };
}
