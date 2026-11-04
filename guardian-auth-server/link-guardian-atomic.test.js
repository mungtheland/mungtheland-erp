'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAtomicGuardianLinker}=require('./link-guardian-atomic');
function fixture({staff=true,approved=true,verified=true,disabled=false,commit=true}={}){
 let commits=0;
 const linker=createAtomicGuardianLinker({
  firebaseAuth:{getUser:async()=>({email:'TEST@EXAMPLE.INVALID',emailVerified:verified,disabled})},
  verifyStaff:async()=>staff?{role:'staff',staffId:'STAFF-TEST'}:null,
  store:{
   getApprovedEnrollment:async()=>approved?{verified:true,invitationConsumed:true,approvedFirebaseUid:'uid-1',version:1}:null,
   commitApprovedLink:async payload=>{commits++;assert.equal(payload.email,'test@example.invalid');return {created:commit};}
  }
 });
 return {run:()=>linker({staffCredential:'test',customerId:'CUS-TEST-001',firebaseUid:'uid-1'}),get commits(){return commits}};
}
test('verified staff and approved identity can link',async()=>{const f=fixture();assert.deepEqual(await f.run(),{linked:true,customerId:'CUS-TEST-001'});assert.equal(f.commits,1);});
test('unauthenticated staff rejected',async()=>assert.rejects(fixture({staff:false}).run(),/Link denied/));
test('missing enrollment rejected',async()=>assert.rejects(fixture({approved:false}).run(),/Link denied/));
test('unverified email rejected',async()=>assert.rejects(fixture({verified:false}).run(),/Link denied/));
test('disabled Firebase account rejected',async()=>assert.rejects(fixture({disabled:true}).run(),/Link denied/));
test('atomic store refusal rejected',async()=>assert.rejects(fixture({commit:false}).run(),/Link denied/));
test('invalid customer identifier rejected',async()=>{const f=fixture();await assert.rejects(createAtomicGuardianLinker({
 firebaseAuth:{getUser:async()=>({})},verifyStaff:async()=>({role:'staff',staffId:'S'}),
 store:{getApprovedEnrollment:async()=>({}),commitApprovedLink:async()=>({created:true})}
 })({staffCredential:'test',customerId:'../../other',firebaseUid:'uid-1'}),/Link denied/);assert.equal(f.commits,0);});
