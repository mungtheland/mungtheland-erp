'use strict';

const { EXPECTED_COLUMN_COUNT, KNOWN_HEADERS } = require('./tally-admission-csv');

const headers = Array.from({ length: EXPECTED_COLUMN_COUNT }, (_, index) => `SYNTHETIC COLUMN ${index + 1} - original title unavailable`);
for (const [column, label] of Object.entries(KNOWN_HEADERS)) headers[Number(column) - 1] = label;

function createSyntheticCsvRow() {
  const row = Array(EXPECTED_COLUMN_COUNT).fill('');
  row[0] = 'SYNTHETIC-SUBMISSION-ONLY';
  row[1] = 'SYNTHETIC-RESPONDENT-ONLY';
  row[2] = '2026-11-28T00:00:00.000Z';
  row[4] = '01000000001';
  row[53] = '01000000001';
  row[54] = '01000000002';
  for (let i = 40; i < 50; i++) row[i] = i % 2 === 0 ? 'SYNTHETIC-ACCEPTED' : 'SYNTHETIC-ACCEPTED';
  row[50] = '';
  row[51] = 'https://synthetic.invalid/signature/reference';
  row[52] = 'Synthetic Signer';
  return row;
}

function createSyntheticCsv(rows = [createSyntheticCsvRow()]) {
  const escape = value => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
}

module.exports = { headers, createSyntheticCsvRow, createSyntheticCsv };
