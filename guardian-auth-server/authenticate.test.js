'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createGuardianAuthenticator}=require('./authenticate');
const projectId='mungtheland-test',uid='firebase-uid-test',email='guardian@example.invalid';
const claims=()=>({aud:projectId,iss:'https://securetoken.google.com/'+projectId,sub:uid,uid,email,email_verified:true,exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'password'}});
function setup(overrides={},account={customerId:'CUS-TEST-001',status:'active',email}){
 const auth=createGuardianAuthenticator({
  projectId,
  firebaseAuth:{verifyIdToken:async(token,checkRevoked)=>{assert.equal(checkRevoked,true);if(token==='x'.repeat(120))return {...claims(),...overrides};throw Error('invalid');}},
  accountStore:{findByFirebaseUid:async(key)=>{assert.equal(key,uid);return account;}}
 });
 return ()=>auth('x'.repeat(120));
}
test('verified and linked guardian resolves only server mapping',async()=>{const principal=await setup()();assert.deepEqual(principal,{customerId:'CUS-TEST-001',firebaseUid:uid,role:'guardian'});});
test('unverified email denied',async()=>assert.rejects(setup({email_verified:false})(),/Authentication failed/));
test('wrong audience denied',async()=>assert.rejects(setup({aud:'another-project'})(),/Authentication failed/));
test('expired token denied',async()=>assert.rejects(setup({exp:1})(),/Authentication failed/));
test('unlinked account denied',async()=>assert.rejects(setup({},null)(),/Authentication failed/));
test('inactive account denied',async()=>assert.rejects(setup({},{customerId:'CUS-TEST-001',status:'disabled',email})(),/Authentication failed/));
test('email mismatch denied',async()=>assert.rejects(setup({},{customerId:'CUS-TEST-001',status:'active',email:'other@example.invalid'})(),/Authentication failed/));
test('invalid token denied',async()=>{const auth=createGuardianAuthenticator({projectId,firebaseAuth:{verifyIdToken:async()=>{throw Error('invalid');}},accountStore:{findByFirebaseUid:async()=>null}});await assert.rejects(auth('x'.repeat(120)),/Authentication failed/);});
