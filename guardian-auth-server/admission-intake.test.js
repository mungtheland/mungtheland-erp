'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TALLY_FIELD_MAPPING, DEFAULT_CONTRACT_TARGET, AdmissionError,
  mapTallyAnswers, createSyntheticAdmissionRepository, createAdmissionWorkflow
} = require('./admission-intake');

function syntheticVerifiedMapping() {
  return TALLY_FIELD_MAPPING.map((field, index) => ({
    ...field,
    tallyFieldId: `SYNTHETIC-Q-${index + 1}`,
    responseType: field.erpField === 'weight' ? 'NUMBER' : 'TEXT',
    required: ['guardianName', 'phone', 'dogName', 'health'].includes(field.erpField),
    conditional: field.erpField === 'health' ? { fieldId: 'SYNTHETIC-Q-10', equals: 'yes' } : null,
    status: 'VERIFIED'
  }));
}

function fixtureService({ sourceVerification = 'SYNTHETIC_FIXTURE', mapping = TALLY_FIELD_MAPPING } = {}) {
  const repository = createSyntheticAdmissionRepository();
  let nextId = 1;
  let nextTime = 0;
  const workflow = createAdmissionWorkflow({
    repository,
    authenticateStaff: async token => ({
      staffId: token === 'staff' ? 'SYN-STAFF-1' : token === 'admin' ? 'SYN-ADMIN-1' : '',
      role: token === 'admin' ? 'admin' : token === 'staff' ? 'staff' : 'guardian',
      status: token === 'invalid' ? 'inactive' : 'active'
    }),
    authenticateSubmission: async (credential, payload) => credential === 'fixture-source'
      ? {
          verified: true,
          channel: payload.channel || 'SYNTHETIC_FIXTURE',
          submissionId: payload.submissionId,
          receivedAt: payload.receivedAt || '2026-11-28T00:00:00.000Z',
          answers: payload.answers,
          normalizedData: payload.data || { guardianName: 'Synthetic Guardian', phone: 'synthetic', dogName: 'Synthetic Dog' },
          requiredFieldStatus: payload.requiredFieldStatus === undefined ? 'SYNTHETIC_FIXTURE_COMPLETE' : payload.requiredFieldStatus,
          contractEvidence: payload.contractEvidence === undefined ? {
            accepted: true, version: '1.0', effectiveDate: '2026-12-07',
            submittedAt: '2026-11-28T00:00:00.000Z', evidenceRef: 'SYN-EVIDENCE-1', source: 'SYNTHETIC_FIXTURE'
          } : payload.contractEvidence,
          privacyNoticeEvidence: payload.privacyNoticeEvidence === undefined ? {
            version: 'SYN-PRIVACY-1', presentedAt: '2026-11-28T00:00:00.000Z', evidenceRef: 'SYN-NOTICE-1', acknowledgment: true
          } : payload.privacyNoticeEvidence,
          optionalConsents: payload.optionalConsents || {}
        }
      : { verified: false },
    idFactory: () => `SYN-APP-${String(nextId++).padStart(4, '0')}`,
    now: () => new Date(Date.UTC(2026, 10, 28, 0, 0, nextTime++)).toISOString(),
    tallyFieldMapping: mapping,
    contractPolicy: { ...DEFAULT_CONTRACT_TARGET, sourceVerification }
  });
  return { repository, workflow };
}

const submit = (workflow, overrides = {}) => workflow.submit({
  credential: overrides.credential || 'fixture-source',
  rawPayload: { submissionId: overrides.submissionId || 'SYN-SUB-1', ...overrides }
});
async function reviewAndApprove(workflow, applicationId) {
  await workflow.transition('staff', { applicationId, expectedRevision: 1, nextStatus: 'NEEDS_REVIEW', reason: 'Synthetic staff review' });
  return workflow.transition('admin', { applicationId, expectedRevision: 2, nextStatus: 'APPROVED', reason: 'Synthetic admin decision' });
}

function assertCode(expected) {
  return error => error instanceof AdmissionError && error.code === expected;
}

test('Tally field map remains pending until actual question IDs are verified', () => {
  assert.ok(TALLY_FIELD_MAPPING.length > 0);
  assert.ok(TALLY_FIELD_MAPPING.every(field => field.status === 'PENDING_VERIFICATION' && field.tallyFieldId === null &&
    field.responseType === null && field.required === null && field.conditional === null));
  const { workflow } = fixtureService();
  return assert.rejects(submit(workflow, { channel: 'TALLY' }), assertCode('TALLY_FIELD_MAPPING_PENDING'));
});

test('synthetic verified mapping converts exact answer IDs into the ERP intake fields', () => {
  const mapping = syntheticVerifiedMapping();
  const mapped = mapTallyAnswers(mapping, {
    'SYNTHETIC-Q-1': 'Synthetic Guardian', 'SYNTHETIC-Q-2': 'Synthetic Phone',
    'SYNTHETIC-Q-4': 'Synthetic Dog', 'SYNTHETIC-Q-9': 8
  });
  assert.deepEqual(mapped, { guardianName: 'Synthetic Guardian', phone: 'Synthetic Phone', dogName: 'Synthetic Dog', weight: 8 });
});

test('synthetic Tally submission uses mapped answers and keeps source ID separate from server application ID', async () => {
  const { workflow } = fixtureService({ mapping: syntheticVerifiedMapping() });
  const result = await submit(workflow, {
    channel: 'TALLY', submissionId: 'SYNTHETIC-SUBMISSION-1',
    answers: {
      'SYNTHETIC-Q-1': 'Synthetic Guardian', 'SYNTHETIC-Q-2': 'Synthetic Phone',
      'SYNTHETIC-Q-4': 'Synthetic Dog'
    }
  });
  assert.equal(result.application.sourceSubmissionId, 'SYNTHETIC-SUBMISSION-1');
  assert.notEqual(result.application.applicationId, result.application.sourceSubmissionId);
  assert.equal(result.application.data.guardianName, 'Synthetic Guardian');
  assert.equal(Object.hasOwn(result.application.data, 'customerId'), false);
});

test('synthetic required and conditional answers are enforced without claiming actual Tally rules', () => {
  const mapping = syntheticVerifiedMapping();
  assert.throws(() => mapTallyAnswers(mapping, { 'SYNTHETIC-Q-2': 'Synthetic Phone', 'SYNTHETIC-Q-4': 'Synthetic Dog' }),
    assertCode('TALLY_REQUIRED_ANSWER_MISSING'));
  assert.throws(() => mapTallyAnswers(mapping, {
    'SYNTHETIC-Q-1': 'Synthetic Guardian', 'SYNTHETIC-Q-2': 'Synthetic Phone',
    'SYNTHETIC-Q-4': 'Synthetic Dog', 'SYNTHETIC-Q-10': 'yes'
  }), assertCode('TALLY_CONDITIONAL_ANSWER_MISSING'));
  assert.deepEqual(mapTallyAnswers(mapping, {
    'SYNTHETIC-Q-1': 'Synthetic Guardian', 'SYNTHETIC-Q-2': 'Synthetic Phone',
    'SYNTHETIC-Q-4': 'Synthetic Dog', 'SYNTHETIC-Q-10': 'no'
  }), { guardianName: 'Synthetic Guardian', phone: 'Synthetic Phone', dogName: 'Synthetic Dog', vaccines: 'no' });
});

test('synthetic mapping rejects invalid response types, unknown answer IDs, and duplicate question IDs', () => {
  const mapping = syntheticVerifiedMapping();
  assert.throws(() => mapTallyAnswers(mapping, {
    'SYNTHETIC-Q-1': 'Synthetic Guardian', 'SYNTHETIC-Q-2': 'Synthetic Phone',
    'SYNTHETIC-Q-4': 'Synthetic Dog', 'SYNTHETIC-Q-9': 'heavy'
  }), assertCode('TALLY_ANSWER_TYPE_INVALID'));
  assert.throws(() => mapTallyAnswers(mapping, { 'UNRECOGNIZED-Q': 'value' }), assertCode('TALLY_ANSWER_ID_UNKNOWN'));
  mapping[1].tallyFieldId = mapping[0].tallyFieldId;
  assert.throws(() => mapTallyAnswers(mapping, {}), assertCode('TALLY_FIELD_MAPPING_INVALID'));
});

test('same trusted submission replay returns the original application ID without duplicate creation', async () => {
  const { workflow } = fixtureService();
  const first = await submit(workflow);
  const replay = await submit(workflow);
  assert.equal(first.application.applicationId, replay.application.applicationId);
  assert.equal(first.application.revision, 1);
  assert.equal(replay.replayed, true);
});

test('same submission key with changed payload is rejected as an idempotency conflict', async () => {
  const { workflow } = fixtureService();
  await submit(workflow);
  await assert.rejects(submit(workflow, { data: { guardianName: 'Changed synthetic value' } }), assertCode('DUPLICATE_SUBMISSION_CONFLICT'));
});

test('application ID collision from the server ID factory fails closed', async () => {
  const repository = createSyntheticAdmissionRepository();
  const workflow = createAdmissionWorkflow({
    repository,
    authenticateStaff: async token => token === 'admin' ? { staffId: 'SYN-ADMIN', role: 'admin', status: 'active' } : { staffId: 'SYN-STAFF', role: 'staff', status: 'active' },
    authenticateSubmission: async (_credential, payload) => ({
      verified: true, channel: 'SYNTHETIC_FIXTURE', submissionId: payload.submissionId,
      normalizedData: { dogName: 'Synthetic Dog' }, requiredFieldStatus: 'SYNTHETIC_FIXTURE_COMPLETE',
      contractEvidence: { accepted: true, version: '1.0', effectiveDate: '2026-12-07', submittedAt: '2026-11-28', evidenceRef: 'SYN-E1' },
      privacyNoticeEvidence: { version: 'SYN-P1', presentedAt: '2026-11-28', evidenceRef: 'SYN-N1' }
    }),
    idFactory: () => 'SYN-APP-COLLISION', now: () => '2026-11-28T00:00:00Z'
  });
  await submit(workflow, { submissionId: 'SYN-SUB-A' });
  await assert.rejects(submit(workflow, { submissionId: 'SYN-SUB-B' }), assertCode('APPLICATION_ID_COLLISION'));
});

test('unverified submission source is rejected before an application ID is allocated', async () => {
  const { workflow } = fixtureService();
  await assert.rejects(submit(workflow, { credential: 'untrusted' }), assertCode('SUBMISSION_SOURCE_UNVERIFIED'));
});

test('contract acceptance and privacy notice evidence are separate required records', async () => {
  const { workflow } = fixtureService();
  await assert.rejects(submit(workflow, { contractEvidence: null }), assertCode('CONTRACT_EVIDENCE_REQUIRED'));
  await assert.rejects(submit(workflow, { privacyNoticeEvidence: null }), assertCode('PRIVACY_NOTICE_EVIDENCE_REQUIRED'));
});

test('optional marketing consents default unchecked and each selected consent needs separate evidence', async () => {
  const { workflow } = fixtureService();
  const first = await submit(workflow);
  assert.deepEqual(first.application.optionalConsents, {
    photoMarketing: { selected: false, evidence: null },
    marketingMessages: { selected: false, evidence: null }
  });
  const next = fixtureService();
  await assert.rejects(submit(next.workflow, { optionalConsents: { photoMarketing: { selected: true } } }), assertCode('OPTIONAL_CONSENT_EVIDENCE_REQUIRED'));
  const selected = await submit(next.workflow, { optionalConsents: {
    photoMarketing: { selected: true, evidence: { version: 'SYN-PHOTO-1', acceptedAt: '2026-11-28', evidenceRef: 'SYN-PHOTO-E1' } }
  } });
  assert.equal(selected.application.optionalConsents.photoMarketing.selected, true);
  assert.equal(selected.application.optionalConsents.marketingMessages.selected, false);
});

test('revision compare-and-set allows one simultaneous update and rejects the stale writer', async () => {
  const { workflow } = fixtureService();
  const { application } = await submit(workflow);
  const results = await Promise.allSettled([
    workflow.updateApplication('staff', { applicationId: application.applicationId, expectedRevision: 1, patch: { notes: 'synthetic A' }, reason: 'Synthetic edit A' }),
    workflow.updateApplication('staff', { applicationId: application.applicationId, expectedRevision: 1, patch: { notes: 'synthetic B' }, reason: 'Synthetic edit B' })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'REVISION_CONFLICT').length, 1);
});

test('editing after approval returns the application to staff review', async () => {
  const { workflow } = fixtureService();
  const { application } = await submit(workflow);
  await reviewAndApprove(workflow, application.applicationId);
  const updated = await workflow.updateApplication('staff', {
    applicationId: application.applicationId, expectedRevision: 3, patch: { notes: 'Synthetic approved edit' }, reason: 'Synthetic changed detail'
  });
  assert.equal(updated.status, 'NEEDS_REVIEW');
  assert.equal(updated.revision, 4);
});

test('ordinary staff cannot approve or reject; administrator decision is recorded with authenticated actor', async () => {
  const { workflow } = fixtureService();
  const { application } = await submit(workflow);
  await workflow.transition('staff', { applicationId: application.applicationId, expectedRevision: 1, nextStatus: 'NEEDS_REVIEW', reason: 'Synthetic review' });
  await assert.rejects(workflow.transition('staff', {
    applicationId: application.applicationId, expectedRevision: 2, nextStatus: 'APPROVED', reason: 'Synthetic attempt', staffId: 'SYN-ADMIN-FAKE'
  }), assertCode('ADMIN_PERMISSION_REQUIRED'));
  const approved = await workflow.transition('admin', {
    applicationId: application.applicationId, expectedRevision: 2, nextStatus: 'APPROVED', reason: 'Synthetic approval'
  });
  assert.equal(approved.audit.at(-1).actorStaffId, 'SYN-ADMIN-1');
  assert.equal(approved.audit.at(-1).reason, 'Synthetic approval');
  assert.equal(approved.audit.at(-1).outcome.status, 'APPROVED');

  const rejectedApp = await submit(workflow, { submissionId: 'SYN-SUB-REJECT' });
  await workflow.transition('staff', { applicationId: rejectedApp.application.applicationId, expectedRevision: 1, nextStatus: 'NEEDS_REVIEW', reason: 'Synthetic review' });
  await assert.rejects(workflow.transition('staff', {
    applicationId: rejectedApp.application.applicationId, expectedRevision: 2, nextStatus: 'REJECTED', reason: 'Synthetic attempt', staffId: 'SYN-ADMIN-FAKE'
  }), assertCode('ADMIN_PERMISSION_REQUIRED'));
  const rejected = await workflow.transition('admin', {
    applicationId: rejectedApp.application.applicationId, expectedRevision: 2, nextStatus: 'REJECTED', reason: 'Synthetic rejection'
  });
  assert.equal(rejected.status, 'REJECTED');
});

test('missing required-field policy prevents approval instead of guessing Tally requirements', async () => {
  const { workflow } = fixtureService();
  const { application } = await submit(workflow, { requiredFieldStatus: 'PENDING_VERIFICATION' });
  await workflow.transition('staff', { applicationId: application.applicationId, expectedRevision: 1, nextStatus: 'NEEDS_REVIEW', reason: 'Synthetic review' });
  await assert.rejects(workflow.transition('admin', {
    applicationId: application.applicationId, expectedRevision: 2, nextStatus: 'APPROVED', reason: 'Synthetic approval'
  }), assertCode('REQUIRED_FIELD_POLICY_UNVERIFIED'));
});

test('first-visit identity verification is staff-only and required before contract state', async () => {
  const { workflow } = fixtureService();
  const { application } = await submit(workflow);
  await workflow.transition('staff', { applicationId: application.applicationId, expectedRevision: 1, nextStatus: 'NEEDS_REVIEW', reason: 'Synthetic review' });
  await assert.rejects(workflow.recordFirstVisitIdentityCheck('staff', {
    applicationId: application.applicationId, expectedRevision: 2, result: 'MATCHED', reason: 'Synthetic early check'
  }), assertCode('APPLICATION_NOT_APPROVED'));
  await workflow.transition('admin', { applicationId: application.applicationId, expectedRevision: 2, nextStatus: 'APPROVED', reason: 'Synthetic approval' });
  await assert.rejects(workflow.confirmContract('staff', {
    applicationId: application.applicationId, expectedRevision: 3, reason: 'Synthetic contract attempt'
  }), assertCode('FIRST_VISIT_IDENTITY_NOT_VERIFIED'));
  const checked = await workflow.recordFirstVisitIdentityCheck('staff', {
    applicationId: application.applicationId, expectedRevision: 3, result: 'MATCHED', reason: 'Synthetic in-person match'
  });
  assert.equal(checked.firstVisitIdentityChecks[0].verifiedBy, 'SYN-STAFF-1');
  const contracted = await workflow.confirmContract('staff', {
    applicationId: application.applicationId, expectedRevision: 4, reason: 'Synthetic contract confirmation'
  });
  assert.equal(contracted.status, 'CONTRACTED');
  assert.equal(contracted.contractEvidenceHistory.at(-1).sourceVerification, 'SYNTHETIC_FIXTURE');
});

test('target contract version is checked and unverified real document blocks contract completion', async () => {
  const wrongVersion = fixtureService();
  const { application } = await submit(wrongVersion.workflow, { contractEvidence: {
    accepted: true, version: '0.9', effectiveDate: '2026-12-07', submittedAt: '2026-11-28', evidenceRef: 'SYN-OLD-E1'
  } });
  await reviewAndApprove(wrongVersion.workflow, application.applicationId);
  await wrongVersion.workflow.recordFirstVisitIdentityCheck('staff', {
    applicationId: application.applicationId, expectedRevision: 3, result: 'MATCHED', reason: 'Synthetic match'
  });
  await assert.rejects(wrongVersion.workflow.confirmContract('staff', {
    applicationId: application.applicationId, expectedRevision: 4, reason: 'Synthetic contract confirmation'
  }), assertCode('CONTRACT_VERSION_MISMATCH'));

  const unverified = fixtureService({ sourceVerification: 'PENDING_VERIFICATION' });
  const second = await submit(unverified.workflow);
  await reviewAndApprove(unverified.workflow, second.application.applicationId);
  await unverified.workflow.recordFirstVisitIdentityCheck('staff', {
    applicationId: second.application.applicationId, expectedRevision: 3, result: 'MATCHED', reason: 'Synthetic match'
  });
  await assert.rejects(unverified.workflow.confirmContract('staff', {
    applicationId: second.application.applicationId, expectedRevision: 4, reason: 'Synthetic attempt'
  }), assertCode('CONTRACT_SOURCE_UNVERIFIED'));
});

test('unauthenticated and inactive staff cannot mutate records', async () => {
  const { workflow } = fixtureService();
  const { application } = await submit(workflow);
  await assert.rejects(workflow.transition('invalid', {
    applicationId: application.applicationId, expectedRevision: 1, nextStatus: 'NEEDS_REVIEW', reason: 'Synthetic attempt'
  }), assertCode('STAFF_PERMISSION_DENIED'));
  await assert.rejects(workflow.transition('', {
    applicationId: application.applicationId, expectedRevision: 1, nextStatus: 'NEEDS_REVIEW', reason: 'Synthetic attempt'
  }), assertCode('AUTHENTICATION_REQUIRED'));
  await assert.rejects(workflow.get('invalid', application.applicationId), assertCode('STAFF_PERMISSION_DENIED'));
  assert.equal((await workflow.get('staff', application.applicationId)).revision, 1);
});

test('withdrawal request and privacy deletion request are separate; completion preserves contract and data', async () => {
  const { workflow } = fixtureService();
  const { application } = await submit(workflow);
  await reviewAndApprove(workflow, application.applicationId);
  await workflow.recordFirstVisitIdentityCheck('staff', {
    applicationId: application.applicationId, expectedRevision: 3, result: 'MATCHED', reason: 'Synthetic match'
  });
  const contracted = await workflow.confirmContract('staff', {
    applicationId: application.applicationId, expectedRevision: 4, reason: 'Synthetic contract confirmation'
  });
  const withdrawal = await workflow.transition('staff', {
    applicationId: application.applicationId, expectedRevision: contracted.revision, nextStatus: 'WITHDRAWAL_REQUESTED', reason: 'Synthetic withdrawal request'
  });
  const privacyRequest = await workflow.recordPrivacyDeletionRequest('staff', {
    applicationId: application.applicationId, expectedRevision: withdrawal.revision, requestReference: 'SYN-PRIVACY-REQUEST-1', reason: 'Synthetic deletion request'
  });
  assert.equal(privacyRequest.status, 'WITHDRAWAL_REQUESTED');
  assert.equal(privacyRequest.privacyRequests.length, 1);
  assert.equal(privacyRequest.privacyRequests[0].status, 'REVIEW_REQUIRED');
  assert.equal(privacyRequest.audit.at(-1).outcome.dataDeleted, false);
  const closed = await workflow.transition('staff', {
    applicationId: application.applicationId, expectedRevision: privacyRequest.revision, nextStatus: 'WITHDRAWN', reason: 'Synthetic withdrawal handled'
  });
  assert.equal(closed.status, 'WITHDRAWN');
  assert.equal(closed.audit.at(-1).outcome.contractCancelled, false);
  assert.equal(closed.audit.at(-1).outcome.dataDeleted, false);
  assert.equal(closed.data.guardianName, 'Synthetic Guardian');
  assert.equal(closed.contractEvidenceHistory.length, 2);
});

test('contracted application edits create a separate amendment request and preserve original contract evidence', async () => {
  const { workflow } = fixtureService();
  const { application } = await submit(workflow);
  await reviewAndApprove(workflow, application.applicationId);
  await workflow.recordFirstVisitIdentityCheck('staff', {
    applicationId: application.applicationId, expectedRevision: 3, result: 'MATCHED', reason: 'Synthetic match'
  });
  const contracted = await workflow.confirmContract('staff', {
    applicationId: application.applicationId, expectedRevision: 4, reason: 'Synthetic contract confirmation'
  });
  const updated = await workflow.updateApplication('staff', {
    applicationId: application.applicationId, expectedRevision: contracted.revision,
    patch: { notes: 'Proposed synthetic amendment' }, reason: 'Synthetic post-contract change'
  });
  assert.equal(updated.status, 'CONTRACTED');
  assert.equal(updated.data.notes, undefined);
  assert.equal(updated.amendments[0].status, 'PENDING_REVIEW');
  assert.equal(updated.contractEvidenceHistory.length, contracted.contractEvidenceHistory.length);
});

test('administrator contract exception records review but never bypasses contract confirmation', async () => {
  const { workflow } = fixtureService();
  const { application } = await submit(workflow);
  const before = application.contractEvidenceHistory.length;
  await assert.rejects(workflow.recordContractException('staff', {
    applicationId: application.applicationId, expectedRevision: 1, evidenceReference: 'SYN-EX-1', reason: 'Synthetic exception'
  }), assertCode('STAFF_PERMISSION_DENIED'));
  const result = await workflow.recordContractException('admin', {
    applicationId: application.applicationId, expectedRevision: 1, evidenceReference: 'SYN-EX-1', reason: 'Synthetic exception review'
  });
  assert.equal(result.status, 'RECEIVED');
  assert.equal(result.amendments[0].status, 'EXCEPTION_REVIEW_REQUIRED');
  assert.equal(result.audit.at(-1).outcome.contractConfirmationBypassed, false);
  assert.equal(result.contractEvidenceHistory.length, before);
});
