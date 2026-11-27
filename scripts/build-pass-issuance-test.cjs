#!/usr/bin/env node
'use strict';

// Builds a local-only Apps Script bundle. It never authenticates, pushes, or deploys.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sources = [
  ['src/PassCatalog.js', 'PassCatalog.gs'],
  ['src/PassIssuancePlan.js', 'PassIssuancePlan.gs'],
  ['src/PassIssuanceLegacyReader.js', 'PassIssuanceLegacyReader.gs'],
  ['src/PassIssuanceLedger.js', 'PassIssuanceLedger.gs'],
  ['src/PassIssuancePreflight.js', 'PassIssuancePreflight.gs'],
  ['pass-issuance-test-app/WorkbookAccess.gs', 'WorkbookAccess.gs']
];
const targetPins = {
  spreadsheet: '81314169a93f6b95ed4de8e9228f4337d158a45e5033e36be649c3d93690c343',
  script: '7f24cd0bf1343ab72db618e312732d100842f2273fd91d0c0e46816877e528ce'
};

function matchesDedicatedTargets(config) {
  const matches = (id, pin) => typeof id === 'string' &&
    /^[A-Za-z0-9_-]{20,128}$/.test(id) && createHash('sha256').update(id).digest('hex') === pin;
  return matches(config?.spreadsheetId, targetPins.spreadsheet) && matches(config?.scriptId, targetPins.script);
}

function projectLedgerForTest(content) {
  const start = 'function mdPassIssuanceSpreadsheetPorts_(){';
  const end = 'function mdReconcilePassIssuanceSnapshots_(';
  const from = content.indexOf(start);
  const to = content.indexOf(end);
  if (from < 0 || to <= from || content.lastIndexOf(start) !== from || content.lastIndexOf(end) !== to)
    throw Error('TEST_LEDGER_BOUNDARY_MISSING');
  return content.slice(0, from) + content.slice(to);
}

// A build-time tripwire for the shared modules, not a sandbox for untrusted code.
const sharedServiceReference = /\b(?:SpreadsheetApp|DriveApp|UrlFetchApp|ScriptApp|PropertiesService|LockService|Jdbc|GmailApp|MailApp|DocumentApp|SlidesApp|FormApp|ContentService|HtmlService|openById|openByUrl|getActiveSpreadsheet|mdBook_|globalThis|eval|Function|fetch)\b|\b(?:Sheets|Drive)\s*[.\[]/;

function buildPassIssuanceTestBundle(outputDirectory) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) throw Error('OUTPUT_DIRECTORY_REQUIRED');
  const output = path.resolve(outputDirectory);
  if (fs.existsSync(output)) throw Error('OUTPUT_DIRECTORY_EXISTS');
  const manifestPath = path.join(root, 'pass-issuance-test-app', 'appsscript.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestKeys = new Set(['timeZone', 'runtimeVersion', 'exceptionLogging']);
  if (Object.keys(manifest).some(key => !manifestKeys.has(key)) ||
      manifest.timeZone !== 'Asia/Seoul' || manifest.runtimeVersion !== 'V8')
    throw Error('TEST_MANIFEST_INVALID');
  const files = sources.map(([source, target]) => {
    let content = fs.readFileSync(path.join(root, source), 'utf8');
    if (!content.trim()) throw Error('SOURCE_EMPTY');
    if (target === 'PassIssuanceLedger.gs') content = projectLedgerForTest(content);
    if (target === 'WorkbookAccess.gs') {
      content = content.replace('__TEST_SPREADSHEET_PIN__', targetPins.spreadsheet)
        .replace('__TEST_SCRIPT_PIN__', targetPins.script);
    } else if (sharedServiceReference.test(content)) {
      throw Error('TEST_SHARED_SOURCE_SERVICE_REFERENCE');
    }
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

module.exports = { buildPassIssuanceTestBundle, matchesDedicatedTargets };
