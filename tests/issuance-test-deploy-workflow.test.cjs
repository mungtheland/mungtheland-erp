'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { parse } = require('yaml');
const { collectKnownTargets, expectedFiles } = require('../scripts/check-pass-issuance-environment.cjs');

const root = path.resolve(__dirname, '..');
const workflowDir = path.join(root, '.github', 'workflows');
const name = 'issuance-test-deploy.yml';
const readWorkflow = file => parse(fs.readFileSync(path.join(workflowDir, file), 'utf8'));
const workflow = readWorkflow(name);
const job = workflow.jobs['prepare-test-bundle'];
const step = job.steps.find(entry => entry.run);
const program = step.run.match(/^node <<'NODE'\n([\s\S]+)\nNODE\s*$/)?.[1];
const targets = collectKnownTargets();

test('workflow is manual, hard-disabled, and disconnected from other workflows', () => {
  assert.deepEqual(workflow.on, { workflow_dispatch: null });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['prepare-test-bundle']);
  assert.equal(job.if, '${{ false }}');
  assert.equal(job.environment, 'issuance-test-deploy');
  assert.deepEqual(step.env, {
    ISSUANCE_TEST_APPS_SCRIPT_ID: '${{ secrets.ISSUANCE_TEST_APPS_SCRIPT_ID }}',
    ISSUANCE_TEST_SPREADSHEET_ID: '${{ secrets.ISSUANCE_TEST_SPREADSHEET_ID }}'
  });
  assert.equal(job.steps.filter(entry => entry.run).length, 1);
  assert.deepEqual(job.steps.filter(entry => entry.uses).map(entry => entry.uses), [
    'actions/checkout@v4', 'actions/setup-node@v4'
  ]);
  assert.doesNotMatch(step.run, /\b(?:clasp\s+(?:push|pull|deploy)|fetch\s*\(|https?:\/\/)/);
  assert.ok(program);
  for (const other of fs.readdirSync(workflowDir).filter(file => /\.ya?ml$/.test(file) && file !== name)) {
    const parsed = readWorkflow(other);
    assert.ok(!Object.hasOwn(parsed.on ?? {}, 'workflow_run'), other);
    assert.ok(!fs.readFileSync(path.join(workflowDir, other), 'utf8').includes(name), other);
  }
  assert.deepEqual(readWorkflow('deploy.yml').on, { workflow_dispatch: null });
});

function runPreparation(temp, script, sheet) {
  const result = spawnSync(process.execPath, ['-'], {
    cwd: root,
    input: program,
    encoding: 'utf8',
    env: { ...process.env, RUNNER_TEMP: temp, ISSUANCE_TEST_APPS_SCRIPT_ID: script, ISSUANCE_TEST_SPREADSHEET_ID: sheet }
  });
  assert.ifError(result.error);
  for (const value of [script, sheet].filter(Boolean)) {
    assert.ok(!result.stdout.includes(value) && !result.stderr.includes(value), 'target leaked in output');
  }
  return result;
}

test('workflow command rejects unset and known non-TEST inputs before creating files', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'issuance-workflow-negative-'));
  try {
    assert.ok(targets.guardianIds.length && targets.erpSpreadsheetIds.length && targets.guardianWorkbookIds.length);
    const scriptIds = new Set([...targets.guardianIds, ...targets.productionIds, '']);
    const sheetIds = new Set([...targets.erpSpreadsheetIds, ...targets.guardianWorkbookIds, ...targets.productionWorkbookIds, '']);
    for (const script of scriptIds) {
      for (const sheet of sheetIds) {
        const result = runPreparation(temp, script, sheet);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /ISSUANCE_TEST_TARGETS_REJECTED/);
        assert.deepEqual(fs.readdirSync(temp), []);
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

const authorizedConfig = process.env.ISSUANCE_TEST_LOCAL_CONFIG;
test('exact configured pair stages only the dedicated bundle; either wrong ID stops it', { skip: !authorizedConfig }, () => {
  const { scriptId, spreadsheetId } = JSON.parse(fs.readFileSync(authorizedConfig, 'utf8'));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'issuance-workflow-positive-'));
  try {
    for (const [script, sheet] of [
      [targets.guardianIds[0], spreadsheetId],
      [scriptId, targets.erpSpreadsheetIds[0]],
      [scriptId, targets.guardianWorkbookIds[0]],
      [scriptId, ''],
      ['', spreadsheetId]
    ]) {
      assert.equal(runPreparation(temp, script, sheet).status, 1);
      assert.deepEqual(fs.readdirSync(temp), []);
    }
    assert.equal(runPreparation(temp, scriptId, spreadsheetId).status, 0);
    const directories = fs.readdirSync(temp);
    assert.equal(directories.length, 1);
    const staging = path.join(temp, directories[0]);
    const clasp = JSON.parse(fs.readFileSync(path.join(staging, '.clasp.json'), 'utf8'));
    assert.ok(clasp.scriptId === scriptId, 'staged Script ID is not the validated target');
    assert.equal(clasp.rootDir, 'bundle');
    assert.deepEqual(fs.readdirSync(path.join(staging, clasp.rootDir)).sort(), [...expectedFiles].sort());
    assert.deepEqual(fs.readdirSync(staging).sort(), ['.clasp.json', 'bundle']);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
