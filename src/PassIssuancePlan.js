/** Synthetic-only, non-persistent validator for a future pass issuance integration. */
const mdPassIssuanceCatalogApi_=typeof module!=='undefined'?require('./PassCatalog'):null;
const MD_PASS_ISSUANCE_REQUEST_FIELDS_=[
  'requestId','productId','catalogVersion','petId','guardianId','paymentStatus','paymentReference',
  'requestedUses','requestedStartDate','requestedExpiryDate','amount','sourceChannel'
];

function mdIssueDate_(value){
  if(value===null||value==='')return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return undefined;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:undefined;
}

function mdBuildPassIssuancePlan_({request,catalog,verification}={}){
  const deny=(validationStatus,reason)=>({validationStatus,reason,plan:null});
  if(verification?.mode!=='SYNTHETIC_FIXTURE')return deny('BLOCKED','SYNTHETIC_EVIDENCE_REQUIRED');
  if(!request||typeof request!=='object'||Array.isArray(request)||
    Object.keys(request).length!==MD_PASS_ISSUANCE_REQUEST_FIELDS_.length||
    !MD_PASS_ISSUANCE_REQUEST_FIELDS_.every(field=>Object.prototype.hasOwnProperty.call(request,field)))
    return deny('NEEDS_REVIEW','REQUEST_SHAPE_INVALID');

  const {requestId,productId,catalogVersion,petId,guardianId,paymentStatus,paymentReference,
    requestedUses,requestedStartDate,requestedExpiryDate,amount,sourceChannel}=request;
  if(typeof requestId!=='string'||!/^[-A-Za-z0-9_]{8,100}$/.test(requestId))return deny('NEEDS_REVIEW','REQUEST_ID_INVALID');
  if(typeof productId!=='string'||!productId.trim())return deny('NEEDS_REVIEW','PRODUCT_ID_MISSING');
  if(!Number.isSafeInteger(catalogVersion)||catalogVersion<1)return deny('NEEDS_REVIEW','CATALOG_VERSION_MISSING');
  if(typeof petId!=='string'||!petId.trim()||typeof guardianId!=='string'||!guardianId.trim())
    return deny('NEEDS_REVIEW','PET_GUARDIAN_LINK_MISSING');
  if(typeof sourceChannel!=='string'||!sourceChannel.trim()||sourceChannel.length>40||/[\r\n\0]/.test(sourceChannel))
    return deny('NEEDS_REVIEW','SOURCE_CHANNEL_INVALID');

  const catalogApi=mdPassIssuanceCatalogApi_||{mdResolvePassCatalogDeduction_};
  const product=catalogApi.mdResolvePassCatalogDeduction_({catalog,productId,totalUses:requestedUses,expectedVersion:catalogVersion});
  if(product.status==='BLOCKED')return deny('BLOCKED',product.reason);
  if(product.status!=='ELIGIBLE')return deny('NEEDS_REVIEW',product.reason||'PRODUCT_NOT_ELIGIBLE');

  const start=mdIssueDate_(requestedStartDate),expiry=mdIssueDate_(requestedExpiryDate);
  if(start===undefined||expiry===undefined||(start&&expiry&&start>expiry))
    return deny('NEEDS_REVIEW','ISSUANCE_DATE_INVALID');
  if(!Number.isSafeInteger(amount)||amount<0)return deny('NEEDS_REVIEW','AMOUNT_INVALID');
  if(paymentStatus!=='COMPLETED'||typeof paymentReference!=='string'||!paymentReference.trim()||paymentReference.length>160)
    return deny('NEEDS_REVIEW','PAYMENT_NOT_CONFIRMED');
  if(requestId===paymentReference)return deny('NEEDS_REVIEW','REQUEST_PAYMENT_REFERENCE_COLLISION');

  const pet=verification?.pet,payment=verification?.payment,history=verification?.issuanceHistory;
  if(pet?.exists!==true||pet.guardianId!==guardianId)return deny('NEEDS_REVIEW','PET_GUARDIAN_LINK_UNVERIFIED');
  if(payment?.verified!==true||payment.status!=='COMPLETED'||payment.reference!==paymentReference||payment.amount!==amount)
    return deny('NEEDS_REVIEW','PAYMENT_EVIDENCE_MISMATCH');
  if(history?.complete!==true||history?.issuanceLedgerStatus!=='KNOWN_EMPTY_OR_COMPLETE')
    return deny('NEEDS_REVIEW','ISSUANCE_HISTORY_UNVERIFIED');
  if(!['NOT_FOUND','FOUND'].includes(history.requestIdStatus)||!['NOT_FOUND','FOUND'].includes(history.paymentReferenceStatus))
    return deny('NEEDS_REVIEW','IDEMPOTENCY_LOOKUP_UNVERIFIED');
  if(history.requestIdStatus==='FOUND'){
    return deny('NEEDS_REVIEW',history.requestIdPaymentReference===paymentReference?
      'DUPLICATE_REQUEST_ID':'REQUEST_ID_CONFLICT');
  }
  if(history.paymentReferenceStatus==='FOUND')return deny('NEEDS_REVIEW','DUPLICATE_PAYMENT_REFERENCE');

  return {
    validationStatus:'PLAN_ONLY',
    plan:{
      requestId,productId,catalogVersion,petId,totalUses:requestedUses,initialUsedUses:0,
      initialRemainingUses:requestedUses,paymentReference,
      idempotencyKey:'PASS-ISSUE:v'+catalogVersion+':'+requestId,
      requiredLedgerWrites:['pass-record','issuance-idempotency-record'],
      warnings:['SYNTHETIC_FIXTURE_ONLY','NOT_PERSISTED','ISSUANCE_LEDGER_SCHEMA_NOT_IMPLEMENTED']
    }
  };
}

if(typeof module!=='undefined')module.exports={mdBuildPassIssuancePlan_};
