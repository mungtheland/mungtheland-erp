'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {mdBuildPassIssuancePlan_}=require('../src/PassIssuancePlan');

const product=(productId,productType,totalUses,deductionPolicy,approvalStatus='APPROVED')=>({
 productId,productType,displayName:'Synthetic catalog product',totalUses,active:true,deductionPolicy,
 source:'synthetic-fixture-catalog',approvalStatus,version:3
});
const catalog={catalogVersion:3,products:[
 ...[8,12,16,20].map(count=>product('SYNTH-PASS-'+count,'PASS',count,'REGULAR_PASS')),
 product('SYNTH-DAY','DAYCARE_DAILY',null,'NOT_APPLICABLE'),
 product('SYNTH-HOTEL','HOTEL',null,'NOT_APPLICABLE'),
 product('SYNTH-TEST','TEST_ONLY',1,'NOT_APPLICABLE'),
 product('SYNTH-DRAFT','PASS',8,'REGULAR_PASS','DRAFT')
]};
const request=(overrides={})=>({
 requestId:'REQ-SYNTH-0001',productId:'SYNTH-PASS-8',catalogVersion:3,petId:'PET-SYNTH-1',guardianId:'GUARDIAN-SYNTH-1',
 paymentStatus:'COMPLETED',paymentReference:'PAY-SYNTH-1',requestedUses:8,requestedStartDate:'2026-11-01',
 requestedExpiryDate:'2027-10-31',amount:12000,sourceChannel:'SYNTHETIC_TEST',...overrides
});
const verification=(overrides={})=>({
 mode:'SYNTHETIC_FIXTURE',pet:{exists:true,guardianId:'GUARDIAN-SYNTH-1'},
 payment:{verified:true,status:'COMPLETED',reference:'PAY-SYNTH-1',amount:12000},
 issuanceHistory:{complete:true,issuanceLedgerStatus:'KNOWN_EMPTY_OR_COMPLETE',requestIdStatus:'NOT_FOUND',paymentReferenceStatus:'NOT_FOUND'},
 ...overrides
});
const validate=(req=request(),evidence=verification(),products=catalog)=>mdBuildPassIssuancePlan_({request:req,verification:evidence,catalog:products});

test('approved recurring products create plan-only projections for 8, 12, 16, and 20 uses',()=>{
 for(const totalUses of [8,12,16,20]){
  const productId='SYNTH-PASS-'+totalUses;
  const result=validate(request({productId,requestedUses:totalUses}));
  assert.equal(result.validationStatus,'PLAN_ONLY');
  assert.equal(result.plan.totalUses,totalUses);
  assert.equal(result.plan.initialUsedUses,0);
  assert.equal(result.plan.initialRemainingUses,totalUses);
  assert.equal(result.plan.productId,productId);
  assert.equal(result.plan.catalogVersion,3);
  assert.equal(result.plan.idempotencyKey,'PASS-ISSUE:v3:'+result.plan.requestId);
  assert.deepEqual(result.plan.requiredLedgerWrites,['pass-record','v2-issuance-ledger-row']);
  assert.ok(result.plan.warnings.includes('NOT_PERSISTED'));
  assert.equal(Object.hasOwn(result.plan,'passId'),false);
  assert.equal(Object.hasOwn(result.plan,'historyId'),false);
 }
});

test('missing and unknown product IDs do not create a plan',()=>{
 assert.equal(validate(request({productId:''})).reason,'PRODUCT_ID_MISSING');
 assert.equal(validate(request({productId:'SYNTH-UNKNOWN'})).reason,'PRODUCT_NOT_IN_CATALOG');
});

test('draft, inactive, stale-version, duplicate-ID, and invalid catalog entries are rejected',()=>{
 assert.equal(validate(request({productId:'SYNTH-DRAFT'})).reason,'PRODUCT_NOT_APPROVED_OR_INACTIVE');
 const inactive={...catalog,products:catalog.products.map(p=>p.productId==='SYNTH-PASS-8'?{...p,active:false}:p)};
 assert.equal(validate(request(),verification(),inactive).reason,'PRODUCT_NOT_APPROVED_OR_INACTIVE');
 assert.equal(validate(request({catalogVersion:2})).validationStatus,'BLOCKED');
 const duplicate={...catalog,products:[...catalog.products,{...catalog.products[0]}]};
 assert.equal(validate(request(),verification(),duplicate).reason,'CATALOG_DUPLICATE_PRODUCT_ID');
});

test('requested count must exactly match the approved recurring product',()=>{
 assert.equal(validate(request({requestedUses:12})).reason,'PRODUCT_TOTAL_USES_MISMATCH');
});

test('daily daycare and hotel products are excluded from recurring issuance',()=>{
 assert.equal(validate(request({productId:'SYNTH-DAY'})).reason,'DAYCARE_DAILY');
 assert.equal(validate(request({productId:'SYNTH-HOTEL'})).reason,'HOTEL');
});

test('TEST_ONLY products are blocked',()=>{
 assert.deepEqual(validate(request({productId:'SYNTH-TEST',requestedUses:1})),{
  validationStatus:'BLOCKED',reason:'TEST_ONLY_PRODUCT',plan:null
 });
});

test('pet must exist and match the supplied guardian link',()=>{
 assert.equal(validate(request(),verification({pet:{exists:false,guardianId:'GUARDIAN-SYNTH-1'}})).reason,'PET_GUARDIAN_LINK_UNVERIFIED');
 assert.equal(validate(request(),verification({pet:{exists:true,guardianId:'GUARDIAN-OTHER'}})).reason,'PET_GUARDIAN_LINK_UNVERIFIED');
});

test('payment must be completed and match reference and amount evidence',()=>{
 assert.equal(validate(request({paymentStatus:'PENDING'})).reason,'PAYMENT_NOT_CONFIRMED');
 assert.equal(validate(request({paymentReference:''})).reason,'PAYMENT_NOT_CONFIRMED');
 assert.equal(validate(request(),verification({payment:{verified:true,status:'COMPLETED',reference:'PAY-OTHER',amount:12000}})).reason,'PAYMENT_EVIDENCE_MISMATCH');
 assert.equal(validate(request({amount:0})).reason,'PAYMENT_EVIDENCE_MISMATCH');
 assert.equal(validate(request({amount:-1})).reason,'AMOUNT_INVALID');
 assert.equal(validate(request({requestId:'PAY-SYNTH-1',paymentReference:'PAY-SYNTH-1'})).reason,'REQUEST_PAYMENT_REFERENCE_COLLISION');
});

test('unknown issuance history prevents plan generation',()=>{
 assert.equal(validate(request(),verification({issuanceHistory:null})).reason,'ISSUANCE_HISTORY_UNVERIFIED');
 assert.equal(validate(request(),verification({issuanceHistory:{complete:false}})).reason,'ISSUANCE_HISTORY_UNVERIFIED');
 assert.equal(validate(request(),verification({issuanceHistory:{complete:true,issuanceLedgerStatus:'UNKNOWN'}})).reason,'ISSUANCE_HISTORY_UNVERIFIED');
});

test('existing request IDs and payment references block duplicate issuance plans',()=>{
 const priorSame={...verification().issuanceHistory,requestIdStatus:'FOUND',requestIdPaymentReference:'PAY-SYNTH-1'};
 assert.equal(validate(request(),verification({issuanceHistory:priorSame})).reason,'DUPLICATE_REQUEST_ID');
 const priorConflict={...verification().issuanceHistory,requestIdStatus:'FOUND',requestIdPaymentReference:'PAY-OTHER'};
 assert.equal(validate(request(),verification({issuanceHistory:priorConflict})).reason,'REQUEST_ID_CONFLICT');
 const priorPayment={...verification().issuanceHistory,paymentReferenceStatus:'FOUND'};
 assert.equal(validate(request(),verification({issuanceHistory:priorPayment})).reason,'DUPLICATE_PAYMENT_REFERENCE');
});

test('date-only boundaries are validated and same-day start/expiry is allowed',()=>{
 assert.equal(validate(request({requestedStartDate:'2026-11-02',requestedExpiryDate:'2026-11-01'})).reason,'ISSUANCE_DATE_INVALID');
 assert.equal(validate(request({requestedStartDate:'2026-02-30'})).reason,'ISSUANCE_DATE_INVALID');
 assert.equal(validate(request({requestedStartDate:'2026-11-01',requestedExpiryDate:'2026-11-01'})).validationStatus,'PLAN_ONLY');
 assert.equal(validate(request({requestedStartDate:'2026-11-01T00:00:00Z'})).reason,'ISSUANCE_DATE_INVALID');
});

test('request shape, request ID, catalog version, and source channel are required',()=>{
 assert.equal(validate(request({requestId:'short'})).reason,'REQUEST_ID_INVALID');
 assert.equal(validate(request({catalogVersion:0})).reason,'CATALOG_VERSION_MISSING');
 assert.equal(validate(request({sourceChannel:'bad\nchannel'})).reason,'SOURCE_CHANNEL_INVALID');
 assert.equal(mdBuildPassIssuancePlan_({request:{...request(),unexpected:true},catalog,verification:verification()}).reason,'REQUEST_SHAPE_INVALID');
});

test('non-synthetic evidence is blocked and plans contain no persistence side effects',()=>{
 assert.deepEqual(validate(request(),verification({mode:'LIVE'})),{
  validationStatus:'BLOCKED',reason:'SYNTHETIC_EVIDENCE_REQUIRED',plan:null
 });
 const result=validate();
 assert.equal(result.validationStatus,'PLAN_ONLY');
 assert.equal(typeof result.plan.passId,'undefined');
 assert.equal(typeof result.plan.historyId,'undefined');
});
