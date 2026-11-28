'use strict';

const EXPECTED_COLUMN_COUNT = 55;
const KNOWN_HEADERS = Object.freeze({
  1: 'Submission ID',
  2: 'Respondent ID',
  3: 'Submitted at',
  5: '보호자 휴대전화 번호를 입력해 주세요.',
  6: '비상연락처를 입력해 주세요',
  54: '보호자 휴대전화 번호를 입력해 주세요. (2)',
  55: '비상연락처를 입력해 주세요.'
});

function csvError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

/** Minimal RFC 4180 parser. Values remain strings; callers must not log returned rows. */
function parseCsvRows(input) {
  if (typeof input !== 'string' || input.length === 0) throw csvError('CSV_INPUT_REQUIRED');
  const text = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      row.push(cell); cell = '';
      if (row.some(value => value !== '') || rows.length === 0) rows.push(row);
      row = [];
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else cell += char;
  }
  if (quoted) throw csvError('CSV_QUOTE_UNCLOSED');
  row.push(cell);
  if (row.some(value => value !== '') || rows.length === 0) rows.push(row);
  if (rows.some(item => item.length !== rows[0].length)) throw csvError('CSV_ROW_WIDTH_MISMATCH');
  return rows;
}

function reconcileDuplicateColumns(first, second, { sourceVerified = false } = {}) {
  const a = typeof first === 'string' ? first : '';
  const b = typeof second === 'string' ? second : '';
  if (!a && !b) return { status: 'REQUIRED_VALUE_MISSING', value: null };
  if (a && b && a !== b) return { status: 'CONFLICT', value: null };
  if (!sourceVerified) return { status: a && b ? 'SAME_VALUE_SOURCE_UNVERIFIED' : 'SINGLE_VALUE_SOURCE_UNVERIFIED', value: null };
  return { status: a && b ? 'MATCHED' : 'SINGLE_SOURCE_VERIFIED', value: a || b };
}

function normalizeConsentPair(first, second, { verified = false, acceptedTokens = [], declinedTokens = [] } = {}) {
  if (!verified) return { status: 'PENDING_VERIFICATION', accepted: null };
  const normalize = value => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (acceptedTokens.includes(normalized)) return true;
    if (declinedTokens.includes(normalized)) return false;
    return 'INVALID';
  };
  const a = normalize(first);
  const b = normalize(second);
  if (a === 'INVALID' || b === 'INVALID') return { status: 'INVALID_FORMAT', accepted: null };
  if (a === null && b === null) return { status: 'MISSING', accepted: null };
  if (a !== null && b !== null && a !== b) return { status: 'CONFLICT', accepted: null };
  if (a === null || b === null) return { status: 'DUPLICATE_OUTPUT_INCOMPLETE', accepted: null };
  return { status: 'NORMALIZED', accepted: a };
}

function normalizeConsentPairs(pairs) {
  if (!Array.isArray(pairs)) throw csvError('CONSENT_PAIRS_INVALID');
  const ids = new Set();
  const results = [];
  for (const pair of pairs) {
    if (!pair || typeof pair.consentId !== 'string' || !pair.consentId.trim() || ids.has(pair.consentId)) {
      throw csvError('CONSENT_LOGICAL_ID_DUPLICATE_OR_MISSING');
    }
    ids.add(pair.consentId);
    results.push({ consentId: pair.consentId, ...normalizeConsentPair(pair.first, pair.second, pair) });
  }
  return results;
}

function normalizeOptionalConsentCell(value, { verified = false, acceptedTokens = [], declinedTokens = [] } = {}) {
  if (typeof value !== 'string' || !value.trim()) return { status: 'DEFAULT_FALSE', accepted: false };
  if (!verified) return { status: 'PENDING_VERIFICATION', accepted: null };
  const normalized = value.trim();
  if (acceptedTokens.includes(normalized)) return { status: 'NORMALIZED', accepted: true };
  if (declinedTokens.includes(normalized)) return { status: 'NORMALIZED', accepted: false };
  return { status: 'INVALID_FORMAT', accepted: null };
}

/** Validate the supplied CSV shape and return value-free diagnostics only. */
function inspectTallyAdmissionCsv(input) {
  const rows = parseCsvRows(input);
  const [headers, ...responses] = rows;
  if (headers.length !== EXPECTED_COLUMN_COUNT) throw csvError('CSV_HEADER_WIDTH_UNEXPECTED');
  for (const [column, label] of Object.entries(KNOWN_HEADERS)) {
    if (headers[Number(column) - 1] !== label) throw csvError('CSV_KNOWN_HEADER_MISMATCH');
  }
  if (responses.some(response => response.length !== EXPECTED_COLUMN_COUNT)) throw csvError('CSV_RESPONSE_WIDTH_UNEXPECTED');

  const rowResults = responses.map(response => {
    const phone = reconcileDuplicateColumns(response[4], response[53]);
    const emergencyPhone = reconcileDuplicateColumns(response[5], response[54]);
    const consentPairs = Array.from({ length: 5 }, (_, index) => {
      const offset = 40 + index * 2;
      const first = response[offset] || '';
      const second = response[offset + 1] || '';
      if (first && second && first !== second) return 'RAW_OUTPUTS_DIFFER_PENDING_SEMANTIC_VERIFICATION';
      if (!first && !second) return 'PENDING_EMPTY';
      if (first && second) return 'SAME_VALUE_PENDING_FORMAT_VERIFICATION';
      return 'PENDING_SINGLE_OUTPUT';
    });
    const parasiteCells = response.slice(36, 38);
    const signature = validateSignatureReference(response[51], response[52]);
    return {
      submissionId: response[0] ? 'PRESENT_UNVERIFIED_CANDIDATE' : 'MISSING',
      phoneStatus: phone.status,
      emergencyPhoneStatus: emergencyPhone.status,
      phonePreservesString: typeof response[4] === 'string' && typeof response[53] === 'string',
      contractConsentPairStatuses: consentPairs,
      photoVideoConsent: response[50] ? 'PENDING_VALUE_SEMANTICS' : 'DEFAULT_FALSE',
      marketingConsent: 'NOT_PRESENT_IN_CONFIRMED_COLUMNS_DEFAULT_FALSE',
      parasitePrevention: parasiteCells.every(value => !value) ? 'EMPTY_CAUSE_UNVERIFIED' : 'VALUE_PRESENT_SEMANTICS_UNVERIFIED',
      signatureStatus: signature.status,
      signerNamePresent: Boolean(response[52])
    };
  });
  return Object.freeze({
    structureStatus: 'VERIFIED_FROM_CSV',
    columnCount: headers.length,
    responseCount: responses.length,
    editorQuestionIds: 'PENDING_VERIFICATION',
    conditionalRules: 'PENDING_VERIFICATION',
    webhookFormat: 'PENDING_VERIFICATION',
    rows: rowResults
  });
}

/** Signature material and URL are deliberately never returned. */
function validateSignatureReference(reference, signerName) {
  if (typeof reference !== 'string' || !reference.trim() || typeof signerName !== 'string' || !signerName.trim()) {
    return { status: 'MISSING' };
  }
  try {
    const parsed = new URL(reference);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return { status: 'INVALID_FORMAT' };
    return { status: 'HTTPS_REFERENCE_FORMAT_ONLY' };
  } catch (_) {
    return { status: 'INVALID_FORMAT' };
  }
}

module.exports = {
  EXPECTED_COLUMN_COUNT, KNOWN_HEADERS, parseCsvRows, reconcileDuplicateColumns,
  normalizeConsentPair, normalizeConsentPairs, normalizeOptionalConsentCell,
  validateSignatureReference, inspectTallyAdmissionCsv
};
