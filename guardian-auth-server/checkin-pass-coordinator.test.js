'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCheckInPassCoordinator}=require('./checkin-pass-coordinator');
const principal={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
const args={principal,bookingId:'RSV-TEST-COORD-001',passId:'PASS-TEST-001',customerId:'CUS-TEST-001'};
function harness({failOnce=false,competingCheckin=false}={}){
 let state='예약',remaining=8,consumed=false,attempts=0,transitions=0;
 const attendance={
  get:async()=>({state}),
  transition:async()=>{
   transitions++;
   if(competingCheckin){state='등원 중';throw Error('Invalid transition');}
   if(state!=='예약')throw Error('Invalid transition');
   state='등원 중';return {state};
  }
 };
 const passLedger={consume:async()=>{
  attempts++;
  if(failOnce&&attempts===1)throw Error('Simulated transient Firestore failure');
  if(consumed)return {remaining,alreadyConsumed:true};
  consumed=true;remaining--;return {remaining,alreadyConsumed:false};
 }};
 return {coordinator:createCheckInPassCoordinator({attendance,passLedger}),snapshot:()=>({state,remaining,consumed,attempts,transitions})};
}
test('check-in commits once and deducts one pass',async()=>{
 const h=harness(),result=await h.coordinator.checkInAndConsume(args);
 assert.equal(result.consumptionStatus,'consumed');assert.equal(result.remaining,7);
 assert.deepEqual(h.snapshot(),{state:'등원 중',remaining:7,consumed:true,attempts:1,transitions:1});
});
test('repeat after success never deducts again',async()=>{
 const h=harness();await h.coordinator.checkInAndConsume(args);
 const r=await h.coordinator.checkInAndConsume(args);
 assert.equal(r.consumptionStatus,'already-consumed');assert.equal(h.snapshot().remaining,7);assert.equal(h.snapshot().transitions,1);
});
test('deduction failure is visible and retry repairs it',async()=>{
 const h=harness({failOnce:true}),first=await h.coordinator.checkInAndConsume(args);
 assert.equal(first.reconciliationRequired,true);assert.equal(first.consumptionStatus,'pending-reconciliation');
 assert.equal(h.snapshot().remaining,8);assert.equal(h.snapshot().state,'등원 중');
 const second=await h.coordinator.checkInAndConsume(args);
 assert.equal(second.reconciliationRequired,false);assert.equal(second.remaining,7);assert.equal(h.snapshot().transitions,1);
});
test('concurrent staff check-in conflict is recovered by reading committed attendance',async()=>{
 const h=harness({competingCheckin:true}),r=await h.coordinator.checkInAndConsume(args);
 assert.equal(r.consumptionStatus,'consumed');assert.equal(h.snapshot().remaining,7);
});
test('unprivileged caller is rejected',async()=>{
 const h=harness();await assert.rejects(()=>h.coordinator.checkInAndConsume({...args,principal:{role:'guardian',status:'active'}}),/Staff access/);
});
test('already checked-out booking is retryable without new attendance',async()=>{
 const h=harness();await h.coordinator.checkInAndConsume(args);
 const r=await h.coordinator.checkInAndConsume(args);
 assert.equal(r.consumptionStatus,'already-consumed');
});
