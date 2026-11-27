'use strict';

// Exposes the repository's exact headers without duplicating their contract.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { Array, Date, Error, JSON, Map, Math, Number, Object, Set, String };
for (const relative of ['src/PassIssuanceLegacyReader.js', 'src/PassIssuanceLedger.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
}
function v2Headers() { return context.mdPassIssuanceV2Headers_(); }
function legacyHeaders() {
  const source = fs.readFileSync(path.join(root, 'src/PassIssuanceLegacyReader.js'), 'utf8');
  const match = source.match(/const MD_PASS_ISSUANCE_LEGACY_HEADERS_\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/);
  if (!match) throw Error('LEGACY_HEADER_CONTRACT_UNAVAILABLE');
  const literal = '[' + match[1] + ']';
  return vm.runInNewContext(literal, { Array });
}
module.exports = { v2Headers, legacyHeaders };
