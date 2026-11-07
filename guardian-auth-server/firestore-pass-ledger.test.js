'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createIsolatedPassLedger}=require('./firestore-pass-ledger');
function fakeDb(){
 const docs=new Map(),ref=(collection,id)=>({key:collection+'/'+id});
 let queue=Promise.resolve();
 const db={projectId:'mungtheland-guardian-test',collection:name=>({doc:id=>ref(name,id)}),runTransaction:fn=>{
  const run=queue.then(async()=>{
   const writes=[];
   const tx={get:async r=>({exists:docs.has(r.key),data:()=>structuredClone(docs.get(r.key))}),update:(r,v)=>writes.push(()=>docs.set(r.key,{...docs.get(r.key),...v})),create:(r,v)=>writes.push(()=>{if(docs.has(r.key))throw Error('Already exists');docs.set(r.key,v);})};
   const result=await fn(tx);writes.forEach(w=>w());return result;
  });
  queue=run.catch(()=>{});return run;
 }};
 return {db,docs};
}
const id='RSV-TEST-LEDGER-001',passId='PASS-TEST-001',customerId='CUS-TEST-001';
function setup(remaining=8){
 const f=fakeDb();
 f.docs.set('pass_ledger_test_v1/'+passId,{total:8,remaining,customerId});
 f.docs.set('attendance_test_v1/'+id,{bookingId:id,state:'등원 중',events:[{bookingId:id,eventId:'EVT-1',action:'check-in'}]});
 return {...f,ledger:createIsolatedPassLedger({db:f.db,projectId:f.db.projectId})};
}
test('concurrent same-booking deductions commit once',async()=>{
 const {ledger,docs}=setup();
 const results=await Promise.all(Array.from({length:12},()=>ledger.consume({passId,bookingId:id,customerId})));
 assert.equal(results.filter(x=>x.consumed).length,1);
 assert.equal(results.filter(x=>x.alreadyConsumed).length,11);
 assert.equal(docs.get('pass_ledger_test_v1/'+passId).remaining,7);
 assert.equal(docs.get('pass_consumptions_test_v1/'+id).checkInEventId,'EVT-1');
});
test('different pass cannot consume same booking',async()=>{
 const {ledger,docs}=setup();await ledger.consume({passId,bookingId:id,customerId});
 docs.set('pass_ledger_test_v1/PASS-TEST-002',{total:8,remaining:8,customerId});
 await assert.rejects(()=>ledger.consume({passId:'PASS-TEST-002',bookingId:id,customerId}),/different pass/);
 assert.equal(docs.get('pass_ledger_test_v1/PASS-TEST-002').remaining,8);
});
test('zero balance refuses deduction',async()=>{const {ledger}=setup(0);await assert.rejects(()=>ledger.consume({passId,bookingId:id,customerId}),/Insufficient/);});
test('no attendance refuses deduction',async()=>{const {ledger,docs}=setup();docs.delete('attendance_test_v1/'+id);await assert.rejects(()=>ledger.consume({passId,bookingId:id,customerId}),/No committed/);});
test('pass owner mismatch refuses deduction',async()=>{const {ledger}=setup();await assert.rejects(()=>ledger.consume({passId,bookingId:id,customerId:'CUS-TEST-002'}),/owner mismatch/);});
test('non-test pass IDs rejected',async()=>{const {ledger}=setup();await assert.rejects(()=>ledger.consume({passId:'PASS-PRODUCTION',bookingId:id,customerId}),/Invalid test/);});
test('wrong project rejected',()=>assert.throws(()=>createIsolatedPassLedger({db:{projectId:'other'},projectId:'other'}),/Isolated/));
