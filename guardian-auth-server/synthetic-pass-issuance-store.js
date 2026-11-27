'use strict';

const LEDGER_FIELDS=Object.freeze([
 'issuanceRequestId','idempotencyKey','paymentReference','productId','catalogVersion','totalUses','petId','guardianId',
 'passId','issuanceStatus','requestedAt','committedAt','attemptCount','lastErrorCode','sourceChannel','auditReference'
]);
const STATUSES=new Set(['VALIDATED','PENDING','COMMITTED','NEEDS_REVIEW','FAILED_FINAL']);
const TRANSITIONS=Object.freeze({
 VALIDATED:new Set(['PENDING','NEEDS_REVIEW','FAILED_FINAL']),
 PENDING:new Set(['COMMITTED','NEEDS_REVIEW','FAILED_FINAL']),
 COMMITTED:new Set(),
 NEEDS_REVIEW:new Set(['PENDING']),
 FAILED_FINAL:new Set()
});
const FAULT_POINTS=new Set(['BEFORE_PENDING','AFTER_PENDING','BEFORE_PASS','AFTER_PASS','BEFORE_COMMITTED','AFTER_COMMITTED']);

function canTransitionIssuanceStatus(from,to,{audited=false}={}){
 if(!STATUSES.has(from)||!STATUSES.has(to))return false;
 if(from==='NEEDS_REVIEW'&&to==='PENDING')return audited===true;
 return TRANSITIONS[from].has(to);
}

function createSyntheticPassIssuanceStore({clock=()=>new Date().toISOString(),faultAt=null}={}){
 if(typeof clock!=='function'||(faultAt!==null&&!FAULT_POINTS.has(faultAt)))throw Error('Invalid synthetic store configuration');
 const ledger=new Map(),passes=new Map();
 let queue=Promise.resolve(),faultUsed=false,passSequence=0;

 function timestamp(){
  const value=clock();
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('SYNTHETIC_CLOCK_INVALID');
  return value;
 }
 function inject(point){
  if(faultAt===point&&!faultUsed){faultUsed=true;throw Object.assign(new Error('SYNTHETIC_FAULT_'+point),{code:'SYNTHETIC_FAULT_'+point});}
 }
 function copy(value){return value===undefined?undefined:structuredClone(value);}
 function planData(plan,requestContext){
  const item=plan?.plan;
  if(plan?.validationStatus!=='PLAN_ONLY'||!item||!Array.isArray(item.warnings)||
    !item.warnings.includes('SYNTHETIC_FIXTURE_ONLY')||!item.warnings.includes('NOT_PERSISTED')||
    !Number.isSafeInteger(item.catalogVersion)||item.catalogVersion<1||
    item.idempotencyKey!=='PASS-ISSUE:v'+item.catalogVersion+':'+item.requestId||
    !/^[-A-Za-z0-9_]{8,100}$/.test(item.requestId||'')||
    !/^[A-Za-z0-9._-]{1,80}$/.test(item.productId||'')||
    !/^[A-Za-z0-9._-]{1,120}$/.test(item.petId||'')||
    !/^[A-Za-z0-9._-]{1,160}$/.test(item.paymentReference||'')||
    ![8,12,16,20].includes(item.totalUses)||item.initialUsedUses!==0||item.initialRemainingUses!==item.totalUses||
    typeof requestContext?.guardianId!=='string'||!/^[-A-Za-z0-9._]{1,120}$/.test(requestContext.guardianId)||
    typeof requestContext?.sourceChannel!=='string'||!requestContext.sourceChannel.trim()||requestContext.sourceChannel.length>40||
    typeof requestContext?.auditReference!=='string'||!/^SYNTH-AUDIT:[-A-Za-z0-9_]{8,100}$/.test(requestContext.auditReference))
   throw Object.assign(new Error('SYNTHETIC_PLAN_INVALID'),{code:'SYNTHETIC_PLAN_INVALID'});
  return {
   issuanceRequestId:item.requestId,idempotencyKey:item.idempotencyKey,paymentReference:item.paymentReference,
   productId:item.productId,catalogVersion:item.catalogVersion,petId:item.petId,guardianId:requestContext.guardianId,
   totalUses:item.totalUses,sourceChannel:requestContext.sourceChannel,auditReference:requestContext.auditReference
  };
 }
 function sameIntent(record,intent){
  return ['issuanceRequestId','idempotencyKey','paymentReference','productId','catalogVersion','petId','guardianId','sourceChannel','auditReference']
   .every(key=>record[key]===intent[key])&&record.totalUses===intent.totalUses;
 }
 function samePass(pass,intent){
  return pass?.issuanceRequestId===intent.issuanceRequestId&&pass.paymentReference===intent.paymentReference&&
   pass.productId===intent.productId&&pass.catalogVersion===intent.catalogVersion&&pass.petId===intent.petId&&
   pass.guardianId===intent.guardianId&&pass.totalUses===intent.totalUses&&pass.usedUses===0&&pass.remainingUses===intent.totalUses;
 }
 function result(status,record,extra={}){
  return {status,passId:record?.passId||null,issuanceRequestId:record?.issuanceRequestId||null,
   attemptCount:record?.attemptCount||0,passCount:passes.size,...extra};
 }
 function findPasses(intent){
  return [...passes.values()].filter(pass=>pass.issuanceRequestId===intent.issuanceRequestId||pass.paymentReference===intent.paymentReference);
 }

 async function issue(plan,requestContext={}){
  const intent=planData(plan,requestContext);
  const operation=queue.then(async()=>{
   const trigger=point=>{
    try{inject(point);}
    catch(error){const row=ledger.get(intent.issuanceRequestId);if(['PENDING','COMMITTED'].includes(row?.issuanceStatus))row.lastErrorCode=error.code;throw error;}
   };
   const existing=ledger.get(intent.issuanceRequestId);
   const related=findPasses(intent);
   const otherLedger=[...ledger.values()].find(row=>row.paymentReference===intent.paymentReference&&row.issuanceRequestId!==intent.issuanceRequestId);
   if(otherLedger)return result('NEEDS_REVIEW',otherLedger,{reason:'DUPLICATE_PAYMENT_REFERENCE'});
   if(related.some(pass=>pass.issuanceRequestId!==intent.issuanceRequestId))
    return result('NEEDS_REVIEW',existing,{reason:'DUPLICATE_PAYMENT_REFERENCE'});
   if(related.some(pass=>pass.paymentReference!==intent.paymentReference))
    return result('NEEDS_REVIEW',existing,{reason:'REQUEST_ID_CONFLICT'});
   if(related.length>1)return result('NEEDS_REVIEW',existing,{reason:'DUPLICATE_PASS_RECORDS'});
   if(existing&&!sameIntent(existing,intent))return result('NEEDS_REVIEW',existing,{reason:'REQUEST_ID_CONFLICT'});
   if(existing?.issuanceStatus==='COMMITTED'){
    if(related.length!==1||related[0].passId!==existing.passId||!samePass(related[0],intent))
     return result('NEEDS_REVIEW',existing,{reason:'COMMITTED_PAIR_MISMATCH'});
    return result('COMMITTED',existing,{alreadyCommitted:true});
   }
   if(existing&&['FAILED_FINAL','NEEDS_REVIEW'].includes(existing.issuanceStatus))
    return result('NEEDS_REVIEW',existing,{reason:'MANUAL_RECONCILIATION_REQUIRED'});
   if(related.length===1&&(!existing||existing.issuanceStatus!=='PENDING'))
    return result('NEEDS_REVIEW',existing,{reason:'PASS_WITHOUT_PENDING_LEDGER'});
   if(existing&&existing.issuanceStatus!=='PENDING'&&existing.issuanceStatus!=='VALIDATED')
    return result('NEEDS_REVIEW',existing,{reason:'ISSUANCE_STATUS_INVALID'});

   const now=timestamp();
   let row=existing;
   if(!row){
    trigger('BEFORE_PENDING');
    row={...intent,passId:null,issuanceStatus:'PENDING',requestedAt:now,committedAt:null,
     attemptCount:1,lastErrorCode:null};
    ledger.set(intent.issuanceRequestId,row);
    trigger('AFTER_PENDING');
   }else{
    row.attemptCount++;
    row.lastErrorCode=null;
    if(row.issuanceStatus==='VALIDATED'){
     if(!canTransitionIssuanceStatus('VALIDATED','PENDING'))return result('NEEDS_REVIEW',row,{reason:'STATUS_TRANSITION_DENIED'});
     row.issuanceStatus='PENDING';
    }
   }
   trigger('BEFORE_PASS');
   let pass=related.find(candidate=>candidate.issuanceRequestId===intent.issuanceRequestId);
   if(!pass){
    passSequence++;
    const passId='SYNTH-PASS-'+String(passSequence).padStart(6,'0');
    pass={passId,issuanceRequestId:intent.issuanceRequestId,paymentReference:intent.paymentReference,
     productId:intent.productId,catalogVersion:intent.catalogVersion,petId:intent.petId,guardianId:intent.guardianId,
     totalUses:intent.totalUses,usedUses:0,remainingUses:intent.totalUses};
    passes.set(passId,pass);
    row.passId=passId;
   }else if(!samePass(pass,intent)){
    row.issuanceStatus='NEEDS_REVIEW';row.lastErrorCode='PASS_RECORD_MISMATCH';
    return result('NEEDS_REVIEW',row,{reason:'PASS_RECORD_MISMATCH'});
   }
   row.passId=pass.passId;
   trigger('AFTER_PASS');
   trigger('BEFORE_COMMITTED');
   if(!canTransitionIssuanceStatus(row.issuanceStatus,'COMMITTED'))
    return result('NEEDS_REVIEW',row,{reason:'STATUS_TRANSITION_DENIED'});
   const committedAt=timestamp();
   row.issuanceStatus='COMMITTED';row.committedAt=committedAt;row.lastErrorCode=null;
   trigger('AFTER_COMMITTED');
   return result('COMMITTED',row,{alreadyCommitted:false});
  });
  queue=operation.then(()=>undefined,()=>undefined);
  return operation;
 }

 function inspect(){
  const rows=[...ledger.values()].map(copy),items=[...passes.values()].map(copy);
  return {ledgerFields:[...LEDGER_FIELDS],ledger:rows,passes:items};
 }
 function seedPartialForTest({ledgerEntry,passRecord}){
  if(ledgerEntry){
   if(!STATUSES.has(ledgerEntry.issuanceStatus)||typeof ledgerEntry.issuanceRequestId!=='string')throw Error('Invalid synthetic ledger seed');
   ledger.set(ledgerEntry.issuanceRequestId,copy(ledgerEntry));
  }
  if(passRecord){
   if(typeof passRecord.passId!=='string'||passes.has(passRecord.passId))throw Error('Invalid synthetic pass seed');
   passes.set(passRecord.passId,copy(passRecord));
  }
 }
 return Object.freeze({issue,inspect,seedPartialForTest});
}

module.exports={LEDGER_FIELDS,canTransitionIssuanceStatus,createSyntheticPassIssuanceStore};
