'use strict';

// Builds a mock request description only. No transport, credentials or execution.
const { reviewInitialization } = require('./review-pass-issuance-v2-initialization.cjs');

const driveFileScope = 'https://www.googleapis.com/auth/drive.file';
const initializationSheetId = 690001;

function buildV2InitializationRequest({ config, snapshot, approval, oauthEvidence } = {}) {
  const stopped = reason => ({ status: 'BLOCKED', reason, remoteCalls: 0, writesPerformed: 0 });
  const review = reviewInitialization(config, snapshot, approval);
  if (review.status !== 'PLAN_ONLY') return review;
  if (approval.sheetId !== initializationSheetId)
    return stopped('APPROVAL_B_SHEET_ID_MISMATCH');

  const sheetIds = snapshot.tabs.map(tab => tab.sheetId);
  if (!sheetIds.length || sheetIds.some(id => !Number.isInteger(id) || id < 0 || id > 2147483647) ||
      new Set(sheetIds).size !== sheetIds.length)
    return stopped('SHEET_ID_INVENTORY_INVALID');
  if (sheetIds.includes(initializationSheetId)) return stopped('FIXED_SHEET_ID_COLLISION');

  const { clientId, scope, audience, pickedFileIds } = oauthEvidence ?? {};
  if (typeof config.initializationOAuthClientId !== 'string' || !config.initializationOAuthClientId ||
      clientId !== config.initializationOAuthClientId || audience !== clientId ||
      typeof scope !== 'string' || scope.trim() !== driveFileScope)
    return stopped('DRIVE_FILE_SCOPE_OR_CLIENT_MISMATCH');
  if (!Array.isArray(pickedFileIds) || pickedFileIds.length !== 1 || pickedFileIds[0] !== config.spreadsheetId)
    return stopped('PICKED_FILE_MISMATCH');

  const { tabName, headers } = review.plan;
  return {
    status: 'MOCK_REQUEST_ONLY',
    reason: 'LOCAL_UNVERIFIED_EVIDENCE_ONLY',
    remoteCalls: 0,
    writesPerformed: 0,
    request: {
      spreadsheetId: config.spreadsheetId,
      body: {
        includeSpreadsheetInResponse: false,
        requests: [
          {
            addSheet: {
              properties: { sheetId: initializationSheetId, title: tabName, gridProperties: { rowCount: 1, columnCount: headers.length } }
            }
          },
          {
            updateCells: {
              start: { sheetId: initializationSheetId, rowIndex: 0, columnIndex: 0 },
              rows: [{ values: headers.map(header => ({ userEnteredValue: { stringValue: header } })) }],
              fields: 'userEnteredValue'
            }
          }
        ]
      }
    }
  };
}

module.exports = { buildV2InitializationRequest, driveFileScope, initializationSheetId };
