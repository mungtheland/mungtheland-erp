'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {mdBuildPassIssuancePlan_}=require('../src/PassIssuancePlan');
const {LEDGER_FIELDS,canTransitionIssuanceStatus,createSyntheticPassIssuanceStore}=require('./synthetic-pass-issuance-store');

const catalog={catalogVersion:4,products:[{productId:'SYNTH-PASS-8',productType:'PASS',displayName:'Synthetic eight uses',
 totalUses:8,active:true,deductionPolicy:'REGULAR_PASS',source:'synthetic-fixture-catalog',approvalStatus:'APPROVED',version:4}]};
const request=(overrides={})=>({requestId:'REQ-SYNTH-61001',productId:'SYNTH-PASS-8',catalogVersion:4,
 petId:'PET-SYNTH-61001',guardianId:'GUARDIAN-SYNTH-61001',paymentStatus:'COMPLETED',paymentReference:'PAY-SYNTH-61001',
 requestedUses:8,requestedStartDate:'2026-11-01',requestedExpiryDate:'2027-10-31',amount:8000,sourceChannel:'SYNTHETIC_TEST',...overrides});
const verification=(req=request())=>({mode:'SYNTHETIC_FIXTURE',pet:{exists:true,guardianId:req.guardianId},
 payment:{verified:true,status:'COMPLETED',reference:req.paymentReference,amount:req.amount},
 issuanceHistory:{complete:true,issuanceLedgerStatus:'KNOWN_EMPTY_OR_COMPLETE',requestIdStatus:'NOT_FOUND',paymentReferenceStatus:'NOT_FOUND'}});
function fixture(req=request(),options={}){
 const plan=mdBuildPassIssuancePlan_({request:req,catalog,verification:verification(req)});
 assert.equal(plan.validationStatus,'PLAN_ONLY');
 const context={guardianId:req.guardianId,sourceChannel:req.sourceChannel,auditReference:'SYNTH-AUDIT:'+req.requestId};
 return {store:createSyntheticPassIssuanceStore({clock:()=> '2026-11-27T00:00:00.000Z',...options}),plan,context,req};
}
const issue=f=>f.store.issue(f.plan,f.context);

test('ledger contract includes every required issuance and audit field',()=>{
 assert.deepEqual(LEDGER_FIELDS,['issuanceRequestId','idempotencyKey','paymentReference','productId','catalogVersion','totalUses','petId','guardianId',
  'passId','issuanceStatus','requestedAt','committedAt','attemptCount','lastErrorCode','sourceChannel','auditReference']);
});

test('state transitions are constrained and review recovery requires an audit gate',()=>{
 assert.equal(canTransitionIssuanceStatus('VALIDATED','PENDING'),true);
 assert.equal(canTransitionIssuanceStatus('PENDING','COMMITTED'),true);
 assert.equal(canTransitionIssuanceStatus('COMMITTED','PENDING'),false);
 assert.equal(canTransitionIssuanceStatus('FAILED_FINAL','PENDING'),false);
 assert.equal(canTransitionIssuanceStatus('NEEDS_REVIEW','PENDING'),false);
 assert.equal(canTransitionIssuanceStatus('NEEDS_REVIEW','PENDING',{audited:true}),true);
});

test('normal issuance writes one synthetic pass and one committed issuance record',async()=>{
 const f=fixture(),result=await issue(f),snapshot=f.store.inspect();
 assert.equal(result.status,'COMMITTED');assert.equal(result.alreadyCommitted,false);
 assert.equal(result.passId,'SYNTH-PASS-000001');assert.equal(result.passCount,1);
 assert.equal(snapshot.ledger.length,1);assert.equal(snapshot.passes.length,1);
 assert.equal(snapshot.ledger[0].issuanceStatus,'COMMITTED');
 assert.equal(snapshot.ledger[0].passId,result.passId);
 assert.equal(snapshot.ledger[0].attemptCount,1);
 assert.equal(snapshot.ledger[0].committedAt,'2026-11-27T00:00:00.000Z');
 assert.equal(snapshot.passes[0].remainingUses,8);
});

test('same request ID retry returns the original committed pass without another issue',async()=>{
 const f=fixture();const first=await issue(f),retry=await issue(f);
 assert.equal(retry.status,'COMMITTED');assert.equal(retry.alreadyCommitted,true);
 assert.equal(retry.passId,first.passId);assert.equal(f.store.inspect().passes.length,1);
});

test('same payment reference retry with a different request ID is blocked',async()=>{
 const first=fixture(),second=fixture(request({requestId:'REQ-SYNTH-61002'}));
 await issue(first);const result=await first.store.issue(second.plan,second.context);
 assert.equal(result.status,'NEEDS_REVIEW');assert.equal(result.reason,'DUPLICATE_PAYMENT_REFERENCE');
 assert.equal(first.store.inspect().passes.length,1);assert.equal(first.store.inspect().ledger.length,1);
});

test('same request ID with a changed payment reference is held for review',async()=>{
 const f=fixture();await issue(f);
 const changedReq=request({paymentReference:'PAY-SYNTH-OTHER'});
 const changed=mdBuildPassIssuancePlan_({request:changedReq,catalog,verification:verification(changedReq)});
 const result=await f.store.issue(changed,f.context);
 assert.equal(result.status,'NEEDS_REVIEW');assert.equal(result.reason,'REQUEST_ID_CONFLICT');
 assert.equal(f.store.inspect().passes.length,1);
});

test('two concurrent identical requests serialize to one pass and one ledger row',async()=>{
 const f=fixture();const results=await Promise.all(Array.from({length:2},()=>issue(f)));
 assert.deepEqual(results.map(result=>result.status),['COMMITTED','COMMITTED']);
 assert.equal(new Set(results.map(result=>result.passId)).size,1);
 assert.equal(f.store.inspect().passes.length,1);assert.equal(f.store.inspect().ledger.length,1);
});

test('many concurrent retries do not multiply a synthetic pass',async()=>{
 const f=fixture();const results=await Promise.all(Array.from({length:24},()=>issue(f)));
 assert.ok(results.every(result=>result.status==='COMMITTED'));
 assert.equal(new Set(results.map(result=>result.passId)).size,1);
 assert.equal(f.store.inspect().passes.length,1);assert.equal(f.store.inspect().ledger[0].attemptCount,1);
});

test('concurrent different request IDs sharing one payment reference commit at most one pass',async()=>{
 const first=fixture(),second=fixture(request({requestId:'REQ-SYNTH-61003'}));
 const results=await Promise.all([
  first.store.issue(first.plan,first.context),first.store.issue(second.plan,second.context)
 ]);
 assert.equal(results.filter(result=>result.status==='COMMITTED').length,1);
 assert.equal(results.filter(result=>result.status==='NEEDS_REVIEW').length,1);
 assert.equal(first.store.inspect().passes.length,1);assert.equal(first.store.inspect().ledger.length,1);
});

for(const point of ['AFTER_PENDING','BEFORE_PASS']){
 test(point+' leaves a pending ledger that a same-request retry can safely resume',async()=>{
  const f=fixture(request(),{faultAt:point});
  await assert.rejects(issue(f),{code:'SYNTHETIC_FAULT_'+point});
  const partial=f.store.inspect();assert.equal(partial.ledger[0].issuanceStatus,'PENDING');assert.equal(partial.passes.length,0);
  assert.equal(partial.ledger[0].lastErrorCode,'SYNTHETIC_FAULT_'+point);
  const result=await issue(f);assert.equal(result.status,'COMMITTED');assert.equal(result.attemptCount,2);
  assert.equal(f.store.inspect().passes.length,1);
 });
}

for(const point of ['AFTER_PASS','BEFORE_COMMITTED']){
 test(point+' leaves a matching pass plus pending ledger and finalizes without duplicating the pass',async()=>{
  const f=fixture(request(),{faultAt:point});
  await assert.rejects(issue(f),{code:'SYNTHETIC_FAULT_'+point});
  const partial=f.store.inspect();assert.equal(partial.ledger[0].issuanceStatus,'PENDING');assert.equal(partial.passes.length,1);
  assert.equal(partial.ledger[0].lastErrorCode,'SYNTHETIC_FAULT_'+point);
  const originalPassId=partial.passes[0].passId;
  const result=await issue(f);assert.equal(result.status,'COMMITTED');assert.equal(result.passId,originalPassId);
  assert.equal(f.store.inspect().passes.length,1);
 });
}

test('failure before pending creation leaves no artifact and retry creates one pass',async()=>{
 const f=fixture(request(),{faultAt:'BEFORE_PENDING'});
 await assert.rejects(issue(f),{code:'SYNTHETIC_FAULT_BEFORE_PENDING'});
 assert.deepEqual(f.store.inspect().ledger,[]);assert.deepEqual(f.store.inspect().passes,[]);
 assert.equal((await issue(f)).status,'COMMITTED');
});

test('committed response loss is resolved by lookup and never creates a second pass',async()=>{
 const f=fixture(request(),{faultAt:'AFTER_COMMITTED'});
 await assert.rejects(issue(f),{code:'SYNTHETIC_FAULT_AFTER_COMMITTED'});
 assert.equal(f.store.inspect().ledger[0].issuanceStatus,'COMMITTED');
 assert.equal(f.store.inspect().ledger[0].lastErrorCode,'SYNTHETIC_FAULT_AFTER_COMMITTED');
 const retry=await issue(f);assert.equal(retry.status,'COMMITTED');assert.equal(retry.alreadyCommitted,true);
 assert.equal(f.store.inspect().passes.length,1);
});

test('pass record without an issuance ledger is blocked for manual review',async()=>{
 const f=fixture();
 f.store.seedPartialForTest({passRecord:{passId:'SYNTH-PASS-LEGACY-000001',issuanceRequestId:f.plan.plan.requestId,
  paymentReference:f.plan.plan.paymentReference,productId:f.plan.plan.productId,catalogVersion:4,petId:f.plan.plan.petId,
  guardianId:f.context.guardianId,totalUses:8,usedUses:0,remainingUses:8}});
 const result=await issue(f);assert.equal(result.status,'NEEDS_REVIEW');assert.equal(result.reason,'PASS_WITHOUT_PENDING_LEDGER');
 assert.equal(f.store.inspect().passes.length,1);assert.deepEqual(f.store.inspect().ledger,[]);
});

test('committed issuance ledger without a pass is never treated as a completed issue',async()=>{
 const f=fixture(),intent=f.plan.plan;
 f.store.seedPartialForTest({ledgerEntry:{issuanceRequestId:intent.requestId,idempotencyKey:intent.idempotencyKey,
  paymentReference:intent.paymentReference,productId:intent.productId,catalogVersion:4,petId:intent.petId,
  guardianId:f.context.guardianId,passId:'SYNTH-PASS-MISSING',issuanceStatus:'COMMITTED',requestedAt:'2026-11-27T00:00:00.000Z',
  committedAt:'2026-11-27T00:01:00.000Z',attemptCount:1,lastErrorCode:null,sourceChannel:f.context.sourceChannel,auditReference:f.context.auditReference,totalUses:8}});
 const result=await issue(f);assert.equal(result.status,'NEEDS_REVIEW');assert.equal(result.reason,'COMMITTED_PAIR_MISMATCH');
 assert.equal(f.store.inspect().passes.length,0);
});

test('FAILED_FINAL records are terminal and require a separately audited recovery',async()=>{
 const f=fixture(),intent=f.plan.plan;
 f.store.seedPartialForTest({ledgerEntry:{issuanceRequestId:intent.requestId,idempotencyKey:intent.idempotencyKey,
  paymentReference:intent.paymentReference,productId:intent.productId,catalogVersion:4,petId:intent.petId,
  guardianId:f.context.guardianId,passId:null,issuanceStatus:'FAILED_FINAL',requestedAt:'2026-11-27T00:00:00.000Z',
  committedAt:null,attemptCount:2,lastErrorCode:'SYNTHETIC_FINAL_FAILURE',sourceChannel:f.context.sourceChannel,auditReference:f.context.auditReference,totalUses:8}});
 const result=await issue(f);assert.equal(result.status,'NEEDS_REVIEW');assert.equal(result.reason,'MANUAL_RECONCILIATION_REQUIRED');
 assert.equal(f.store.inspect().passes.length,0);
});

test('existing pending issuance record can resume, but ledger status stays pending until a pass exists',async()=>{
 const f=fixture(request(),{faultAt:'AFTER_PENDING'});
 await assert.rejects(issue(f));
 assert.equal(f.store.inspect().ledger[0].issuanceStatus,'PENDING');assert.equal(f.store.inspect().passes.length,0);
 const result=await issue(f);assert.equal(result.status,'COMMITTED');
 assert.equal(f.store.inspect().ledger[0].issuanceStatus,'COMMITTED');assert.equal(f.store.inspect().passes.length,1);
});

test('plan-only fixture evidence is required and a live-looking plan is rejected',async()=>{
 const f=fixture();const livePlan={validationStatus:'PLAN_ONLY',plan:{...f.plan.plan,warnings:['NOT_PERSISTED']}};
 await assert.rejects(f.store.issue(livePlan,f.context),{code:'SYNTHETIC_PLAN_INVALID'});
 assert.equal(f.store.inspect().passes.length,0);
});

test('repository surface is memory-only and has no production adapter ports',()=>{
 const f=fixture();
 assert.deepEqual(Object.keys(f.store).sort(),['inspect','issue','seedPartialForTest']);
 assert.equal(f.store.inspect().passes.length,0);
});
