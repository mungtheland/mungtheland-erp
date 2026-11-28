'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const {
  TallyWebhookError, verifyTallyWebhookSignature, validateTallyWebhookEnvelope
} = require('./tally-webhook-contract');

const SYNTHETIC_SECRET = 'SYNTHETIC_ONLY_SIGNING_SECRET';
const SYNTHETIC_FORM_ID = 'SYNTHETIC-FORM-ID';

function syntheticPayload() {
  return {
    eventId: 'SYNTHETIC-EVENT-ID', eventType: 'FORM_RESPONSE', createdAt: '2026-11-28T00:00:00.000Z',
    data: {
      responseId: 'SYNTHETIC-RESPONSE-ID', submissionId: 'SYNTHETIC-SUBMISSION-ID',
      respondentId: 'SYNTHETIC-RESPONDENT-ID', formId: SYNTHETIC_FORM_ID, createdAt: '2026-11-28T00:00:00.000Z',
      fields: [{ key: 'SYNTHETIC-QUESTION-KEY', label: 'Synthetic field', type: 'INPUT_TEXT', value: 'Synthetic private answer' }]
    }
  };
}

function syntheticSignature(payload, secret = SYNTHETIC_SECRET) {
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('base64');
}

function assertCode(code) {
  return error => error instanceof TallyWebhookError && error.code === code;
}

test('official documented signing format validates synthetic webhook payload with constant-time comparison path', () => {
  const payload = syntheticPayload();
  assert.equal(verifyTallyWebhookSignature(payload, syntheticSignature(payload), SYNTHETIC_SECRET), true);
});

test('missing secret/signature and altered payload/signature fail closed without exposing values', () => {
  const payload = syntheticPayload();
  assert.throws(() => verifyTallyWebhookSignature(payload, '', ''), assertCode('WEBHOOK_SIGNATURE_CONFIGURATION_REQUIRED'));
  assert.throws(() => verifyTallyWebhookSignature(payload, 'bad-signature', SYNTHETIC_SECRET), assertCode('WEBHOOK_SIGNATURE_INVALID'));
  const altered = { ...payload, eventType: 'OTHER' };
  assert.throws(() => verifyTallyWebhookSignature(altered, syntheticSignature(payload), SYNTHETIC_SECRET), assertCode('WEBHOOK_SIGNATURE_INVALID'));
  const safeError = (() => { try { verifyTallyWebhookSignature(payload, 'bad-signature', SYNTHETIC_SECRET); } catch (error) { return error; } })();
  assert.equal(safeError.message.includes(SYNTHETIC_SECRET), false);
});

test('form-specific ID remains blocked until verified and mismatching form IDs are rejected', () => {
  const payload = syntheticPayload();
  const signature = syntheticSignature(payload);
  assert.throws(() => validateTallyWebhookEnvelope(payload, { signature, signingSecret: SYNTHETIC_SECRET }),
    assertCode('TALLY_FORM_ID_PENDING'));
  assert.throws(() => validateTallyWebhookEnvelope(payload, {
    expectedFormId: 'OTHER-SYNTHETIC-FORM', signature, signingSecret: SYNTHETIC_SECRET
  }), assertCode('TALLY_FORM_ID_MISMATCH'));
});

test('valid synthetic envelope returns identifiers and counts but excludes answer and respondent values', () => {
  const payload = syntheticPayload();
  const result = validateTallyWebhookEnvelope(payload, {
    expectedFormId: SYNTHETIC_FORM_ID, signature: syntheticSignature(payload), signingSecret: SYNTHETIC_SECRET
  });
  assert.deepEqual(result, {
    verified: true, eventType: 'FORM_RESPONSE', eventId: 'SYNTHETIC-EVENT-ID',
    submissionId: 'SYNTHETIC-SUBMISSION-ID', responseId: 'SYNTHETIC-RESPONSE-ID',
    formId: SYNTHETIC_FORM_ID, createdAt: '2026-11-28T00:00:00.000Z', respondentIdPresent: true,
    fieldCount: 1, answersMapped: false
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('Synthetic private answer'), false);
  assert.equal(serialized.includes('SYNTHETIC-RESPONDENT-ID'), false);
});

test('malformed envelope, absent field metadata, and duplicate webhook field keys are rejected', () => {
  const payload = syntheticPayload();
  payload.data.fields.push({ ...payload.data.fields[0] });
  assert.throws(() => validateTallyWebhookEnvelope(payload, {
    expectedFormId: SYNTHETIC_FORM_ID, signature: syntheticSignature(payload), signingSecret: SYNTHETIC_SECRET
  }), assertCode('WEBHOOK_FIELD_SHAPE_INVALID'));

  const missingFields = syntheticPayload();
  delete missingFields.data.fields;
  assert.throws(() => validateTallyWebhookEnvelope(missingFields, {
    expectedFormId: SYNTHETIC_FORM_ID, signature: syntheticSignature(missingFields), signingSecret: SYNTHETIC_SECRET
  }), assertCode('WEBHOOK_FIELDS_INVALID'));
});
