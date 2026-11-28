'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

class TallyWebhookError extends Error {
  constructor(code) {
    super(code);
    this.name = 'TallyWebhookError';
    this.code = code;
  }
}

function fail(code) { throw new TallyWebhookError(code); }

/** Tally's documented Express example signs JSON.stringify(parsedPayload) with HMAC-SHA256/base64. */
function verifyTallyWebhookSignature(payload, signature, signingSecret) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('WEBHOOK_PAYLOAD_INVALID');
  if (typeof signature !== 'string' || !signature || typeof signingSecret !== 'string' || !signingSecret) {
    fail('WEBHOOK_SIGNATURE_CONFIGURATION_REQUIRED');
  }
  let serialized;
  try { serialized = JSON.stringify(payload); } catch (_) { fail('WEBHOOK_PAYLOAD_INVALID'); }
  const expected = createHmac('sha256', signingSecret).update(serialized).digest('base64');
  const receivedBytes = Buffer.from(signature, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (receivedBytes.length !== expectedBytes.length || !timingSafeEqual(receivedBytes, expectedBytes)) {
    fail('WEBHOOK_SIGNATURE_INVALID');
  }
  return true;
}

/**
 * Validates documented envelope shape and authentication only; it does not map answers
 * or access Tally. Form-specific question IDs and expectedFormId must be verified separately.
 */
function validateTallyWebhookEnvelope(payload, { expectedFormId, signature, signingSecret } = {}) {
  verifyTallyWebhookSignature(payload, signature, signingSecret);
  if (typeof expectedFormId !== 'string' || !expectedFormId.trim()) fail('TALLY_FORM_ID_PENDING');
  if (payload.eventType !== 'FORM_RESPONSE' || typeof payload.eventId !== 'string' || !payload.eventId ||
      !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) fail('WEBHOOK_ENVELOPE_INVALID');
  const data = payload.data;
  if (data.formId !== expectedFormId) fail('TALLY_FORM_ID_MISMATCH');
  for (const field of ['responseId', 'submissionId', 'createdAt']) {
    if (typeof data[field] !== 'string' || !data[field]) fail('WEBHOOK_ENVELOPE_INVALID');
  }
  if (!Array.isArray(data.fields)) fail('WEBHOOK_FIELDS_INVALID');
  const keys = new Set();
  for (const field of data.fields) {
    if (!field || typeof field !== 'object' || typeof field.key !== 'string' || !field.key ||
        typeof field.label !== 'string' || typeof field.type !== 'string' || keys.has(field.key)) {
      fail('WEBHOOK_FIELD_SHAPE_INVALID');
    }
    keys.add(field.key);
  }
  return Object.freeze({
    verified: true,
    eventType: payload.eventType,
    eventId: payload.eventId,
    submissionId: data.submissionId,
    responseId: data.responseId,
    formId: data.formId,
    createdAt: data.createdAt,
    respondentIdPresent: typeof data.respondentId === 'string' && Boolean(data.respondentId),
    fieldCount: data.fields.length,
    answersMapped: false
  });
}

module.exports = { TallyWebhookError, verifyTallyWebhookSignature, validateTallyWebhookEnvelope };
