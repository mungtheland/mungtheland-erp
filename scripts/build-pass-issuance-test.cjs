#!/usr/bin/env node
'use strict';

// Builds a local-only Apps Script bundle. It never authenticates, pushes, or deploys.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sources = [
  ['src/PassCatalog.js', 'PassCatalog.gs'],
  ['src/PassIssuancePlan.js', 'PassIssuancePlan.gs'],
  ['src/PassIssuanceLegacyReader.js', 'PassIssuanceLegacyReader.gs'],
  ['src/PassIssuanceLedger.js', 'PassIssuanceLedger.gs'],
  ['src/PassIssuancePreflight.js', 'PassIssuancePreflight.gs']
];

function buildPassIssuanceTestBundle(outputDirectory) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) throw Error('OUTPUT_DIRECTORY_REQUIRED');
  const output = path.resolve(outputDirectory);
  if (fs.existsSync(output)) throw Error('OUTPUT_DIRECTORY_EXISTS');
  const manifestPath = path.join(root, 'pass-issuance-test-app', 'appsscript.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.scriptId || manifest.timeZone !== 'Asia/Seoul' || manifest.runtimeVersion !== 'V8')
    throw Error('TEST_MANIFEST_INVALID');
  const files = sources.map(([source, target]) => {
    const content = fs.readFileSync(path.join(root, source), 'utf8');
    if (!content.trim()) throw Error('SOURCE_EMPTY');
    return { source, target, content };
  });
  const targets = files.map(file => file.target);
  if (new Set(targets).size !== targets.length || targets.includes('appsscript.json'))
    throw Error('BUNDLE_TARGET_DUPLICATE');
  new vm.Script(files.map(file => file.content).join('\n;\n'), { filename: 'pass-issuance-bundle.gs' });
  fs.mkdirSync(output, { recursive: false });
  for (const file of files) fs.writeFileSync(path.join(output, file.target), file.content, 'utf8');
  fs.writeFileSync(path.join(output, 'appsscript.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { outputDirectory: output, files: [...targets, 'appsscript.json'], manifestValidated: true, remoteCalls: 0 };
}

if (require.main === module) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mungtheland-pass-issuance-test-'));
  const result = buildPassIssuanceTestBundle(path.join(temporaryRoot, 'bundle'));
  console.log(JSON.stringify({ fileCount: result.files.length, manifestValidated: result.manifestValidated, remoteCalls: 0 }));
}

module.exports = { buildPassIssuanceTestBundle };
