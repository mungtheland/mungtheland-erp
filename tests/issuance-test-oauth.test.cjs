'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { once } = require('node:events');
const { driveFileScope } = require('../scripts/build-pass-issuance-v2-request.cjs');
const { collectKnownTargets } = require('../scripts/check-pass-issuance-environment.cjs');
const { validateDesktopConfig, newAuthorization, verifyCallback, receiveCallback, parseCommandLine, assertApprovedTransport } =
  require('../scripts/issuance-test-oauth.cjs');

const configPath = process.env.ISSUANCE_TEST_LOCAL_CONFIG;
const config = configPath ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;
const desktopFixture = {
  installed: {
    project_id: 'mungtheland-issuance-test', client_id: 'mock-desktop.apps.googleusercontent.com',
    client_secret: 'MOCK-DESKTOP-SECRET', auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token'
  }
};
const client = validateDesktopConfig(desktopFixture);
const known = collectKnownTargets();

test('Desktop configuration and CLI require the exact read-only mode and approval', () => {
  assert.throws(() => validateDesktopConfig({ web: desktopFixture.installed }), /DESKTOP_CLIENT_CONFIGURATION_INVALID/);
  assert.throws(() => validateDesktopConfig({ installed: { ...desktopFixture.installed, project_id: 'other' } }),
    /DESKTOP_CLIENT_CONFIGURATION_INVALID/);
  for (const args of [['--authorize'], ['--authorize', '--read-metadata']]) {
    const run = spawnSync(process.execPath, ['scripts/issuance-test-oauth.cjs', ...args], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /READ_ONLY_MODE_REQUIRED/);
  }
  const invalid = spawnSync(process.execPath, ['scripts/issuance-test-oauth.cjs', '--read-metadata'], { encoding: 'utf8' });
  assert.match(invalid.stderr, /READ_ONLY_MODE_REQUIRED/);
  const approved = ['--authorize', '--read-metadata', '--approval', 'ERP-ISSUANCE-OAUTH-READ-20261128-01'];
  for (const reference of ['ERP-ISSUANCE-A-20261127-01', 'B', 'C', '']) {
    assert.throws(() => parseCommandLine([...approved.slice(0, 3), reference]), /READ_ONLY_APPROVAL_MISMATCH/);
  }
  assert.equal(parseCommandLine(approved), 'read-metadata');
  assert.throws(() => parseCommandLine([...approved, '--other-file']), /READ_ONLY_MODE_REQUIRED/);
});

function pickerCallback(url, patch = {}) {
  const redirect = new URL(url.searchParams.get('redirect_uri'));
  const fields = {
    state: url.searchParams.get('state'), picked_file_ids: url.searchParams.get('file_ids'),
    scope: driveFileScope, code: 'mock-authorization-code', ...patch
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null) redirect.searchParams.append(key, value);
  }
  return redirect;
}

async function mockSession(options = {}) {
  const auth = newAuthorization('http://127.0.0.1:32035/oauth/callback', client.id, config);
  if (options.badPkce) auth.verifier += 'x';
  const callback = pickerCallback(auth.url, options.callback);
  const calls = [];
  let clock = 1000;
  const server = http.createServer(async (request, response) => {
    const localUrl = new URL(request.url, 'http://127.0.0.1');
    const route = localUrl.pathname;
    calls.push(route);
    const send = (status, data) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    if (options.networkFailure === route) return request.socket.destroy();
    if (route === '/token') {
      let text = '';
      for await (const chunk of request) text += chunk;
      const body = new URLSearchParams(text);
      const challenge = createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url');
      if (challenge !== auth.url.searchParams.get('code_challenge'))
        return send(400, { error: 'invalid_grant' });
      if (request.method !== 'POST' || body.get('redirect_uri') !== auth.redirect.href ||
          body.get('client_id') !== client.id || body.get('grant_type') !== 'authorization_code')
        return send(400, { error: 'invalid_request' });
      return send(200, { token_type: 'Bearer', access_token: 'mock-token', scope: driveFileScope, expires_in: 30, ...options.exchange });
    }
    if (request.headers.authorization !== 'Bearer mock-token') return send(401, {});
    if (route === '/tokeninfo') {
      if (request.method !== 'POST' || request.headers['content-type'] !== 'application/x-www-form-urlencoded;charset=UTF-8')
        return send(400, {});
      return send(200, { aud: client.id, scope: driveFileScope, expires_in: '30', ...options.tokenInfo });
    }
    if (route === '/drive/v3/about') {
      if (request.method !== 'GET' || localUrl.searchParams.get('fields') !== 'user(emailAddress)') return send(400, {});
      if (options.expireAfterAccount) clock += 31000;
      return send(200, { user: { emailAddress: options.account ?? config.ownerAccount } });
    }
    if (route === `/v4/spreadsheets/${config.spreadsheetId}`) {
      if (request.method !== 'GET' || localUrl.searchParams.get('fields') !== 'spreadsheetId,properties(timeZone)')
        return send(400, {});
      return send(200, { spreadsheetId: config.spreadsheetId, properties: { timeZone: 'Asia/Seoul' }, ...options.sheet });
    }
    return send(404, {});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const requestJson = async (url, init) => {
      const endpoint = new URL(url);
      const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint.pathname}${endpoint.search}`,
        { ...init, redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw Error('mock rejection');
      return response.json();
    };
    const result = await verifyCallback({
      authorization: auth, callback, config, client, requestJson, readMetadata: options.readMetadata, now: () => clock
    }).catch(error => ({ error: error.message }));
    return { result, calls };
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

test('PKCE S256, restricted Picker and actual loopback callback work locally', { skip: !config }, async () => {
  const outcome = await receiveCallback(client.id, config, {
    timeoutMs: 5000,
    async openBrowser(url) {
      assert.equal(url.origin, 'https://accounts.google.com');
      assert.equal(url.searchParams.get('scope'), driveFileScope);
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(url.searchParams.get('trigger_onepick'), 'true');
      assert.equal(url.searchParams.get('prompt'), 'consent');
      assert.equal(url.searchParams.get('access_type'), 'online');
      assert.equal(url.searchParams.get('file_ids'), config.spreadsheetId);
      assert.equal(url.searchParams.has('allow_multiple'), false);
      const reply = await fetch(pickerCallback(url));
      assert.equal(reply.status, 200);
    }
  });
  assert.equal(outcome.authorization.url.searchParams.get('code_challenge'),
    createHash('sha256').update(outcome.authorization.verifier).digest('base64url'));
  assert.equal(outcome.authorization.redirect.hostname, '127.0.0.1');
  assert.throws(() => newAuthorization(outcome.authorization.redirect.href, client.id,
    { ...config, ownerAccount: 'another@example.invalid' }), /DEDICATED_CONFIGURATION_INVALID/);
  for (const spreadsheetId of [...known.erpSpreadsheetIds, ...known.guardianWorkbookIds]) {
    assert.throws(() => newAuthorization(outcome.authorization.redirect.href, client.id, { ...config, spreadsheetId }),
      /DEDICATED_CONFIGURATION_INVALID/);
  }
});

test('valid mock exchange verifies account and reads metadata only with explicit opt-in', { skip: !config }, async () => {
  const offlineRead = await mockSession();
  assert.deepEqual(offlineRead.result, { status: 'AUTHORIZATION_CHECKED', sheetsAccess: 'NOT_RUN' });
  assert.deepEqual(offlineRead.calls, ['/token', '/tokeninfo', '/drive/v3/about']);
  const metadata = await mockSession({ readMetadata: true });
  assert.deepEqual(metadata.result, {
    status: 'AUTHORIZATION_CHECKED', sheetsAccess: 'METADATA_ONLY', spreadsheetIdMatched: true, timeZone: 'Asia/Seoul'
  });
  assert.equal(metadata.calls.length, 4);
  assert.equal(metadata.calls[3], `/v4/spreadsheets/${config.spreadsheetId}`);
});

test('static source and transport reject Sheets writes and all other file reads', { skip: !config }, () => {
  const source = fs.readFileSync(require.resolve('../scripts/issuance-test-oauth.cjs'), 'utf8');
  assert.doesNotMatch(source, /batchUpdate|appendRow|setValues|values\.get|includeGridData|insertSheet|[^\w]DELETE[^\w]|[^\w]PATCH[^\w]/);
  assert.equal((source.match(/sheets\.googleapis\.com/g) ?? []).length, 1);
  const target = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}`;
  const metadata = target + '?fields=spreadsheetId%2Cproperties%28timeZone%29';
  assert.doesNotThrow(() => assertApprovedTransport(config, metadata, { method: 'GET' }));
  for (const [url, method] of [
    [target + ':batchUpdate', 'POST'], [metadata, 'PATCH'], [metadata, 'POST'], [target, 'GET'],
    [target + '/values/A1', 'GET'], [metadata + '&includeGridData=true', 'GET'],
    ['https://www.googleapis.com/drive/v3/files', 'GET'],
    ...[...known.erpSpreadsheetIds, ...known.guardianWorkbookIds].map(id =>
      [metadata.replace(config.spreadsheetId, id), 'GET'])
  ]) {
    assert.throws(() => assertApprovedTransport(config, url, { method }), /REQUEST_OUTSIDE_READ_ONLY_APPROVAL/);
  }
});

test('invalid callbacks fail without exchanging a code', { skip: !config }, async () => {
  for (const [callback, expected] of [
    [{ state: 'wrong' }, 'STATE_MISMATCH'],
    [{ error: 'access_denied', code: null }, 'PICKER_CANCELLED_OR_DENIED'],
    [{ picked_file_ids: null }, 'PICKED_FILE_MISMATCH'],
    [{ picked_file_ids: known.erpSpreadsheetIds[0] }, 'PICKED_FILE_MISMATCH'],
    [{ picked_file_ids: [config.spreadsheetId, known.guardianWorkbookIds[0]].join(',') }, 'PICKED_FILE_MISMATCH'],
    [{ scope: `${driveFileScope} https://www.googleapis.com/auth/drive` }, 'CALLBACK_SCOPE_MISMATCH']
  ]) {
    const { result, calls } = await mockSession({ callback });
    assert.equal(result.error, expected);
    assert.deepEqual(calls, []);
  }
});

test('PKCE, scopes, client, account, expiry and network failures stop before Sheets', { skip: !config }, async () => {
  for (const [options, expected] of [
    [{ badPkce: true }, 'TOKEN_EXCHANGE_FAILED'],
    [{ exchange: { scope: `${driveFileScope} https://www.googleapis.com/auth/spreadsheets` } }, 'TOKEN_SCOPE_MISMATCH'],
    [{ tokenInfo: { scope: 'https://www.googleapis.com/auth/drive' } }, 'TOKEN_SCOPE_MISMATCH'],
    [{ tokenInfo: { aud: 'another-client' } }, 'TOKEN_CLIENT_MISMATCH'],
    [{ tokenInfo: { azp: 'another-client' } }, 'TOKEN_CLIENT_MISMATCH'],
    [{ tokenInfo: { aud: undefined } }, 'TOKEN_CLIENT_MISMATCH'],
    [{ account: 'another@example.invalid' }, 'ACCOUNT_IDENTITY_MISMATCH'],
    [{ account: '' }, 'ACCOUNT_IDENTITY_MISMATCH'],
    [{ tokenInfo: { expires_in: '0' } }, 'TOKEN_EXPIRY_UNVERIFIED'],
    [{ expireAfterAccount: true }, 'TOKEN_EXPIRED'],
    [{ networkFailure: '/tokeninfo' }, 'TOKEN_METADATA_UNVERIFIED']
  ]) {
    const { result, calls } = await mockSession({ ...options, readMetadata: true });
    assert.equal(result.error, expected);
    assert.ok(calls.every(route => !route.startsWith('/v4/')));
  }
  const result = await mockSession({ readMetadata: true, sheet: { spreadsheetId: 'wrong' } });
  assert.equal(result.result.error, 'TEST_METADATA_MISMATCH');
});
