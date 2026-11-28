const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/admission-contract.fixture.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'src/Code.js'), 'utf8');
const contract = vm.runInNewContext(`${source}\n({ schemas: MD_SCHEMAS, registerDog: mdRegisterDog })`);

test('admission fixture is synthetic, inactive, and has no live integration enabled', () => {
  assert.equal(fixture.fixtureKind, 'SYNTHETIC_ONLY');
  assert.equal(fixture.contractStatus, 'UNAPPROVED_DRAFT');
  assert.equal(fixture.active, false);
  assert.equal(fixture.externalCallsAllowed, false);
  assert.equal(fixture.consentEvidence.length, 0);
});

test('legacy customer and pet schema remains the source of field names', () => {
  assert.deepEqual(Array.from(contract.schemas['고객·반려견관리']), [
    '반려견 ID', '고객 ID', '보호자명', '연락처', '반려견명', '견종', '생년월일', '성별',
    '중성화', '체중(kg)', '접종정보', '건강·알레르기', '성향·주의사항', '비상연락처', '등록일', '상태'
  ]);
  assert.deepEqual(Object.keys(contract.schemas).filter(name => /신청|계약|동의/.test(name)), []);
});

test('current registration requires only guardian name, phone, and dog name at function boundary', () => {
  const body = contract.registerDog.toString();
  for (const field of ['guardianName', 'phone', 'dogName']) assert.match(body, new RegExp(`data\\.${field}`));
  for (const field of ['breed', 'birthDate', 'sex', 'neutered', 'weight', 'vaccines', 'health', 'notes', 'emergencyPhone']) {
    assert.doesNotMatch(body, new RegExp(`mdRequired_\\(data\\.${field}`));
  }
});

test('application, consent, contract version, identity, and lifecycle decisions remain fail-closed', () => {
  assert.match(fixture.applicationId, /^SYN-APP-/);
  assert.equal(Number.isSafeInteger(fixture.revision), true);
  assert.equal(fixture.applicationStatusPolicy, 'UNDECIDED');
  assert.equal(fixture.consentEvidencePolicy, 'UNDECIDED');
  assert.equal(fixture.contractVersion, null);
  assert.equal(fixture.privacyNoticeVersion, null);
  assert.equal(fixture.serverIdentityVerifier, null);
  assert.equal(fixture.active, false);
});
