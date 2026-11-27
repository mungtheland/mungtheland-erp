'use strict';

// Synthetic-only gate for contract testing. It does not call persistence ports.
const MD_PASS_ISSUANCE_PREFLIGHT_V2_STATES_ = ['VALIDATED','PENDING','COMMITTED','NEEDS_REVIEW','FAILED_FINAL'];

function mdPassIssuancePreflightIso_(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function mdPassIssuancePreflightDuplicate_(rows, key) {
  const seen = new Set();
  for (const row of rows) {
    const value = row && row[key];
    if (value === undefined || value === null || value === '') continue;
    if (seen.has(value)) return true;
    seen.add(value);
  }
  return false;
}

function mdPassIssuancePreflightValidateLedgerRows_(rows) {
  if (!Array.isArray(rows)) return { valid: false, reason: 'V2_ROWS_INVALID' };
  const fields = mdPassIssuanceV2Fields_();
  const idFields = ['issuanceRequestId','idempotencyKey','paymentReference','productId','petId','guardianId','passId','sourceChannel','auditReference'];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== fields.length ||
        !fields.every(field => Object.prototype.hasOwnProperty.call(row, field)))
      return { valid: false, reason: 'V2_ROW_SHAPE_INVALID' };
    if (idFields.some(field => typeof row[field] !== 'string' || !row[field] || row[field] !== row[field].trim() || /[\r\n\0]/.test(row[field])) ||
        !Number.isSafeInteger(row.catalogVersion) || row.catalogVersion < 1 ||
        ![8,12,16,20].includes(row.totalUses) || !MD_PASS_ISSUANCE_PREFLIGHT_V2_STATES_.includes(row.issuanceStatus) ||
        !mdPassIssuancePreflightIso_(row.requestedAt) ||
        !(row.committedAt === '' || mdPassIssuancePreflightIso_(row.committedAt)) ||
        !Number.isSafeInteger(row.attemptCount) || row.attemptCount < 1 || typeof row.lastErrorCode !== 'string')
      return { valid: false, reason: 'V2_ROW_TYPE_INVALID' };
  }
  for (const key of ['issuanceRequestId','idempotencyKey','paymentReference','passId'])
    if (mdPassIssuancePreflightDuplicate_(rows, key)) return { valid: false, reason: 'V2_DUPLICATE_' + key.toUpperCase() };
  return { valid: true, reason: 'V2_ROWS_VALID' };
}

function mdPassIssuancePreflightValidatePassRows_(rows) {
  if (!Array.isArray(rows)) return { valid: false, reason: 'PASS_ROWS_INVALID' };
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.passId !== 'string' || !row.passId || typeof row.petId !== 'string' || !row.petId ||
        typeof row.productId !== 'string' || !Number.isSafeInteger(row.totalUses) || row.totalUses < 1 ||
        !Number.isSafeInteger(row.usedUses) || row.usedUses < 0 || !Number.isSafeInteger(row.remainingUses) || row.remainingUses < 0 ||
        row.totalUses !== row.usedUses + row.remainingUses)
      return { valid: false, reason: 'PASS_ROW_INVALID' };
  }
  if (mdPassIssuancePreflightDuplicate_(rows, 'passId')) return { valid: false, reason: 'PASS_ID_DUPLICATE' };
  return { valid: true, reason: 'PASS_ROWS_VALID' };
}

function mdPassIssuancePreflight_(input) {
  const deny = (validationStatus, reason) => ({ validationStatus, reason, plan: null });
  if (!input || input.verification?.mode !== 'SYNTHETIC_FIXTURE' || input.snapshot?.mode !== 'SYNTHETIC_FIXTURE')
    return deny('BLOCKED', 'SYNTHETIC_FIXTURE_REQUIRED');
  const { request, catalog, verification, snapshot, candidatePassId } = input;
  if (!snapshot || snapshot.complete !== true || !Array.isArray(snapshot.v2Headers) ||
      !Array.isArray(snapshot.v2Rows) || !Array.isArray(snapshot.legacyRows) || !Array.isArray(snapshot.passRows))
    return deny('BLOCKED', 'SNAPSHOT_INCOMPLETE');
  if (snapshot.v2SheetName !== mdPassIssuanceV2SheetName_() ||
      snapshot.legacySheetName !== mdPassIssuanceLegacySheetName_() ||
      snapshot.v2SheetName === snapshot.legacySheetName)
    return deny('BLOCKED', 'ISSUANCE_SHEET_NAMES_INVALID');
  const headers = mdPassIssuanceValidateV2Headers_(snapshot.v2Headers);
  if (!headers.valid) return deny('BLOCKED', headers.reason);
  const v2Check = mdPassIssuancePreflightValidateLedgerRows_(snapshot.v2Rows);
  if (!v2Check.valid) return deny('NEEDS_REVIEW', v2Check.reason);
  const passCheck = mdPassIssuancePreflightValidatePassRows_(snapshot.passRows);
  if (!passCheck.valid) return deny('NEEDS_REVIEW', passCheck.reason);

  const legacyRows = snapshot.legacyRows;
  if (mdPassIssuancePreflightDuplicate_(legacyRows, 'issuanceRequestId'))
    return deny('NEEDS_REVIEW', 'LEGACY_REQUEST_ID_DUPLICATE');
  if (mdPassIssuancePreflightDuplicate_(legacyRows, 'passId'))
    return deny('NEEDS_REVIEW', 'LEGACY_PASS_ID_DUPLICATE');
  for (const legacy of legacyRows) {
    if (!legacy || typeof legacy !== 'object' || typeof legacy.passId !== 'string' || !legacy.passId ||
        typeof legacy.petId !== 'string' || !legacy.petId || !Number.isSafeInteger(legacy.totalUses))
      return deny('NEEDS_REVIEW', 'LEGACY_RECORD_INVALID');
    const matches = snapshot.passRows.filter(row => row.passId === legacy.passId);
    if (matches.length !== 1 || matches[0].petId !== legacy.petId || matches[0].totalUses !== legacy.totalUses)
      return deny('NEEDS_REVIEW', 'LEGACY_PASS_LINK_UNVERIFIED');
  }

  const { requestId } = request || {};
  if (typeof requestId === 'string' && (snapshot.v2Rows.some(row => row.issuanceRequestId === requestId) ||
      legacyRows.some(row => row.issuanceRequestId === requestId) ||
      snapshot.passRows.some(row => row.issuanceRequestId === requestId)))
    return deny('NEEDS_REVIEW', 'REQUEST_ID_EXISTS_LOOKUP_REQUIRED');
  if (request && typeof request.paymentReference === 'string' &&
      (snapshot.v2Rows.some(row => row.paymentReference === request.paymentReference) ||
       legacyRows.some(row => row.paymentReference === request.paymentReference) ||
       snapshot.passRows.some(row => row.paymentReference === request.paymentReference)))
    return deny('NEEDS_REVIEW', 'PAYMENT_REFERENCE_DUPLICATE');
  if (typeof candidatePassId !== 'string' || !/^[-A-Za-z0-9._]{1,80}$/.test(candidatePassId))
    return deny('NEEDS_REVIEW', 'CANDIDATE_PASS_ID_INVALID');
  if (snapshot.v2Rows.some(row => row.passId === candidatePassId) ||
      legacyRows.some(row => row.passId === candidatePassId) ||
      snapshot.passRows.some(row => row.passId === candidatePassId))
    return deny('NEEDS_REVIEW', 'PASS_ID_EXISTS');

  if (snapshot.legacyPaymentReferenceCoverage !== 'COMPLETE' ||
      legacyRows.some(row => typeof row.paymentReference !== 'string' || !row.paymentReference) ||
      snapshot.passRows.some(row => typeof row.paymentReference !== 'string' || !row.paymentReference))
    return deny('BLOCKED', 'LEGACY_PAYMENT_REFERENCE_COVERAGE_INCOMPLETE');
  if (snapshot.v2Rows.some(row => row.issuanceStatus !== 'COMMITTED'))
    return deny('NEEDS_REVIEW', 'V2_ISSUANCE_HISTORY_UNRESOLVED');
  for (const issued of snapshot.v2Rows) {
    const matchingPasses = snapshot.passRows.filter(row => row.passId === issued.passId);
    if (matchingPasses.length !== 1 || matchingPasses[0].productId !== issued.productId ||
        matchingPasses[0].petId !== issued.petId || matchingPasses[0].totalUses !== issued.totalUses)
      return deny('NEEDS_REVIEW', 'V2_PASS_PAIR_UNVERIFIED');
  }

  const requestEvidence = verification.requestIdentity;
  if (!requestEvidence || requestEvidence.source !== 'SYNTHETIC_FIXTURE' ||
      requestEvidence.value !== request.requestId || requestEvidence.createdBeforeProcessing !== true ||
      requestEvidence.persistedForRetry !== true || requestEvidence.stableAcrossRetries !== true)
    return deny('NEEDS_REVIEW', 'REQUEST_ID_STABILITY_UNVERIFIED');
  const pet = verification.pet;
  if (!pet || pet.exists !== true || pet.relationshipVerified !== true || pet.source !== 'SYNTHETIC_FIXTURE' ||
      pet.petId !== request.petId || pet.guardianId !== request.guardianId ||
      typeof pet.evidenceRef !== 'string' || !pet.evidenceRef)
    return deny('NEEDS_REVIEW', 'PET_GUARDIAN_LINK_UNVERIFIED');
  const payment = verification.payment;
  if (!payment || payment.source !== 'SYNTHETIC_FIXTURE' || typeof payment.evidenceRef !== 'string' || !payment.evidenceRef)
    return deny('NEEDS_REVIEW', 'PAYMENT_SOURCE_UNVERIFIED');

  const planned = mdBuildPassIssuancePlan_({ request, catalog, verification });
  if (!planned || planned.validationStatus !== 'PLAN_ONLY' || !planned.plan)
    return deny(planned?.validationStatus === 'BLOCKED' ? 'BLOCKED' : 'NEEDS_REVIEW', planned?.reason || 'PLAN_VALIDATION_FAILED');
  const idempotencyKey = planned.plan.idempotencyKey;
  if (snapshot.v2Rows.some(row => row.idempotencyKey === idempotencyKey))
    return deny('NEEDS_REVIEW', 'IDEMPOTENCY_KEY_DUPLICATE');
  if (snapshot.legacyRows.length && snapshot.legacyRows.some(row => !row.paymentReference))
    return deny('BLOCKED', 'LEGACY_PAYMENT_REFERENCE_COVERAGE_INCOMPLETE');
  return {
    validationStatus: 'PLAN_ONLY',
    reason: 'SYNTHETIC_PREFLIGHT_PASSED',
    plan: {
      ...planned.plan,
      proposedPassId: candidatePassId,
      warnings: [...planned.plan.warnings, 'PREFLIGHT_SYNTHETIC_ONLY', 'NOT_PERSISTED', 'LIVE_ISSUANCE_DISABLED']
    }
  };
}

if (typeof module !== 'undefined') module.exports = { mdPassIssuancePreflight_ };
