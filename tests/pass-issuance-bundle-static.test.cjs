'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { parse } = require('acorn');
const { buildPassIssuanceTestBundle } = require('../scripts/build-pass-issuance-test.cjs');

const forbiddenNames = /^(?:DriveApp|Drive|Sheets|UrlFetchApp|PropertiesService|LockService|Session|Jdbc|Script|GmailApp|MailApp|DocumentApp|SlidesApp|FormApp|CalendarApp|Maps|AdminDirectory|Firestore|ContentService|HtmlService|XMLHttpRequest|WebSocket|fetch|require|module|global|globalThis|window|self|eval|Function|AsyncFunction|GeneratorFunction|Reflect|Proxy|constructor|__proto__|setPrototypeOf|getPrototypeOf|openByUrl|getActiveSpreadsheet|getActive|create|scripts|doGet|doPost|onOpen|onEdit|onInstall)$/;
const registeredServices = new Set(['SpreadsheetApp', 'ScriptApp', 'Utilities']);
const expectedServiceMembers = [
  'ScriptApp.getScriptId', 'SpreadsheetApp.openById', 'Utilities.Charset',
  'Utilities.DigestAlgorithm', 'Utilities.computeDigest'
];
const auditedComputedAccess = /^(?:headers\[(?:index|i)\]|row\[(?:[0-9]|1[0-2]|key|field)\]|(?:matches|ledgerRows|passRows|req|foundPass|matchingPasses)\[0\]|c\[key\])$/;

function walk(node, parent, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, node, visit));
    else walk(value, node, visit);
  }
}

test('generated TEST bundle keeps its reviewed service and dynamic-dispatch surface', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'issuance-static-audit-'));
  try {
    const bundle = buildPassIssuanceTestBundle(path.join(temporary, 'bundle'));
    const files = [...bundle.files].sort();
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    const inventory = files.map(file => `${file}\0${digest(fs.readFileSync(path.join(bundle.outputDirectory, file)))}\n`);
    t.diagnostic(`Bundle SHA-256: ${digest(inventory.join(''))}`);

    const manifest = JSON.parse(fs.readFileSync(path.join(bundle.outputDirectory, 'appsscript.json'), 'utf8'));
    assert.deepEqual(manifest, { timeZone: 'Asia/Seoul', exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8' });
    const members = [];
    const portsCalls = new Set();
    for (const file of files.filter(name => /\.(?:gs|js)$/.test(name))) {
      const source = fs.readFileSync(path.join(bundle.outputDirectory, file), 'utf8');
      const ast = parse(source, { ecmaVersion: 'latest' });
      const nodeOnly = ast.body.filter(statement => {
        const text = source.slice(statement.start, statement.end).replace(/\s/g, '');
        return /^if\(typeofmodule!=='undefined'\)module\.exports=\{[\w,]+\};$/.test(text) ||
          (file === 'PassIssuancePlan.gs' &&
            text === "constmdPassIssuanceCatalogApi_=typeofmodule!=='undefined'?require('./PassCatalog'):null;");
      });
      walk(ast, null, (node, parent) => {
        const location = `${file}:${node.start}`;
        assert.ok(!['ImportExpression', 'ThisExpression', 'WithStatement'].includes(node.type), location);
        if (node.type === 'Identifier') {
          const guardedCommonJs = ['module', 'require'].includes(node.name) &&
            nodeOnly.some(statement => node.start >= statement.start && node.end <= statement.end);
          assert.ok(guardedCommonJs || !forbiddenNames.test(node.name), `${location} ${node.name}`);
          if (registeredServices.has(node.name)) {
            assert.equal(file, 'WorkbookAccess.gs', location);
            assert.ok(parent.type === 'MemberExpression' && parent.object === node && !parent.computed, location);
            members.push(`${node.name}.${parent.property.name}`);
          }
          if (node.name === 'mdPassIssuanceRunWithPorts_')
            assert.equal(parent.type, 'FunctionDeclaration', 'runtime port engine gained a caller');
        }
        if (node.type === 'Literal' && typeof node.value === 'string') {
          assert.doesNotMatch(node.value, /https?:\/\/|googleapis\.com/);
          assert.doesNotMatch(node.value, forbiddenNames);
        }
        if (node.type === 'MemberExpression' && node.computed) {
          assert.match(source.slice(node.start, node.end), auditedComputedAccess, location);
        }
        if (node.type === 'CallExpression') {
          const callee = node.callee;
          assert.ok(callee.type === 'Identifier' || (callee.type === 'MemberExpression' && !callee.computed), location);
          if (callee.type === 'MemberExpression' && callee.object.name === 'ports') {
            assert.equal(file, 'PassIssuanceLedger.gs');
            portsCalls.add(callee.property.name);
          }
        }
        if (node.type === 'NewExpression') {
          assert.ok(node.callee.type === 'Identifier' && ['Date', 'Map', 'Set'].includes(node.callee.name), location);
        }
      });
    }
    assert.deepEqual(members.sort(), expectedServiceMembers);
    assert.deepEqual([...portsCalls].sort(), [
      'appendLedger', 'appendPass', 'createPassId', 'getLock', 'now', 'readSnapshot', 'updateLedger'
    ]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
