'use strict';

const { createHmac } = require('node:crypto');
const { HEADER_MANIFEST } = require('./tally-admission-sheets.manifest');

const SHEET_ID = HEADER_MANIFEST.spreadsheetId;
const TAB_NAME = HEADER_MANIFEST.tabName;
const EXPECTED_COLUMN_COUNT = HEADER_MANIFEST.columnCount;
const SOURCE_COLUMN_RANGES = Object.freeze({
  submission: [0, 2], guardian: [3, 6], dog: [7, 14], behaviour: [15, 26],
  health: [27, 35], cautions: [36, 37], consents: [38, 47], photoVideo: [48, 48],
  signature: [49, 49], signer: [50, 50]
});

function sheetsError(code) { const error = new Error(code); error.code = code; return error; }
function isNonEmpty(value) { return value !== null && value !== undefined && String(value).trim() !== ''; }

function reconcileDuplicateColumns(first, second, { sourceVerified = false } = {}) {
  const a = typeof first === 'string' ? first : '';
  const b = typeof second === 'string' ? second : '';
  if (!a && !b) return { status: 'REQUIRED_VALUE_MISSING', value: null };
  if (a && b && a !== b) return { status: 'CONFLICT', value: null };
  if (!sourceVerified) return { status: a && b ? 'SAME_VALUE_SOURCE_UNVERIFIED' : 'SINGLE_VALUE_SOURCE_UNVERIFIED', value: null };
  return { status: a && b ? 'MATCHED' : 'SINGLE_SOURCE_VERIFIED', value: a || b };
}

function validateSignatureReference(reference, signerName) {
  if (typeof reference !== 'string' || !reference.trim() || typeof signerName !== 'string' || !signerName.trim()) return { status: 'MISSING' };
  try {
    const parsed = new URL(reference);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return { status: 'INVALID_FORMAT' };
    return { status: 'HTTPS_REFERENCE_FORMAT_ONLY' };
  } catch (_) { return { status: 'INVALID_FORMAT' }; }
}

function validateHeaderManifest(headers, manifest) {
  if (!Array.isArray(headers) || headers.length !== EXPECTED_COLUMN_COUNT ||
      !Array.isArray(manifest) || manifest.length !== EXPECTED_COLUMN_COUNT) {
    throw sheetsError('SHEETS_INTAKE_SCHEMA_PENDING');
  }
  const seen = new Set();
  for (let i = 0; i < EXPECTED_COLUMN_COUNT; i++) {
    if (typeof headers[i] !== 'string' || !headers[i].trim() || headers[i] !== manifest[i] || seen.has(headers[i])) {
      throw sheetsError('SHEETS_INTAKE_HEADER_MISMATCH');
    }
    seen.add(headers[i]);
  }
  return true;
}

function normalizeSheetRow(headers, row, config = {}) {
  validateHeaderManifest(headers, config.expectedHeaders);
  if (!Array.isArray(row) || row.length !== EXPECTED_COLUMN_COUNT) throw sheetsError('SHEETS_INTAKE_ROW_WIDTH');
  if (typeof config.fingerprintKey !== 'string' || Buffer.byteLength(config.fingerprintKey, 'utf8') < 32) {
    throw sheetsError('SHEETS_INTAKE_FINGERPRINT_KEY_REQUIRED');
  }
  const bindings = config.bindings;
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) throw sheetsError('SHEETS_INTAKE_BINDINGS_PENDING');

  const byField = {};
  const usedIndexes = new Set();
  for (const [field, binding] of Object.entries(bindings)) {
    if (!binding || !Number.isInteger(binding.index) || binding.index < 0 || binding.index >= EXPECTED_COLUMN_COUNT ||
        binding.header !== headers[binding.index] || usedIndexes.has(binding.index) || binding.verified !== true) {
      throw sheetsError('SHEETS_INTAKE_BINDING_UNVERIFIED');
    }
    usedIndexes.add(binding.index);
    byField[field] = row[binding.index] == null ? '' : String(row[binding.index]);
  }
  const requiredFields = Array.isArray(config.requiredFields) ? config.requiredFields : [];
  const missing = requiredFields.filter(field => !isNonEmpty(byField[field]));
  const submissionId = byField.submissionId;
  if (!isNonEmpty(submissionId)) missing.push('submissionId');

  const safeData = Object.fromEntries(Object.entries(byField).filter(([key]) =>
    !['submissionId', 'respondentId', 'submittedAt', 'signatureReference', 'signerName'].includes(key)));
  const result = {
    source: 'TALLY_GOOGLE_SHEETS',
    sourceStatus: 'PENDING_VERIFICATION',
    submissionId: isNonEmpty(submissionId) ? submissionId : null,
    sourceFingerprint: createHmac('sha256', config.fingerprintKey).update(JSON.stringify(row)).digest('hex'),
    respondentId: byField.respondentId || null,
    submittedAt: byField.submittedAt || null,
    data: safeData,
    missingRequiredFields: [...new Set(missing)],
    status: 'NEEDS_REVIEW',
    photoVideoConsent: normalizeOptionalBoolean(byField.photoVideoConsent),
    marketingConsent: { status: 'NOT_PRESENT_DEFAULT_FALSE', accepted: false },
    signature: validateSignatureReference(byField.signatureReference || '', byField.signerName || ''),
    signerNamePresent: isNonEmpty(byField.signerName),
    contractConsent: 'PENDING_VERIFICATION',
    privacyNoticeConsent: 'PENDING_VERIFICATION',
    conditionalDetails: 'PENDING_VERIFICATION',
    guardianAutoLink: 'BLOCKED_UNTIL_FIRST_VISIT_IDENTITY_CHECK',
    approvalTransition: 'BLOCKED',
    contractedTransition: 'BLOCKED'
  };

  if (config.conditionalRulesStatus === 'VERIFIED_FROM_TALLY_CONFIGURATION' && Array.isArray(config.conditionalRules)) {
    for (const rule of config.conditionalRules) {
      if (!rule || typeof rule.controllerField !== 'string' || typeof rule.equals !== 'string' ||
          typeof rule.detailField !== 'string' || !byField[rule.controllerField]) continue;
      if (byField[rule.controllerField] === rule.equals && !isNonEmpty(byField[rule.detailField])) {
        result.missingRequiredFields.push(rule.detailField);
        result.status = 'NEEDS_REVIEW';
      }
    }
    result.conditionalDetails = 'VERIFIED_RULES_APPLIED';
  }
  return Object.freeze(result);
}

function normalizeOptionalBoolean(value) {
  if (!isNonEmpty(value)) return Object.freeze({ status: 'DEFAULT_FALSE', accepted: false });
  if (value === true || value === 'true') return Object.freeze({ status: 'PENDING_SEMANTICS', accepted: null });
  if (value === false || value === 'false') return Object.freeze({ status: 'PENDING_SEMANTICS', accepted: null });
  return Object.freeze({ status: 'PENDING_SEMANTICS', accepted: null });
}

function cellPresence(value) { return isNonEmpty(value) ? 'PRESENT' : 'EMPTY'; }

function dateFormatStatus(value) {
  if (!isNonEmpty(value)) return 'EMPTY';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'FORMAT_INVALID' : 'FORMAT_VALID';
  if (typeof value === 'number') return Number.isFinite(value) ? 'PENDING_VERIFICATION' : 'FORMAT_INVALID';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text) && !Number.isNaN(Date.parse(text))) {
    return 'FORMAT_VALID';
  }
  return 'PENDING_VERIFICATION';
}

/** Safe diagnostics only: never returns cell values, identifiers, signatures, or fingerprints. */
function diagnoseSheetResponseRow(headers, row, { expectedHeaders = HEADER_MANIFEST.headers } = {}) {
  validateHeaderManifest(headers, expectedHeaders);
  if (!Array.isArray(row) || row.length > EXPECTED_COLUMN_COUNT) throw sheetsError('SHEETS_DIAGNOSTIC_ROW_WIDTH_INVALID');
  const cells = [...row, ...Array(EXPECTED_COLUMN_COUNT - row.length).fill('')];
  const statusByColumn = HEADER_MANIFEST.columns.map(column => Object.freeze({
    columnNumber: column.columnNumber,
    erpCandidate: column.erpCandidate,
    status: cellPresence(cells[column.columnNumber - 1])
  }));
  const fieldStatus = columnNumber => statusByColumn[columnNumber - 1].status;
  const conditionalDetails = [17, 19, 22, 25, 27, 29, 31, 33, 35, 38].map(columnNumber => Object.freeze({
    columnNumber, status: fieldStatus(columnNumber), validation: 'PENDING_VERIFICATION'
  }));
  const consentGroups = HEADER_MANIFEST.consentGroups.map(group => Object.freeze({
    id: group.id,
    columns: group.columns.map(columnNumber => Object.freeze({ columnNumber, status: fieldStatus(columnNumber) })),
    valueFormat: 'PENDING_VERIFICATION', meaning: 'PENDING_VERIFICATION'
  }));
  const signatureReference = Object.freeze({
    presence: cellPresence(cells[49]),
    format: isNonEmpty(cells[49]) ? 'PENDING_VERIFICATION' : 'EMPTY',
    fieldType: 'PENDING_VERIFICATION'
  });
  return Object.freeze({
    diagnosticStatus: 'READ_ONLY_DIAGNOSTIC',
    sourceStatus: 'VERIFIED_FROM_SHEETS_HEADERS_ONLY',
    headerStatus: 'MATCHED_51_OF_51',
    responseRowCount: 1,
    submissionId: fieldStatus(1), respondentId: fieldStatus(2),
    submittedAt: Object.freeze({ presence: fieldStatus(3), format: dateFormatStatus(cells[2]) }),
    guardianAndEmergencyContacts: Object.freeze([4, 5, 6, 7].map(columnNumber => Object.freeze({ columnNumber, status: fieldStatus(columnNumber), requiredness: 'PENDING_VERIFICATION' }))),
    dogBasicInformation: Object.freeze([8, 9, 10, 11, 12, 13].map(columnNumber => Object.freeze({ columnNumber, status: fieldStatus(columnNumber), requiredness: 'PENDING_VERIFICATION' }))),
    optionalDogInformation: Object.freeze([14, 15].map(columnNumber => Object.freeze({ columnNumber, status: fieldStatus(columnNumber) }))),
    behaviourAndHealth: Object.freeze(statusByColumn.slice(15, 38)),
    conditionalDetails: Object.freeze(conditionalDetails),
    consentGroups: Object.freeze(consentGroups),
    photoVideoConsent: Object.freeze({ columnNumber: 49, status: fieldStatus(49), meaning: isNonEmpty(cells[48]) ? 'PENDING_VERIFICATION' : 'NOT_SELECTED_DEFAULT_FALSE' }),
    marketingConsent: Object.freeze({ status: 'NOT_PRESENT_DEFAULT_FALSE' }),
    signatureReference,
    signerName: fieldStatus(51),
    persistence: 'NONE', writes: 0,
    admissionWorkflow: 'NOT_CALLED', approvalTransition: 'BLOCKED', contractedTransition: 'BLOCKED'
  });
}

function createReadOnlySheetsResponseDiagnostic({ reader, spreadsheetId, expectedHeaders = HEADER_MANIFEST.headers } = {}) {
  if (!reader || typeof reader.get !== 'function' || Object.keys(reader).some(key => key !== 'get')) {
    throw sheetsError('SHEETS_DIAGNOSTIC_READ_ONLY_PORT_REQUIRED');
  }
  if (spreadsheetId !== SHEET_ID) throw sheetsError('SHEETS_DIAGNOSTIC_SOURCE_NOT_ALLOWLISTED');
  validateHeaderManifest(expectedHeaders, HEADER_MANIFEST.headers);
  return Object.freeze({
    kind: 'READ_ONLY_RESPONSE_DIAGNOSTIC',
    async read() {
      let snapshot;
      try {
        snapshot = await reader.get({ spreadsheetId: SHEET_ID, range: `'${TAB_NAME}'!A1:AY2` });
      } catch (_) {
        throw sheetsError('SHEETS_DIAGNOSTIC_READ_FAILED');
      }
      if (!snapshot || !Array.isArray(snapshot.values) || snapshot.values.length !== 2) {
        throw sheetsError('SHEETS_DIAGNOSTIC_RESPONSE_COUNT_INVALID');
      }
      try {
        validateHeaderManifest(snapshot.values[0], HEADER_MANIFEST.headers);
        return diagnoseSheetResponseRow(snapshot.values[0], snapshot.values[1], { expectedHeaders: HEADER_MANIFEST.headers });
      } catch (error) {
        if (['SHEETS_INTAKE_SCHEMA_PENDING', 'SHEETS_INTAKE_HEADER_MISMATCH', 'SHEETS_DIAGNOSTIC_ROW_WIDTH_INVALID'].includes(error?.code)) {
          throw error;
        }
        throw sheetsError('SHEETS_DIAGNOSTIC_INVALID_SNAPSHOT');
      }
    }
  });
}

function reconcileSheetsDuplicateValues(first, second, { sourceVerified = false } = {}) {
  return reconcileDuplicateColumns(first, second, { sourceVerified });
}

/** The port exposes only get; there is deliberately no write/update/append surface. */
function createReadOnlySheetsIntakeAdapter({ reader, spreadsheetId, expectedHeaders = HEADER_MANIFEST.headers, bindings, requiredFields = [], fingerprintKey } = {}) {
  if (!reader || typeof reader.get !== 'function' || Object.keys(reader).some(key => key !== 'get')) {
    throw sheetsError('SHEETS_INTAKE_READ_ONLY_PORT_REQUIRED');
  }
  if (spreadsheetId !== SHEET_ID) throw sheetsError('SHEETS_INTAKE_SOURCE_NOT_ALLOWLISTED');
  if (!Array.isArray(expectedHeaders) || expectedHeaders.length !== EXPECTED_COLUMN_COUNT) throw sheetsError('SHEETS_INTAKE_SCHEMA_PENDING');
  if (typeof fingerprintKey !== 'string' || Buffer.byteLength(fingerprintKey, 'utf8') < 32) throw sheetsError('SHEETS_INTAKE_FINGERPRINT_KEY_REQUIRED');
  return Object.freeze({
    kind: 'READ_ONLY_SHEETS_INTAKE',
    async read() {
      const snapshot = await reader.get({ spreadsheetId: SHEET_ID, range: `'${TAB_NAME}'!A:AY` });
      if (!snapshot || !Array.isArray(snapshot.values) || snapshot.values.length < 1) throw sheetsError('SHEETS_INTAKE_EMPTY_OR_INVALID');
      validateHeaderManifest(snapshot.values[0], expectedHeaders);
      return snapshot.values.slice(1).filter(row => row.some(isNonEmpty)).map(row => normalizeSheetRow(
        snapshot.values[0], row.length <= EXPECTED_COLUMN_COUNT ? [...row, ...Array(EXPECTED_COLUMN_COUNT - row.length).fill('')] : row,
        { expectedHeaders, bindings, requiredFields, fingerprintKey }
      ));
    }
  });
}

/** Synthetic-only replay policy: exact source ID + canonical row digest supplied by caller. */
function classifySubmissionReplay({ existingSubmissionId, incomingSubmissionId, existingFingerprint, incomingFingerprint } = {}) {
  if (typeof incomingSubmissionId !== 'string' || !incomingSubmissionId ||
      typeof incomingFingerprint !== 'string' || !incomingFingerprint) return 'BLOCKED_MISSING_FINGERPRINT';
  if (existingSubmissionId === undefined || existingSubmissionId === null) return 'NEW_SUBMISSION';
  if (existingSubmissionId !== incomingSubmissionId) return 'DIFFERENT_SUBMISSION';
  if (typeof existingFingerprint !== 'string' || !existingFingerprint) return 'BLOCKED_EXISTING_FINGERPRINT_UNKNOWN';
  return existingFingerprint === incomingFingerprint ? 'DUPLICATE_UNCHANGED' : 'CONFLICT_CHANGED_CONTENT';
}

function fingerprintSheetsSubmission(normalizedRecord) {
  if (!normalizedRecord || typeof normalizedRecord.submissionId !== 'string' || !normalizedRecord.submissionId ||
      !/^[a-f0-9]{64}$/.test(normalizedRecord.sourceFingerprint || '')) throw sheetsError('SHEETS_INTAKE_FINGERPRINT_INPUT_INVALID');
  return normalizedRecord.sourceFingerprint;
}

module.exports = {
  SHEET_ID, TAB_NAME, EXPECTED_COLUMN_COUNT, SOURCE_COLUMN_RANGES, HEADER_MANIFEST,
  validateHeaderManifest, normalizeSheetRow, reconcileSheetsDuplicateValues,
  createReadOnlySheetsIntakeAdapter, createReadOnlySheetsResponseDiagnostic,
  diagnoseSheetResponseRow, classifySubmissionReplay, fingerprintSheetsSubmission
};
