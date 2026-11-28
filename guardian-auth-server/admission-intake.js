'use strict';

const APPLICATION_STATES = Object.freeze([
  'RECEIVED', 'NEEDS_REVIEW', 'APPROVED', 'CONTRACTED', 'REJECTED',
  'WITHDRAWAL_REQUESTED', 'WITHDRAWN'
]);
const TALLY_ERP_FIELDS = Object.freeze([
  'guardianName', 'phone', 'emergencyPhone', 'dogName', 'breed', 'birthDate', 'sex',
  'neutered', 'weight', 'vaccines', 'health', 'notes'
]);
const TALLY_RESPONSE_TYPES = Object.freeze(['TEXT', 'PHONE', 'DATE', 'BOOLEAN', 'NUMBER', 'CHOICE', 'MULTI_SELECT', 'FILE_REFERENCE']);
const TALLY_FIELD_MAPPING = Object.freeze(TALLY_ERP_FIELDS.map(erpField => Object.freeze({
  erpField, tallyFieldId: null, responseType: null, required: null, conditional: null,
  status: 'PENDING_VERIFICATION'
})));
const APPLICATION_DATA_FIELDS = Object.freeze([
  'guardianName', 'phone', 'emergencyPhone', 'dogName', 'breed', 'birthDate', 'sex',
  'neutered', 'weight', 'vaccines', 'health', 'notes'
]);
const DEFAULT_CONTRACT_TARGET = Object.freeze({ version: '1.0', effectiveDate: '2026-12-07' });

class AdmissionError extends Error {
  constructor(code, statusCode = 400) {
    super(code);
    this.name = 'AdmissionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, statusCode) { throw new AdmissionError(code, statusCode); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function cleanReason(reason) {
  if (typeof reason !== 'string' || !reason.trim()) fail('REASON_REQUIRED');
  const value = reason.trim();
  if (value.length > 300) fail('REASON_TOO_LONG');
  return value;
}
function requireRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('INVALID_REVISION');
}
function validateApplicationData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_APPLICATION_DATA');
  const unknown = Object.keys(input).filter(key => !APPLICATION_DATA_FIELDS.includes(key));
  if (unknown.length) fail('UNKNOWN_APPLICATION_FIELD');
  const output = {};
  for (const key of APPLICATION_DATA_FIELDS) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      fail('INVALID_APPLICATION_FIELD_TYPE');
    }
    if (typeof value === 'string' && value.length > 4000) fail('APPLICATION_FIELD_TOO_LONG');
    output[key] = typeof value === 'string' ? value.trim() : value;
  }
  return output;
}
function validateContractEvidence(evidence) {
  if (!evidence || evidence.accepted !== true || !evidence.version || !evidence.effectiveDate ||
      !evidence.submittedAt || !evidence.evidenceRef) fail('CONTRACT_EVIDENCE_REQUIRED');
  return {
    accepted: true,
    version: String(evidence.version),
    effectiveDate: String(evidence.effectiveDate),
    submittedAt: String(evidence.submittedAt),
    evidenceRef: String(evidence.evidenceRef),
    source: String(evidence.source || 'SYNTHETIC_FIXTURE')
  };
}
function validateNoticeEvidence(evidence) {
  if (!evidence || !evidence.version || !evidence.presentedAt || !evidence.evidenceRef) fail('PRIVACY_NOTICE_EVIDENCE_REQUIRED');
  return {
    version: String(evidence.version),
    presentedAt: String(evidence.presentedAt),
    evidenceRef: String(evidence.evidenceRef),
    acknowledgment: evidence.acknowledgment === true
  };
}
function normalizeOptionalConsents(input = {}) {
  const result = {};
  for (const key of ['photoMarketing', 'marketingMessages']) {
    const value = input[key];
    const selected = value === true || (value && value.selected === true);
    if (!selected) {
      result[key] = { selected: false, evidence: null };
      continue;
    }
    const evidence = value && typeof value === 'object' ? value.evidence : null;
    if (!evidence || !evidence.version || !evidence.acceptedAt || !evidence.evidenceRef) {
      fail('OPTIONAL_CONSENT_EVIDENCE_REQUIRED');
    }
    result[key] = { selected: true, evidence: {
      version: String(evidence.version), acceptedAt: String(evidence.acceptedAt), evidenceRef: String(evidence.evidenceRef)
    } };
  }
  return result;
}
function canonicalSubmission(value) { return JSON.stringify(value); }

/** Validate a verified mapping definition and map raw answer IDs to the existing ERP contract. */
function mapTallyAnswers(mapping, answers) {
  if (!Array.isArray(mapping) || mapping.length !== TALLY_ERP_FIELDS.length ||
      mapping.some(field => !field || field.status !== 'VERIFIED' || !field.tallyFieldId)) {
    fail('TALLY_FIELD_MAPPING_PENDING', 409);
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) fail('TALLY_ANSWERS_INVALID');
  const logicalFields = new Set();
  const tallyIds = new Set();
  for (const field of mapping) {
    if (!TALLY_ERP_FIELDS.includes(field.erpField) || logicalFields.has(field.erpField) ||
        typeof field.tallyFieldId !== 'string' || !field.tallyFieldId.trim() ||
        field.tallyFieldId !== field.tallyFieldId.trim() || tallyIds.has(field.tallyFieldId)) {
      fail('TALLY_FIELD_MAPPING_INVALID', 409);
    }
    if (!TALLY_RESPONSE_TYPES.includes(field.responseType) || typeof field.required !== 'boolean') {
      fail('TALLY_FIELD_MAPPING_INVALID', 409);
    }
    if (field.conditional !== null && (!field.conditional || typeof field.conditional.fieldId !== 'string' ||
        !field.conditional.fieldId || !Object.hasOwn(field.conditional, 'equals'))) {
      fail('TALLY_FIELD_MAPPING_INVALID', 409);
    }
    logicalFields.add(field.erpField);
    tallyIds.add(field.tallyFieldId);
  }
  if (mapping.some(field => field.conditional && !tallyIds.has(field.conditional.fieldId))) {
    fail('TALLY_FIELD_MAPPING_INVALID', 409);
  }
  if (Object.keys(answers).some(id => !tallyIds.has(id))) fail('TALLY_ANSWER_ID_UNKNOWN');
  const mapped = {};
  for (const field of mapping) {
    const active = field.conditional === null || answers[field.conditional.fieldId] === field.conditional.equals;
    const present = Object.hasOwn(answers, field.tallyFieldId) && answers[field.tallyFieldId] !== null && answers[field.tallyFieldId] !== '';
    if (active && field.required && !present) {
      fail(field.conditional === null ? 'TALLY_REQUIRED_ANSWER_MISSING' : 'TALLY_CONDITIONAL_ANSWER_MISSING');
    }
    if (!present) continue;
    const value = answers[field.tallyFieldId];
    const valid = field.responseType === 'TEXT' || field.responseType === 'PHONE' || field.responseType === 'DATE' ||
      field.responseType === 'FILE_REFERENCE'
      ? typeof value === 'string'
      : field.responseType === 'BOOLEAN'
        ? typeof value === 'boolean'
        : field.responseType === 'NUMBER'
          ? typeof value === 'number' && Number.isFinite(value)
          : field.responseType === 'CHOICE'
            ? typeof value === 'string'
            : field.responseType === 'MULTI_SELECT'
              ? Array.isArray(value) && value.every(item => typeof item === 'string')
              : false;
    if (!valid) fail('TALLY_ANSWER_TYPE_INVALID');
    if (active) mapped[field.erpField] = value;
  }
  return validateApplicationData(mapped);
}

/** Synthetic-only in-memory repository. It has no file, Sheets, Firestore, or network adapter. */
function createSyntheticAdmissionRepository() {
  const records = new Map();
  const sourceKeys = new Map();
  return Object.freeze({
    kind: 'SYNTHETIC_MEMORY_ONLY',
    async findBySourceSubmission(sourceChannel, sourceSubmissionId) {
      const id = sourceKeys.get(`${sourceChannel}\u0000${sourceSubmissionId}`);
      return id ? clone(records.get(id)) : null;
    },
    async createIfAbsent(record) {
      const key = `${record.sourceChannel}\u0000${record.sourceSubmissionId}`;
      if (sourceKeys.has(key)) return { created: false, record: clone(records.get(sourceKeys.get(key))) };
      if (records.has(record.applicationId)) fail('APPLICATION_ID_COLLISION', 409);
      records.set(record.applicationId, clone(record));
      sourceKeys.set(key, record.applicationId);
      return { created: true, record: clone(record) };
    },
    async get(applicationId) { return clone(records.get(applicationId) || null); },
    async compareAndSet(applicationId, expectedRevision, nextRecord) {
      const current = records.get(applicationId);
      if (!current) fail('APPLICATION_NOT_FOUND', 404);
      if (current.revision !== expectedRevision) fail('REVISION_CONFLICT', 409);
      records.set(applicationId, clone(nextRecord));
      return clone(nextRecord);
    }
  });
}

/**
 * Local policy workflow only. Production persistence and HTTP routes are intentionally absent.
 * authenticateStaff must be the trusted server authenticator; never pass a client-supplied principal.
 */
function createAdmissionWorkflow({ repository, authenticateStaff, authenticateSubmission, idFactory, now,
  tallyFieldMapping = TALLY_FIELD_MAPPING, contractPolicy = { ...DEFAULT_CONTRACT_TARGET, sourceVerification: 'PENDING_VERIFICATION' } } = {}) {
  if (!repository || repository.kind !== 'SYNTHETIC_MEMORY_ONLY') fail('SYNTHETIC_REPOSITORY_REQUIRED', 503);
  if (typeof authenticateStaff !== 'function' || typeof authenticateSubmission !== 'function' ||
      typeof idFactory !== 'function' || typeof now !== 'function') fail('WORKFLOW_DEPENDENCIES_REQUIRED', 503);

  async function requireStaff(token, allowedRoles = ['staff', 'admin']) {
    if (typeof token !== 'string' || !token) fail('AUTHENTICATION_REQUIRED', 401);
    let principal;
    try { principal = await authenticateStaff(token); } catch (_) { fail('AUTHENTICATION_FAILED', 401); }
    if (!principal || principal.status !== 'active' || !principal.staffId || !allowedRoles.includes(principal.role)) {
      fail('STAFF_PERMISSION_DENIED', 403);
    }
    return { role: principal.role, staffId: String(principal.staffId) };
  }

  async function saveRevision(record, expectedRevision) {
    requireRevision(expectedRevision);
    record.revision = expectedRevision + 1;
    return repository.compareAndSet(record.applicationId, expectedRevision, record);
  }

  function addAudit(record, actor, action, reason, outcome, at = now()) {
    record.audit.push({ action, actorStaffId: actor.staffId, at: String(at), reason: cleanReason(reason), outcome });
  }

  async function submit({ credential, rawPayload } = {}) {
    let source;
    try { source = await authenticateSubmission(credential, rawPayload); } catch (_) { fail('SUBMISSION_SOURCE_UNVERIFIED', 403); }
    if (!source || source.verified !== true || !source.channel || !source.submissionId) fail('SUBMISSION_SOURCE_UNVERIFIED', 403);
    const data = source.channel === 'TALLY'
      ? mapTallyAnswers(tallyFieldMapping, source.answers || {})
      : validateApplicationData(source.normalizedData || {});
    const contractEvidence = validateContractEvidence(source.contractEvidence);
    const privacyNoticeEvidence = validateNoticeEvidence(source.privacyNoticeEvidence);
    const optionalConsents = normalizeOptionalConsents(source.optionalConsents);
    const submissionFingerprint = canonicalSubmission({ data, contractEvidence, privacyNoticeEvidence, optionalConsents });
    const existing = await repository.findBySourceSubmission(String(source.channel), String(source.submissionId));
    if (existing) {
      if (existing.submissionFingerprint !== submissionFingerprint) fail('DUPLICATE_SUBMISSION_CONFLICT', 409);
      return { replayed: true, application: existing };
    }
    const record = {
      applicationId: String(idFactory()), sourceChannel: String(source.channel), sourceSubmissionId: String(source.submissionId),
      submissionFingerprint, status: 'RECEIVED', revision: 1, receivedAt: String(source.receivedAt || now()),
      data, contractEvidenceHistory: [contractEvidence], privacyNoticeEvidence, optionalConsents,
      requiredFieldStatus: source.requiredFieldStatus || 'PENDING_VERIFICATION',
      firstVisitIdentityChecks: [], amendments: [], privacyRequests: [], audit: []
    };
    if (!record.applicationId) fail('APPLICATION_ID_REQUIRED');
    const created = await repository.createIfAbsent(record);
    if (!created.created && created.record.submissionFingerprint !== submissionFingerprint) fail('DUPLICATE_SUBMISSION_CONFLICT', 409);
    return { replayed: !created.created, application: created.record };
  }

  async function load(applicationId) {
    const record = await repository.get(String(applicationId));
    if (!record) fail('APPLICATION_NOT_FOUND', 404);
    return record;
  }

  async function get(token, applicationId) {
    await requireStaff(token);
    return load(applicationId);
  }

  async function transition(token, { applicationId, expectedRevision, nextStatus, reason } = {}) {
    const actor = await requireStaff(token);
    requireRevision(expectedRevision);
    if (!APPLICATION_STATES.includes(nextStatus)) fail('UNKNOWN_APPLICATION_STATUS');
    const record = await load(applicationId);
    if (record.revision !== expectedRevision) fail('REVISION_CONFLICT', 409);
    const allowed = {
      RECEIVED: ['NEEDS_REVIEW', 'WITHDRAWAL_REQUESTED'],
      NEEDS_REVIEW: ['APPROVED', 'REJECTED', 'WITHDRAWAL_REQUESTED'],
      APPROVED: ['NEEDS_REVIEW', 'WITHDRAWAL_REQUESTED'],
      CONTRACTED: ['WITHDRAWAL_REQUESTED'],
      REJECTED: ['WITHDRAWAL_REQUESTED'],
      WITHDRAWAL_REQUESTED: ['WITHDRAWN'],
      WITHDRAWN: []
    };
    if (nextStatus === 'CONTRACTED') fail('CONTRACT_CONFIRMATION_REQUIRED', 409);
    if (!allowed[record.status].includes(nextStatus)) fail('INVALID_STATUS_TRANSITION', 409);
    if (['APPROVED', 'REJECTED'].includes(nextStatus) && actor.role !== 'admin') fail('ADMIN_PERMISSION_REQUIRED', 403);
    if (nextStatus === 'APPROVED' && record.requiredFieldStatus !== 'VERIFIED_COMPLETE' &&
        !(record.sourceChannel === 'SYNTHETIC_FIXTURE' && record.requiredFieldStatus === 'SYNTHETIC_FIXTURE_COMPLETE')) {
      fail('REQUIRED_FIELD_POLICY_UNVERIFIED', 409);
    }
    record.status = nextStatus;
    const outcome = nextStatus === 'WITHDRAWN' ? { applicationClosed: true, contractCancelled: false, dataDeleted: false } : { status: nextStatus };
    addAudit(record, actor, `STATUS_${nextStatus}`, reason, outcome);
    return saveRevision(record, expectedRevision);
  }

  async function updateApplication(token, { applicationId, expectedRevision, patch, reason } = {}) {
    const actor = await requireStaff(token);
    requireRevision(expectedRevision);
    const safePatch = validateApplicationData(patch);
    if (!Object.keys(safePatch).length) fail('EMPTY_APPLICATION_PATCH');
    const record = await load(applicationId);
    if (record.revision !== expectedRevision) fail('REVISION_CONFLICT', 409);
    const clean = cleanReason(reason);
    if (record.status === 'WITHDRAWAL_REQUESTED' || record.status === 'WITHDRAWN' || record.status === 'REJECTED') {
      fail('APPLICATION_EDIT_NOT_ALLOWED', 409);
    }
    if (record.status === 'CONTRACTED') {
      record.amendments.push({ revision: expectedRevision + 1, proposedPatch: safePatch, status: 'PENDING_REVIEW', requestedBy: actor.staffId, requestedAt: String(now()), reason: clean });
      addAudit(record, actor, 'CONTRACT_AMENDMENT_REQUESTED', clean, { applied: false, originalContractEvidencePreserved: true });
      return saveRevision(record, expectedRevision);
    }
    record.data = { ...record.data, ...safePatch };
    if (record.status === 'APPROVED') record.status = 'NEEDS_REVIEW';
    addAudit(record, actor, 'APPLICATION_UPDATED', clean, { status: record.status });
    return saveRevision(record, expectedRevision);
  }

  async function recordFirstVisitIdentityCheck(token, { applicationId, expectedRevision, result, reason } = {}) {
    const actor = await requireStaff(token);
    requireRevision(expectedRevision);
    if (!['MATCHED', 'NOT_MATCHED'].includes(result)) fail('INVALID_IDENTITY_CHECK_RESULT');
    const record = await load(applicationId);
    if (record.revision !== expectedRevision) fail('REVISION_CONFLICT', 409);
    if (record.status !== 'APPROVED') fail('APPLICATION_NOT_APPROVED', 409);
    const check = { result, method: 'IN_PERSON', verifiedBy: actor.staffId, verifiedAt: String(now()) };
    record.firstVisitIdentityChecks.push(check);
    addAudit(record, actor, 'FIRST_VISIT_IDENTITY_CHECK', reason, { result });
    return saveRevision(record, expectedRevision);
  }

  async function confirmContract(token, { applicationId, expectedRevision, reason } = {}) {
    const actor = await requireStaff(token);
    requireRevision(expectedRevision);
    const record = await load(applicationId);
    if (record.revision !== expectedRevision) fail('REVISION_CONFLICT', 409);
    if (record.status !== 'APPROVED') fail('APPLICATION_NOT_APPROVED', 409);
    const lastIdentityCheck = record.firstVisitIdentityChecks.at(-1);
    if (!lastIdentityCheck || lastIdentityCheck.result !== 'MATCHED') fail('FIRST_VISIT_IDENTITY_NOT_VERIFIED', 409);
    const accepted = record.contractEvidenceHistory.at(-1);
    if (!accepted || accepted.accepted !== true) fail('CONTRACT_EVIDENCE_REQUIRED', 409);
    if (!['VERIFIED_ACTUAL', 'SYNTHETIC_FIXTURE'].includes(contractPolicy.sourceVerification)) fail('CONTRACT_SOURCE_UNVERIFIED', 409);
    if (accepted.version !== contractPolicy.version || accepted.effectiveDate !== contractPolicy.effectiveDate) fail('CONTRACT_VERSION_MISMATCH', 409);
    if (contractPolicy.sourceVerification === 'SYNTHETIC_FIXTURE' && record.sourceChannel !== 'SYNTHETIC_FIXTURE') fail('SYNTHETIC_CONTRACT_ON_NONTEST_RECORD', 409);
    record.status = 'CONTRACTED';
    record.contractEvidenceHistory.push({
      ...accepted, confirmedBy: actor.staffId, confirmedAt: String(now()),
      sourceVerification: contractPolicy.sourceVerification
    });
    addAudit(record, actor, 'CONTRACT_CONFIRMED', reason, { status: 'CONTRACTED', initialVisitIdentityVerified: true });
    return saveRevision(record, expectedRevision);
  }

  async function recordPrivacyDeletionRequest(token, { applicationId, expectedRevision, requestReference, reason } = {}) {
    const actor = await requireStaff(token);
    requireRevision(expectedRevision);
    if (!requestReference || typeof requestReference !== 'string') fail('PRIVACY_REQUEST_REFERENCE_REQUIRED');
    const record = await load(applicationId);
    if (record.revision !== expectedRevision) fail('REVISION_CONFLICT', 409);
    record.privacyRequests.push({ type: 'PERSONAL_DATA_DELETION', requestReference, receivedAt: String(now()), status: 'REVIEW_REQUIRED' });
    addAudit(record, actor, 'PRIVACY_DELETION_REQUEST_RECORDED', reason, { applicationStatusUnchanged: true, dataDeleted: false });
    return saveRevision(record, expectedRevision);
  }

  async function recordContractException(token, { applicationId, expectedRevision, evidenceReference, reason } = {}) {
    const actor = await requireStaff(token, ['admin']);
    requireRevision(expectedRevision);
    if (!evidenceReference || typeof evidenceReference !== 'string') fail('CONTRACT_EXCEPTION_EVIDENCE_REQUIRED');
    const record = await load(applicationId);
    if (record.revision !== expectedRevision) fail('REVISION_CONFLICT', 409);
    record.amendments.push({ revision: expectedRevision + 1, status: 'EXCEPTION_REVIEW_REQUIRED', evidenceReference, requestedBy: actor.staffId, requestedAt: String(now()), reason: cleanReason(reason) });
    addAudit(record, actor, 'CONTRACT_EXCEPTION_RECORDED', reason, { statusChanged: false, contractConfirmationBypassed: false });
    return saveRevision(record, expectedRevision);
  }

  return Object.freeze({ submit, get, transition, updateApplication, recordFirstVisitIdentityCheck,
    confirmContract, recordPrivacyDeletionRequest, recordContractException });
}

module.exports = {
  APPLICATION_STATES, TALLY_FIELD_MAPPING, DEFAULT_CONTRACT_TARGET, AdmissionError,
  mapTallyAnswers, createSyntheticAdmissionRepository, createAdmissionWorkflow
};
