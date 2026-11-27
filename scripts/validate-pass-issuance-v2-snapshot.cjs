#!/usr/bin/env node
'use strict';

// Validates only explicitly synthetic, local JSON snapshots. It has no cloud clients.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'pass-issuance-test-app', 'fixtures');
const files = [
  'src/PassCatalog.js', 'src/PassIssuancePlan.js', 'src/PassIssuanceLegacyReader.js',
  'src/PassIssuanceLedger.js', 'src/PassIssuancePreflight.js'
];

function loadContracts() {
  const context = { Array, Date, Error, JSON, Map, Math, Number, Object, Set, String };
  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    vm.runInNewContext(source, context, { filename: path.basename(relative) });
  }
  return context;
}

function validateSnapshot(snapshot, context = loadContracts()) {
  const fail = reason => ({ status: 'BLOCKED', reason });
  if (!snapshot || snapshot.mode !== 'SYNTHETIC_FIXTURE_ONLY' || snapshot.liveData !== undefined)
    return fail('SYNTHETIC_FIXTURE_REQUIRED');
  if (snapshot.v2SheetName !== context.mdPassIssuanceV2SheetName_() ||
      snapshot.legacySheetName !== context.mdPassIssuanceLegacySheetName_())
    return fail('ISSUANCE_TAB_NAME_MISMATCH');
  if (!Array.isArray(snapshot.v2Headers) || !context.mdPassIssuanceValidateV2Headers_(snapshot.v2Headers).valid)
    return fail('V2_HEADER_CONTRACT_INVALID');
  if (!Array.isArray(snapshot.legacyHeaders) || !context.mdPassIssuanceLegacyValidateHeaders_(snapshot.legacyHeaders).valid)
    return fail('LEGACY_13_HEADER_CONTRACT_INVALID');
  const ledger = context.mdPassIssuancePreflightValidateLedgerRows_(snapshot.v2Rows);
  if (!ledger.valid) return fail(ledger.reason);
  const passes = context.mdPassIssuancePreflightValidatePassRows_(snapshot.passRows);
  if (!passes.valid) return fail(passes.reason);
  const reviews = [];
  if (!Array.isArray(snapshot.legacyRows)) return fail('LEGACY_ROWS_INVALID');
  let normalizedLegacy;
  try {
    normalizedLegacy = context.mdPassIssuanceLegacyReadRows_(snapshot.legacyHeaders, snapshot.legacyRows, { sourceSheet: snapshot.legacySheetName });
  } catch (error) {
    return fail(typeof error?.message === 'string' && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'LEGACY_ROWS_INVALID');
  }
  for (const [key, reason] of [['issuanceRequestId', 'LEGACY_REQUEST_ID_DUPLICATE'], ['passId', 'LEGACY_PASS_ID_DUPLICATE']]) {
    const values = normalizedLegacy.map(row => row[key]).filter(value => value !== null && value !== undefined && value !== '');
    if (new Set(values).size !== values.length) return fail(reason);
  }
  if (normalizedLegacy.some(row => typeof row.passId !== 'string' || !row.passId || typeof row.petId !== 'string' ||
      !row.petId || !Number.isSafeInteger(row.totalUses) || row.totalUses < 1))
    return { status: 'NEEDS_REVIEW', reason: 'LEGACY_ROW_FIELDS_NEEDS_REVIEW' };
  for (const legacy of normalizedLegacy) {
    const linked = snapshot.passRows.filter(row => row.passId === legacy.passId);
    if (linked.length !== 1 || linked[0].petId !== legacy.petId || linked[0].totalUses !== legacy.totalUses)
      reviews.push('LEGACY_PASS_LINK_NEEDS_REVIEW');
    if (snapshot.v2Rows.some(row => row.passId === legacy.passId)) reviews.push('LEGACY_V2_PASS_ID_COLLISION');
  }
  for (const issued of snapshot.v2Rows) {
    if (issued.issuanceStatus !== 'COMMITTED') {
      reviews.push('V2_UNRESOLVED_STATE');
      continue;
    }
    const linked = snapshot.passRows.filter(row => row.passId === issued.passId);
    if (linked.length !== 1 || linked[0].productId !== issued.productId || linked[0].petId !== issued.petId ||
        linked[0].totalUses !== issued.totalUses)
      reviews.push('V2_PASS_PAIR_NEEDS_REVIEW');
  }
  if (reviews.length) return { status: 'NEEDS_REVIEW', reason: [...new Set(reviews)].join('|') };
  return {
    status: 'PASS', reason: 'SYNTHETIC_SNAPSHOT_VALID',
    v2HeaderCount: snapshot.v2Headers.length,
    legacyHeaderCount: snapshot.legacyHeaders.length,
    v2RowCount: snapshot.v2Rows.length,
    legacyRowCount: snapshot.legacyRows.filter(row => Array.isArray(row) && row.some(value => value !== '' && value !== null && value !== undefined)).length,
    passRowCount: snapshot.passRows.length,
    remoteCalls: 0, writesPerformed: 0
  };
}

function validateFixtureFile(inputPath) {
  const resolved = path.resolve(inputPath);
  if (resolved !== fixtureRoot && !resolved.startsWith(fixtureRoot + path.sep))
    return { status: 'BLOCKED', reason: 'FIXTURE_PATH_OUTSIDE_ALLOWLIST' };
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())
    return { status: 'BLOCKED', reason: 'FIXTURE_NOT_FOUND' };
  const realRoot = fs.realpathSync(fixtureRoot);
  const realFile = fs.realpathSync(resolved);
  if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep))
    return { status: 'BLOCKED', reason: 'FIXTURE_SYMLINK_OUTSIDE_ALLOWLIST' };
  try {
    return validateSnapshot(JSON.parse(fs.readFileSync(resolved, 'utf8')));
  } catch (_) {
    return { status: 'BLOCKED', reason: 'FIXTURE_JSON_INVALID' };
  }
}

if (require.main === module) {
  const result = process.argv[2] ? validateFixtureFile(process.argv[2]) : { status: 'BLOCKED', reason: 'FIXTURE_PATH_REQUIRED' };
  console.log(JSON.stringify(result));
  if (result.status !== 'PASS') process.exitCode = 1;
}

module.exports = { validateSnapshot, validateFixtureFile };
