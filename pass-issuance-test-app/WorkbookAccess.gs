'use strict';

const MD_ISSUANCE_TEST_SPREADSHEET_PIN_ = '__TEST_SPREADSHEET_PIN__';
const MD_ISSUANCE_TEST_SCRIPT_PIN_ = '__TEST_SCRIPT_PIN__';

function mdIssuanceTestTargetMatches_(id, pin) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(id)) return false;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id, Utilities.Charset.UTF_8);
  return digest.map(byte => (byte & 255).toString(16).padStart(2, '0')).join('') === pin;
}

function mdReadPassIssuanceTestWorkbook_(spreadsheetId) {
  if (!mdIssuanceTestTargetMatches_(spreadsheetId, MD_ISSUANCE_TEST_SPREADSHEET_PIN_))
    throw Error('TEST_WORKBOOK_TARGET_REJECTED');
  if (!mdIssuanceTestTargetMatches_(ScriptApp.getScriptId(), MD_ISSUANCE_TEST_SCRIPT_PIN_))
    throw Error('TEST_SCRIPT_TARGET_REJECTED');

  const workbook = SpreadsheetApp.openById(spreadsheetId);
  if (workbook.getId() !== spreadsheetId) throw Error('TEST_WORKBOOK_ID_MISMATCH');
  return { sheetNames: workbook.getSheets().map(sheet => sheet.getName()) };
}

function mdPersistPassIssuance_() {
  return { status: 'DISABLED', reason: 'ISSUANCE_STORAGE_DISABLED' };
}
