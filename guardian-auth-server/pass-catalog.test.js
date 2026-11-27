'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {mdValidatePassCatalog_,mdResolvePassCatalogDeduction_}=require('../src/PassCatalog');

const product=(productId,productType,totalUses,deductionPolicy='REGULAR_PASS',overrides={})=>({
 productId,productType,displayName:'Synthetic product',totalUses,active:true,deductionPolicy,
 source:'synthetic-test-fixture',approvalStatus:'APPROVED',version:1,...overrides
});
const catalog=products=>({catalogVersion:1,products});

test('catalog validates explicit schema and recurring counts 8, 12, 16, and 20',()=>{
 const products=[8,12,16,20].map(total=>product('SYNTH-PASS-'+total,'PASS',total));
 assert.equal(mdValidatePassCatalog_(catalog(products),1).status,'PASS');
 for(const entry of products)
  assert.equal(mdResolvePassCatalogDeduction_({catalog:catalog(products),productId:entry.productId,totalUses:entry.totalUses,expectedVersion:1}).status,'ELIGIBLE');
});

test('duplicate product IDs block the whole catalog',()=>{
 const entry=product('SYNTH-DUP','PASS',8);
 assert.deepEqual(mdResolvePassCatalogDeduction_({catalog:catalog([entry,{...entry}]),productId:entry.productId,totalUses:8}),
  {valid:false,status:'BLOCKED',reason:'CATALOG_DUPLICATE_PRODUCT_ID'});
});

test('missing or extra schema fields fail closed',()=>{
 const entry=product('SYNTH-SCHEMA','PASS',8);
 const missing={...entry};delete missing.source;
 const extra={...entry,price:100};
 assert.equal(mdValidatePassCatalog_(catalog([missing])).reason,'CATALOG_ENTRY_INVALID');
 assert.equal(mdValidatePassCatalog_(catalog([extra])).reason,'CATALOG_ENTRY_INVALID');
 assert.equal(mdValidatePassCatalog_({...catalog([entry]),unexpected:true}).reason,'CATALOG_VERSION_OR_SHAPE_INVALID');
});

test('unsupported recurring counts and policy combinations are rejected',()=>{
 assert.equal(mdValidatePassCatalog_(catalog([product('SYNTH-7','PASS',7)])).reason,'CATALOG_PASS_POLICY_INVALID');
 assert.equal(mdValidatePassCatalog_(catalog([product('SYNTH-COUNT','PASS',8,'NOT_APPLICABLE')])).reason,'CATALOG_PASS_POLICY_INVALID');
});

test('approved daily daycare and hotel products never enter recurring deduction',()=>{
 for(const [id,type] of [['SYNTH-DAY','DAYCARE_DAILY'],['SYNTH-HOTEL','HOTEL']]){
  const entry=product(id,type,null,'NOT_APPLICABLE');
  const result=mdResolvePassCatalogDeduction_({catalog:catalog([entry]),productId:id,totalUses:1,expectedVersion:1});
  assert.equal(result.status,'NOT_REQUIRED');
  assert.equal(result.reason,type);
 }
});

test('TEST_ONLY is blocked even when active and marked approved',()=>{
 const entry=product('SYNTH-TEST','TEST_ONLY',1,'NOT_APPLICABLE');
 assert.equal(mdResolvePassCatalogDeduction_({catalog:catalog([entry]),productId:entry.productId,totalUses:1}).reason,'TEST_ONLY_PRODUCT');
});

test('unknown and missing product IDs require review',()=>{
 const only=product('SYNTH-KNOWN','PASS',8);
 assert.equal(mdResolvePassCatalogDeduction_({catalog:catalog([only]),productId:'SYNTH-UNKNOWN',totalUses:8}).reason,'PRODUCT_NOT_IN_CATALOG');
 assert.equal(mdResolvePassCatalogDeduction_({catalog:catalog([only]),productId:'',totalUses:8}).reason,'PRODUCT_ID_MISSING');
});

test('draft and inactive products cannot be deduction candidates',()=>{
 for(const overrides of [{approvalStatus:'DRAFT'},{active:false}]){
  const entry=product('SYNTH-DRAFT','PASS',8,'REGULAR_PASS',overrides);
  assert.equal(mdResolvePassCatalogDeduction_({catalog:catalog([entry]),productId:entry.productId,totalUses:8}).status,'NEEDS_REVIEW');
 }
});

test('recurring total uses must exactly match the catalog entry',()=>{
 const entry=product('SYNTH-MISMATCH','PASS',12);
 assert.equal(mdResolvePassCatalogDeduction_({catalog:catalog([entry]),productId:entry.productId,totalUses:8}).reason,'PRODUCT_TOTAL_USES_MISMATCH');
});

test('expected catalog version and entry versions must match',()=>{
 const entry=product('SYNTH-VERSION','PASS',8);
 assert.equal(mdResolvePassCatalogDeduction_({catalog:catalog([entry]),productId:entry.productId,totalUses:8,expectedVersion:2}).status,'BLOCKED');
 assert.equal(mdValidatePassCatalog_({catalogVersion:2,products:[entry]}).reason,'CATALOG_ENTRY_INVALID');
});

test('catalog source and approval state are explicit and validated',()=>{
 assert.equal(mdValidatePassCatalog_(catalog([product('SYNTH-NOSOURCE','PASS',8,'REGULAR_PASS',{source:''})])).valid,false);
 assert.equal(mdValidatePassCatalog_(catalog([product('SYNTH-APPROVAL','PASS',8,'REGULAR_PASS',{approvalStatus:'PENDING'})])).valid,false);
});

test('empty versioned catalog is valid but cannot resolve a product',()=>{
 assert.equal(mdValidatePassCatalog_(catalog([]),1).valid,true);
 assert.equal(mdResolvePassCatalogDeduction_({catalog:catalog([]),productId:'SYNTH-ANY',totalUses:8}).status,'NEEDS_REVIEW');
});
