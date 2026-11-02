#!/usr/bin/env node
// Build an isolated Apps Script bundle. Does NOT authenticate, push or deploy.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'guardian-test-app');
const sources=[
 ['tests/GuardianTestDependencies.js','GuardianTestDependencies.gs'],
 ['src/GuardianTestEnvironment.js','GuardianTestEnvironment.gs'],
 ['src/GuardianRequest.js','GuardianRequest.gs'],
 ['src/GuardianRequestReview.js','GuardianRequestReview.gs'],
 ['tests/GuardianIsolationSmokeTest.js','GuardianIsolationSmokeTest.gs'],
 ['tests/GuardianWorkflowTest.js','GuardianWorkflowTest.gs'],
 ['tests/GuardianTestRunner.js','GuardianTestRunner.gs']
];
fs.mkdirSync(out,{recursive:true});
for(const [source,target] of sources){
 const input=path.join(root,source);
 if(!fs.existsSync(input))throw Error('Missing source: '+source);
 const code=fs.readFileSync(input,'utf8');
 if(!code.trim())throw Error('Empty source: '+source);
 fs.writeFileSync(path.join(out,target),code,'utf8');
}
const manifest=path.join(out,'appsscript.json');
if(!fs.existsSync(manifest))throw Error('Missing Apps Script manifest');
console.log('Prepared '+sources.length+' isolated test files. No remote changes made.');
