'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createSyntheticGuardianStore}=require('./synthetic-store');
const {createAtomicGuardianLinker}=require('./link-guardian-atomic');
const {createGuardianBookingReader}=require('./read-booking');
test('approved guardian is linked once, with unique UID and customer',async()=>{
 const store=createSyntheticGuardianStore();
 const link=createAtomicGuardianLinker({
  store,verifyStaff:async()=>({role:'staff',staffId:'STAFF-TEST'}),
  firebaseAuth:{getUser:async()=>({email:'test@example.invalid',emailVerified:true,disabled:false})}
 });
 const args={staffCredential:'synthetic',customerId:'CUS-TEST-001',firebaseUid:'uid-test-001'};
 assert.deepEqual(await link(args),{linked:true,customerId:'CUS-TEST-001'});
 assert.equal((await store.findByFirebaseUid('uid-test-001')).customerId,'CUS-TEST-001');
 await assert.rejects(link(args),/Link denied/);
});
test('simultaneous link attempts cannot both succeed',async()=>{
 const store=createSyntheticGuardianStore();
 const link=createAtomicGuardianLinker({store,verifyStaff:async()=>({role:'staff',staffId:'STAFF-TEST'}),
  firebaseAuth:{getUser:async()=>({email:'test@example.invalid',emailVerified:true,disabled:false})}});
 const args={staffCredential:'synthetic',customerId:'CUS-TEST-001',firebaseUid:'uid-test-001'};
 const results=await Promise.allSettled([link(args),link(args)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('booking read only returns fields from owned booking',async()=>{
 const reader=createGuardianBookingReader({
  authenticateGuardian:async()=>({role:'guardian',customerId:'CUS-TEST-001'}),
  bookingRepository:{findById:async()=>({bookingId:'RSV-TEST-001',customerId:'CUS-TEST-001',dogName:'TEST DOG',visitDate:'2026-11-04',status:'reserved',internalNote:'never return'})}
 });
 assert.deepEqual(await reader({idToken:'mock',bookingId:'RSV-TEST-001'}),{bookingId:'RSV-TEST-001',dogName:'TEST DOG',visitDate:'2026-11-04',status:'reserved'});
});
test('cross-customer booking access rejected',async()=>{
 const reader=createGuardianBookingReader({
  authenticateGuardian:async()=>({role:'guardian',customerId:'CUS-TEST-OTHER'}),
  bookingRepository:{findById:async()=>({bookingId:'RSV-TEST-001',customerId:'CUS-TEST-001'})}
 });
 await assert.rejects(reader({idToken:'mock',bookingId:'RSV-TEST-001'}),/Access denied/);
});
test('unauthenticated principal rejected',async()=>{
 const reader=createGuardianBookingReader({
  authenticateGuardian:async()=>{throw Error('Authentication failed');},
  bookingRepository:{findById:async()=>{throw Error('Must not query');}}
 });
 await assert.rejects(reader({idToken:'bad',bookingId:'RSV-TEST-001'}),/Authentication failed/);
});
