'use strict';

// Local classification only. This module has no API client or write executor.
const { createHash } = require('node:crypto');
const { matchesDedicatedTargets } = require('./build-pass-issuance-test.cjs');
const { v2Headers } = require('./pass-issuance-test-schema.cjs');

const tabName = '_이용권발급원장V2';
const legacyName = '_이용권발급이력';
const headers = v2Headers();
const headerSha256 = createHash('sha256').update(JSON.stringify(headers)).digest('hex');

function reviewInitialization(config, snapshot, approvalEvidence) {
  const result = (status, reason) => ({ status, reason, writesPerformed: 0, remoteCalls: 0 });
  if (!matchesDedicatedTargets(config) || snapshot?.workbookId !== config.spreadsheetId)
    return result('BLOCKED', 'DEDICATED_TARGET_MISMATCH');
  if (snapshot.timeZone !== 'Asia/Seoul' || snapshot.complete !== true || !Array.isArray(snapshot.tabs) ||
      snapshot.tabs.some(tab => !tab || typeof tab.name !== 'string') ||
      new Set(snapshot.tabs.map(tab => tab.name)).size !== snapshot.tabs.length)
    return result('BLOCKED', 'SNAPSHOT_INCOMPLETE_OR_INVALID');
  if (snapshot.tabs.some(tab => tab.name === legacyName))
    return result('BLOCKED', 'LEGACY_TAB_PRESENT');

  const ledger = snapshot.tabs.find(tab => tab.name === tabName);
  if (ledger) {
    const exact = Array.isArray(ledger.headers) && ledger.headers.length === headers.length &&
      headers.every((header, index) => ledger.headers[index] === header);
    return exact && ledger.dataRows === 0
      ? result('STOP', 'V2_ALREADY_INITIALIZED_NO_RETRY')
      : result('STOP', 'V2_PARTIAL_OR_MISMATCH_PRESERVE');
  }
  if (snapshot.priorAttemptOutcome !== 'NONE')
    return result('STOP', 'PRIOR_ATTEMPT_REQUIRES_RECONCILIATION');
  if (typeof approvalEvidence?.reference !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(approvalEvidence.reference) ||
      approvalEvidence.reference !== config.approvalReferences?.B ||
      approvalEvidence.workbookId !== config.spreadsheetId || approvalEvidence.headerSha256 !== headerSha256)
    return result('BLOCKED', 'APPROVAL_B_EVIDENCE_MISSING_OR_MISMATCH');

  return {
    ...result('PLAN_ONLY', 'INDEPENDENT_REVIEW_REQUIRED'),
    plan: { tabName, headers: headers.slice(), headerSha256, dataRows: 0 }
  };
}

module.exports = { reviewInitialization, headerSha256 };
