'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { matchesDedicatedTargets } = require('./build-pass-issuance-test.cjs');
const { driveFileScope } = require('./build-pass-issuance-v2-request.cjs');

const root = path.resolve(__dirname, '..');
const oauthPath = 'pass-issuance-test-app/.env.issuance-oauth.json';
const environmentPath = 'pass-issuance-test-app/environment.local.json';
const endpoints = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  tokenInfo: 'https://oauth2.googleapis.com/tokeninfo',
  account: 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)'
};
const callbackPath = '/oauth/callback';
const ownerAccountPin = '0b282505d57e7f446fed0bfa5364d5e883dca171fd5d353ca6b836f53398d0c2';
const liveAuthorizationApproval = null;
const liveMetadataApproval = null;

class ReviewError extends Error {}
function requireEvidence(condition, code) {
  if (!condition) throw new ReviewError(code);
}

function readIgnoredJson(relative, missingCode) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new ReviewError(missingCode);
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relative], { cwd: root, stdio: 'ignore' });
    requireEvidence(fs.lstatSync(file).isFile() && fs.realpathSync(file) === path.join(fs.realpathSync(root), relative),
      'LOCAL_FILE_NOT_ALLOWED');
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new ReviewError('LOCAL_FILE_NOT_ALLOWED_OR_INVALID');
  }
}

function validateDesktopConfig(downloaded) {
  const client = downloaded?.installed;
  requireEvidence(!downloaded?.web && client?.project_id === 'mungtheland-issuance-test' &&
    typeof client.client_id === 'string' && /^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(client.client_id) &&
    typeof client.client_secret === 'string' && client.client_secret.length > 0 &&
    [endpoints.authorize, 'https://accounts.google.com/o/oauth2/auth'].includes(client.auth_uri) &&
    client.token_uri === endpoints.token,
  'DESKTOP_CLIENT_CONFIGURATION_INVALID');
  return { id: client.client_id, secret: client.client_secret };
}

function isDedicatedConfig(config) {
  return matchesDedicatedTargets(config) && typeof config.ownerAccount === 'string' &&
    createHash('sha256').update(config.ownerAccount).digest('hex') === ownerAccountPin;
}

function newAuthorization(redirectUri, clientId, config) {
  requireEvidence(isDedicatedConfig(config), 'DEDICATED_CONFIGURATION_INVALID');
  const redirect = new URL(redirectUri);
  requireEvidence(redirect.protocol === 'http:' && redirect.hostname === '127.0.0.1' && redirect.port &&
    redirect.pathname === callbackPath && !redirect.search && !redirect.hash && !redirect.username && !redirect.password,
  'LOOPBACK_REDIRECT_INVALID');
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const url = new URL(endpoints.authorize);
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect.href, response_type: 'code', scope: driveFileScope,
    state, code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', access_type: 'online', prompt: 'consent', trigger_onepick: 'true',
    file_ids: config.spreadsheetId, mimetypes: 'application/vnd.google-apps.spreadsheet',
    login_hint: config.ownerAccount
  });
  return { url, redirect, state, verifier, workbookId: config.spreadsheetId };
}

function soleScope(scope) {
  return typeof scope === 'string' && scope.trim() === driveFileScope;
}

function validateCallback(callback, authorization) {
  const uri = new URL(callback);
  requireEvidence(uri.origin === authorization.redirect.origin && uri.pathname === callbackPath &&
    !uri.username && !uri.password && !uri.hash, 'CALLBACK_LOCATION_MISMATCH');
  const one = key => {
    const values = uri.searchParams.getAll(key);
    requireEvidence(values.length <= 1, 'DUPLICATE_CALLBACK_PARAMETER');
    return values[0];
  };
  const received = Buffer.from(one('state') ?? '');
  const expected = Buffer.from(authorization.state);
  requireEvidence(received.length === expected.length && timingSafeEqual(received, expected), 'STATE_MISMATCH');
  requireEvidence(!uri.searchParams.has('error'), 'PICKER_CANCELLED_OR_DENIED');
  requireEvidence(one('picked_file_ids') === authorization.workbookId, 'PICKED_FILE_MISMATCH');
  requireEvidence(soleScope(one('scope')), 'CALLBACK_SCOPE_MISMATCH');
  const code = one('code');
  requireEvidence(typeof code === 'string' && code.length > 0 && code.length <= 2048, 'AUTHORIZATION_CODE_MISSING');
  return code;
}

function validLifetime(value) {
  const seconds = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  requireEvidence(Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400, 'TOKEN_EXPIRY_UNVERIFIED');
  return seconds * 1000;
}

async function verifyCallback({ config, client, authorization, callback, requestJson, readMetadata = false, now = Date.now }) {
  requireEvidence(isDedicatedConfig(config) && authorization.workbookId === config.spreadsheetId &&
    authorization.url.searchParams.get('client_id') === client.id, 'DEDICATED_CONFIGURATION_INVALID');
  const code = validateCallback(callback, authorization);
  const call = async (url, options, failure) => {
    try { return await requestJson(url, options); }
    catch { throw new ReviewError(failure); }
  };
  let token;
  let exchanged;
  try {
    const exchangeStarted = now();
    exchanged = await call(endpoints.token, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code', client_id: client.id, client_secret: client.secret,
        redirect_uri: authorization.redirect.href, code, code_verifier: authorization.verifier
      })
    }, 'TOKEN_EXCHANGE_FAILED');
    requireEvidence(exchanged?.token_type === 'Bearer' && typeof exchanged.access_token === 'string' &&
      /^[A-Za-z0-9._~+\/-]+=*$/.test(exchanged.access_token), 'TOKEN_RESPONSE_INVALID');
    token = exchanged.access_token;
    const exchangeScope = exchanged.scope;
    const exchangedLifetime = exchanged.expires_in;
    exchanged = undefined;
    requireEvidence(soleScope(exchangeScope), 'TOKEN_SCOPE_MISMATCH');
    const exchangeExpiry = exchangeStarted + validLifetime(exchangedLifetime);
    requireEvidence(now() < exchangeExpiry, 'TOKEN_EXPIRED');
    const bearer = { authorization: `Bearer ${token}` };
    const inspectionStarted = now();
    const info = await call(endpoints.tokenInfo, { method: 'POST', headers: bearer }, 'TOKEN_METADATA_UNVERIFIED');
    requireEvidence(info?.aud === client.id && (info.azp === undefined || info.azp === client.id), 'TOKEN_CLIENT_MISMATCH');
    requireEvidence(soleScope(info.scope), 'TOKEN_SCOPE_MISMATCH');
    const expiresAt = Math.min(exchangeExpiry, inspectionStarted + validLifetime(info.expires_in));
    const checkExpiry = () => requireEvidence(now() < expiresAt, 'TOKEN_EXPIRED');
    checkExpiry();

    const account = await call(endpoints.account, { method: 'GET', headers: bearer }, 'ACCOUNT_IDENTITY_UNVERIFIED');
    requireEvidence(typeof config.ownerAccount === 'string' &&
      account?.user?.emailAddress === config.ownerAccount, 'ACCOUNT_IDENTITY_MISMATCH');
    checkExpiry();
    if (!readMetadata) return { status: 'AUTHORIZATION_CHECKED', sheetsAccess: 'NOT_RUN' };

    const metadataUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}`);
    metadataUrl.searchParams.set('fields', 'spreadsheetId,properties(timeZone)');
    const sheet = await call(metadataUrl.href, { method: 'GET', headers: bearer }, 'TEST_METADATA_UNVERIFIED');
    checkExpiry();
    requireEvidence(sheet?.spreadsheetId === config.spreadsheetId && sheet.properties?.timeZone === 'Asia/Seoul',
      'TEST_METADATA_MISMATCH');
    return { status: 'AUTHORIZATION_CHECKED', sheetsAccess: 'METADATA_ONLY' };
  } finally {
    token = undefined;
    exchanged = undefined;
  }
}

function openSystemBrowser(url) {
  const command = process.platform === 'win32' ? ['rundll32.exe', 'url.dll,FileProtocolHandler']
    : process.platform === 'darwin' ? ['open'] : ['xdg-open'];
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], [...command.slice(1), url.href], { stdio: 'ignore', windowsHide: true });
    child.once('error', () => reject(new ReviewError('SYSTEM_BROWSER_START_FAILED')));
    child.once('exit', code => code === 0 ? resolve() : reject(new ReviewError('SYSTEM_BROWSER_START_FAILED')));
  });
}

async function receiveCallback(clientId, config, { openBrowser = openSystemBrowser, timeoutMs = 180000 } = {}) {
  let host;
  let settle;
  const callback = new Promise(resolve => { settle = resolve; });
  const server = http.createServer((request, response) => {
    const target = request.url ?? '';
    if (request.method !== 'GET' || request.headers.host !== host || !target.startsWith(callbackPath + '?')) {
      response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      .end('Callback received. Check the local program and close this tab.');
    settle(`http://${host}${target}`);
  });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    host = `127.0.0.1:${server.address().port}`;
    const authorization = newAuthorization(`http://${host}${callbackPath}`, clientId, config);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ReviewError('LOOPBACK_TIMEOUT')), timeoutMs);
    });
    const browserFailure = Promise.resolve().then(() => openBrowser(authorization.url))
      .then(() => callback);
    const received = await Promise.race([browserFailure, callback, timeout]);
    return { authorization, callback: received };
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
}

async function requestGoogleJson(url, options) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ReviewError('GOOGLE_REQUEST_FAILED');
  return response.json();
}

async function main(args) {
  if (!args.length || (args.length === 1 && args[0] === '--help')) {
    console.log('Usage: node scripts/issuance-test-oauth.cjs --check-config | --authorize [--read-metadata]');
    return;
  }
  const mode = args.join(' ');
  requireEvidence(['--check-config', '--authorize', '--authorize --read-metadata'].includes(mode), 'INVALID_OPTIONS');
  const readMetadata = mode === '--authorize --read-metadata';
  if (mode !== '--check-config') {
    requireEvidence(liveAuthorizationApproval, 'LIVE_AUTHORIZATION_APPROVAL_REQUIRED');
    if (readMetadata) requireEvidence(liveMetadataApproval, 'LIVE_METADATA_APPROVAL_REQUIRED');
  }
  const client = validateDesktopConfig(readIgnoredJson(oauthPath, 'OAUTH_JSON_MISSING'));
  const config = readIgnoredJson(environmentPath, 'TEST_ENVIRONMENT_JSON_MISSING');
  requireEvidence(isDedicatedConfig(config), 'DEDICATED_CONFIGURATION_INVALID');
  if (mode === '--check-config') {
    console.log('Local Desktop OAuth and TEST target configuration checked. No network request.');
    return;
  }
  const received = await receiveCallback(client.id, config);
  console.log(JSON.stringify(await verifyCallback({ config, client, ...received, requestJson: requestGoogleJson, readMetadata })));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    const message = error instanceof ReviewError ? error.message : 'OAUTH_REVIEW_FAILED';
    console.error(message === 'OAUTH_JSON_MISSING'
      ? `Desktop OAuth JSON is missing. Save it locally as ${oauthPath}, then run --check-config.`
      : message);
    process.exitCode = 1;
  });
}

module.exports = { validateDesktopConfig, newAuthorization, validateCallback, verifyCallback, receiveCallback };
