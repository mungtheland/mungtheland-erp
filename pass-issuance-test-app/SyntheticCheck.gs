'use strict';

function runIssuanceSyntheticCheck() {
  const scriptId = ScriptApp.getScriptId();
  if (typeof scriptId !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(scriptId))
    return { status: 'BLOCKED', reason: 'TEST_SCRIPT_TARGET_REJECTED' };
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, scriptId, Utilities.Charset.UTF_8);
  if (digest.map(byte => (byte & 255).toString(16).padStart(2, '0')).join('') !== '__TEST_SCRIPT_PIN__')
    return { status: 'BLOCKED', reason: 'TEST_SCRIPT_TARGET_REJECTED' };

  const result = mdPassIssuancePreflight_(JSON.parse(__SYNTHETIC_INPUT_JSON__));
  const summary = { status: result.validationStatus, reason: result.reason };
  console.log(JSON.stringify(summary));
  return summary;
}
