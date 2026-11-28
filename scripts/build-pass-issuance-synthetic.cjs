'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { v2Headers } = require('./pass-issuance-test-schema.cjs');
const { validateSnapshot } = require('./validate-pass-issuance-v2-snapshot.cjs');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readFixture = file => JSON.parse(read(`pass-issuance-test-app/fixtures/${file}.json`));

function buildIssuanceSyntheticBundle(output) {
  if (typeof output !== 'string' || !output.trim() || fs.existsSync(output)) throw Error('INVALID_OUTPUT_DIRECTORY');
  const fixture = readFixture('normal-synthetic-issuance');
  const snapshot = readFixture('empty-synthetic-snapshot');
  if (fixture.mode !== 'SYNTHETIC_FIXTURE_ONLY' || validateSnapshot(snapshot).status !== 'PASS' ||
      [snapshot.v2Rows, snapshot.legacyRows, snapshot.passRows].some(rows => rows.length))
    throw Error('SYNTHETIC_FIXTURE_INVALID');
  const input = {
    ...fixture,
    snapshot: {
      ...snapshot,
      mode: 'SYNTHETIC_FIXTURE',
      complete: true,
      legacyPaymentReferenceCoverage: 'COMPLETE'
    }
  };

  const ledger = read('src/PassIssuanceLedger.js');
  const start = ledger.indexOf('function mdPassIssuanceV2SheetName_()');
  const end = ledger.indexOf('function mdPassIssuanceExactMatches_(');
  if (start < 0 || end <= start) throw Error('V2_SCHEMA_BOUNDARY_MISSING');
  const schema = [
    `const MD_PASS_ISSUANCE_LEDGER_SHEET_ = ${JSON.stringify(snapshot.v2SheetName)};`,
    `const MD_PASS_ISSUANCE_HEADERS_ = Object.freeze(${JSON.stringify(v2Headers())});`,
    `function mdPassIssuanceLegacySheetName_() { return ${JSON.stringify(snapshot.legacySheetName)}; }`,
    ledger.slice(start, end)
  ].join('\n');

  const files = {
    'PassCatalog.gs': read('src/PassCatalog.js'),
    'PassIssuancePlan.gs': read('src/PassIssuancePlan.js'),
    'PassIssuancePreflight.gs': read('src/PassIssuancePreflight.js'),
    'SyntheticSchema.gs': schema,
    'SyntheticCheck.gs': read('pass-issuance-test-app/SyntheticCheck.gs')
      .replace('__TEST_SCRIPT_PIN__', '7f24cd0bf1343ab72db618e312732d100842f2273fd91d0c0e46816877e528ce')
      .replace('__SYNTHETIC_INPUT_JSON__', () => JSON.stringify(JSON.stringify(input))),
    'appsscript.json': JSON.stringify({ timeZone: 'Asia/Seoul', runtimeVersion: 'V8', exceptionLogging: 'STACKDRIVER' }, null, 2) + '\n'
  };
  new vm.Script(Object.entries(files).filter(([name]) => name.endsWith('.gs')).map(([, source]) => source).join('\n;\n'));
  fs.mkdirSync(output);
  for (const [name, source] of Object.entries(files)) fs.writeFileSync(path.join(output, name), source, { flag: 'wx' });
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const inventory = Object.keys(files).sort().map(name => `${name}\0${digest(files[name])}\n`);
  return { files: Object.keys(files).sort(), bundleHash: digest(inventory.join('')) };
}

if (require.main === module) console.log(JSON.stringify(buildIssuanceSyntheticBundle(process.argv[2])));

module.exports = { buildIssuanceSyntheticBundle };
