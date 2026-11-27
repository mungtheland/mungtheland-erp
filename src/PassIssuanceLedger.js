'use strict';

// This module is deliberately disconnected from mdRegisterPass and defaults closed.
const MD_PASS_ISSUANCE_STORAGE_ENABLED_=false;
const MD_PASS_ISSUANCE_LEDGER_SHEET_='_이용권발급원장V2';
const MD_PASS_ISSUANCE_LOCK_WAIT_MS_=5000;
const MD_PASS_ISSUANCE_HEADERS_=Object.freeze([
 '발급요청 ID','멱등성 키','결제 참조','상품 ID','카탈로그 버전','반려견 ID','보호자 ID','이용권 ID',
 '총 횟수','발급 상태','요청시각','확정시각','처리 횟수','마지막 오류 코드','신청 채널','감사 참조'
]);
const MD_PASS_ISSUANCE_STATES_=new Set(['VALIDATED','PENDING','COMMITTED','NEEDS_REVIEW','FAILED_FINAL']);

function mdPassIssuanceEnabled_(){return MD_PASS_ISSUANCE_STORAGE_ENABLED_===true;}
function mdPassIssuanceV2SheetName_(){return MD_PASS_ISSUANCE_LEDGER_SHEET_;}
function mdPassIssuanceV2Headers_(){return MD_PASS_ISSUANCE_HEADERS_.slice();}
function mdPassIssuanceV2Fields_(){return ['issuanceRequestId','idempotencyKey','paymentReference','productId','catalogVersion','petId','guardianId','passId',
 'totalUses','issuanceStatus','requestedAt','committedAt','attemptCount','lastErrorCode','sourceChannel','auditReference'];}
function mdPassIssuanceValidateV2Headers_(headers){
 if(!Array.isArray(headers))return {valid:false,reason:'V2_HEADERS_INVALID'};
 if(new Set(headers).size!==headers.length)return {valid:false,reason:'V2_HEADERS_DUPLICATE'};
 if(headers.length!==MD_PASS_ISSUANCE_HEADERS_.length||MD_PASS_ISSUANCE_HEADERS_.some((header,i)=>headers[i]!==header))
  return {valid:false,reason:'V2_SCHEMA_MISMATCH'};
 return {valid:true,reason:'V2_SCHEMA_VALID'};
}

function mdPassIssuanceExactMatches_(rows,key,value){
 if(!Array.isArray(rows)||typeof key!=='string'||value===undefined||value===null)return [];
 return rows.filter(row=>row&&row[key]===value);
}

/** Pure comparison. It never repairs, normalizes or writes either snapshot. */
function mdPassIssuanceReconcile_(ledgerRows,passRows){
 if(!Array.isArray(ledgerRows)||!Array.isArray(passRows))return {status:'NEEDS_REVIEW',reason:'SNAPSHOT_INVALID'};
 for(const [rows,key] of [[ledgerRows,'issuanceRequestId'],[ledgerRows,'idempotencyKey'],[ledgerRows,'paymentReference'],[ledgerRows,'passId'],[passRows,'passId']]){
  const values=rows.map(row=>row&&row[key]).filter(value=>value!==undefined&&value!==null&&value!=='');
  if(new Set(values).size!==values.length)return {status:'DUPLICATE',reason:'DUPLICATE_'+key.toUpperCase()};
 }
 if(ledgerRows.length===0&&passRows.length===0)return {status:'NO_MATCH',reason:'NO_RECORDS'};
 if(ledgerRows.length!==1||passRows.length!==1)return {status:'NEEDS_REVIEW',reason:'UNKNOWN_RECORD_PAIR'};
 const ledger=ledgerRows[0],pass=passRows[0];
 if(!MD_PASS_ISSUANCE_STATES_.has(ledger.issuanceStatus))return {status:'NEEDS_REVIEW',reason:'UNKNOWN_STATUS'};
 const pairMatches=ledger.passId===pass.passId&&ledger.productId===pass.productId&&
  ledger.petId===pass.petId&&ledger.totalUses===pass.totalUses&&
  (pass.issuanceRequestId===undefined||ledger.issuanceRequestId===pass.issuanceRequestId)&&
  (pass.idempotencyKey===undefined||ledger.idempotencyKey===pass.idempotencyKey)&&
  (pass.paymentReference===undefined||ledger.paymentReference===pass.paymentReference)&&
  (pass.catalogVersion===undefined||ledger.catalogVersion===pass.catalogVersion)&&
  (pass.guardianId===undefined||ledger.guardianId===pass.guardianId);
 if(!pairMatches)return {status:'MISMATCH',reason:'PAIR_FIELDS_DIFFER'};
 if(ledger.issuanceStatus==='COMMITTED'&&ledger.committedAt&&pass.usedUses===0&&pass.remainingUses===pass.totalUses)
  return {status:'MATCH',reason:'COMMITTED_PAIR_MATCH'};
 if(ledger.issuanceStatus==='PENDING')return {status:'PARTIAL',reason:'PENDING_REQUIRES_REVIEW'};
 return {status:'NEEDS_REVIEW',reason:'STATE_NOT_COMMITTABLE'};
}

function mdPassIssuanceValidateCommand_(command){
 const c=command||{};
 const fields=['issuanceRequestId','idempotencyKey','paymentReference','productId','productName','petId','guardianId','sourceChannel','auditReference'];
 const safeText=value=>typeof value==='string'&&value===value.trim()&&!/^=/.test(value)&&!/[\r\n\0]/.test(value);
 const validDate=value=>value===''||(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);
 const validTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
 if(fields.some(key=>typeof c[key]!=='string'||!c[key]||c[key]!==c[key].trim()))return {ok:false,reason:'COMMAND_FIELD_INVALID'};
 if(c.validationStatus!=='VALIDATED'||!Number.isSafeInteger(c.catalogVersion)||c.catalogVersion<1||
   ![8,12,16,20].includes(c.totalUses)||c.idempotencyKey!=='PASS-ISSUE:v'+c.catalogVersion+':'+c.issuanceRequestId||
   !validTimestamp(c.requestedAt)||!(c.committedAt===''||validTimestamp(c.committedAt))||
   !validDate(c.startDate)||!validDate(c.expiryDate)||(c.startDate&&c.expiryDate&&c.startDate>c.expiryDate)||
   c.approvalStatus!=='APPROVED'||c.productType!=='PASS'||c.active!==true||c.paymentStatus!=='완료'||
   !Number.isSafeInteger(c.amount)||c.amount<0||!Number.isSafeInteger(c.saleAmount)||c.saleAmount<0||
   !Number.isSafeInteger(c.discountAmount)||c.discountAmount<0||c.discountAmount>c.saleAmount||c.amount!==c.saleAmount-c.discountAmount||
   c.sourceChannel.length>40||c.auditReference.length>160||c.productName.length>120||c.paymentReference.length>160||
   c.issuanceRequestId.length>120||c.productId.length>80||c.petId.length>120||c.guardianId.length>120)
  return {ok:false,reason:'COMMAND_NOT_APPROVED'};
 if(fields.some(key=>!safeText(c[key])))return {ok:false,reason:'COMMAND_TEXT_INVALID'};
 return {ok:true};
}

/**
 * Injected storage worker used by local contract tests only. The live GAS entry
 * point below cannot reach it until the source-level enable flag is reviewed.
 */
function mdPassIssuanceRunWithPorts_(command,ports){
 const valid=mdPassIssuanceValidateCommand_(command);
 if(!valid.ok)return {status:'BLOCKED',reason:valid.reason};
 if(!ports||typeof ports.getLock!=='function'||typeof ports.readSnapshot!=='function'||
   typeof ports.appendLedger!=='function'||typeof ports.appendPass!=='function'||typeof ports.updateLedger!=='function')
  return {status:'BLOCKED',reason:'STORAGE_PORT_INVALID'};
 const lock=ports.getLock();
 if(!lock||typeof lock.tryLock!=='function'||typeof lock.releaseLock!=='function')return {status:'BLOCKED',reason:'LOCK_UNAVAILABLE'};
 let acquired=false;
 try{
  acquired=lock.tryLock(MD_PASS_ISSUANCE_LOCK_WAIT_MS_)===true;
  if(!acquired)return {status:'BLOCKED',reason:'LOCK_TIMEOUT'};
  let snapshot=ports.readSnapshot();
  if(!snapshot||snapshot.schemaValid!==true||!Array.isArray(snapshot.ledger)||!Array.isArray(snapshot.passes))
   return {status:'NEEDS_REVIEW',reason:'SNAPSHOT_INVALID'};
  const req=mdPassIssuanceExactMatches_(snapshot.ledger,'issuanceRequestId',command.issuanceRequestId);
  const pay=mdPassIssuanceExactMatches_(snapshot.ledger,'paymentReference',command.paymentReference);
  if(req.length>1||pay.length>1)return {status:'NEEDS_REVIEW',reason:'DUPLICATE_RECORD'};
  if(pay.some(row=>row.issuanceRequestId!==command.issuanceRequestId))
   return {status:'NEEDS_REVIEW',reason:'PAYMENT_REFERENCE_CONFLICT'};
  if(req.length===1){
   const existing=req[0];
   if(existing.paymentReference!==command.paymentReference||existing.idempotencyKey!==command.idempotencyKey)
    return {status:'NEEDS_REVIEW',reason:'REQUEST_ID_CONFLICT'};
   if(existing.issuanceStatus==='COMMITTED'){
    const committedPass=mdPassIssuanceExactMatches_(snapshot.passes,'passId',existing.passId);
    const reconciled=mdPassIssuanceReconcile_([existing],committedPass);
    return reconciled.status==='MATCH'?{status:'COMMITTED',passId:existing.passId,alreadyCommitted:true}:reconciled;
   }
   return {status:'NEEDS_REVIEW',reason:existing.issuanceStatus==='PENDING'?'PENDING_RECONCILIATION_REQUIRED':'EXISTING_STATE_REVIEW'};
  }
  if(snapshot.legacyPaymentReferenceCoverage!=='COMPLETE')return {status:'NEEDS_REVIEW',reason:'LEGACY_PAYMENT_REFERENCE_UNVERIFIED'};
  if(snapshot.passes.some(row=>row.issuanceRequestId===command.issuanceRequestId||row.paymentReference===command.paymentReference))
   return {status:'NEEDS_REVIEW',reason:'PASS_WITHOUT_LEDGER'};
  const passId=typeof ports.createPassId==='function'?ports.createPassId():'PASS-ISSUE-'+command.issuanceRequestId;
  if(typeof passId!=='string'||!passId||passId!==passId.trim())return {status:'NEEDS_REVIEW',reason:'PASS_ID_UNKNOWN'};
  if(mdPassIssuanceExactMatches_(snapshot.passes,'passId',passId).length)return {status:'NEEDS_REVIEW',reason:'PASS_ID_DUPLICATE'};
  const pending={...command,passId,issuanceStatus:'PENDING',requestedAt:command.requestedAt,
   committedAt:'',attemptCount:1,lastErrorCode:''};
  let ledgerRow;
  try{ledgerRow=ports.appendLedger(pending);}
  catch(_){return {status:'NEEDS_REVIEW',reason:'PENDING_WRITE_UNKNOWN'};}
  if(!Number.isSafeInteger(ledgerRow)||ledgerRow<2)return {status:'NEEDS_REVIEW',reason:'PENDING_ROW_UNKNOWN'};
  const pass={issuanceRequestId:command.issuanceRequestId,idempotencyKey:command.idempotencyKey,
   paymentReference:command.paymentReference,productId:command.productId,catalogVersion:command.catalogVersion,
   petId:command.petId,guardianId:command.guardianId,passId,totalUses:command.totalUses,usedUses:0,remainingUses:command.totalUses};
  try{ports.appendPass(pass);}
  catch(_){return {status:'NEEDS_REVIEW',reason:'PASS_WRITE_UNKNOWN',passId};}
  let afterPass;
  try{afterPass=ports.readSnapshot();}
  catch(_){return {status:'NEEDS_REVIEW',reason:'PASS_READBACK_UNKNOWN',passId};}
  const foundPass=mdPassIssuanceExactMatches_(afterPass.passes,'passId',passId);
  if(foundPass.length!==1||mdPassIssuanceReconcile_([pending],[foundPass[0]]).status!=='PARTIAL')
   return {status:'NEEDS_REVIEW',reason:'PASS_READBACK_MISMATCH',passId};
  const committedAt=typeof ports.now==='function'?ports.now():new Date().toISOString();
  if(!Number.isFinite(Date.parse(committedAt)))return {status:'NEEDS_REVIEW',reason:'COMMIT_TIME_INVALID',passId};
  let updated;
  try{updated=ports.updateLedger(ledgerRow,{issuanceRequestId:command.issuanceRequestId,expectedStatus:'PENDING',passId,
   issuanceStatus:'COMMITTED',committedAt,attemptCount:1,lastErrorCode:''});}
  catch(_){return {status:'NEEDS_REVIEW',reason:'COMMIT_MARKER_UNKNOWN',passId};}
  if(updated!==true)return {status:'NEEDS_REVIEW',reason:'COMMIT_MARKER_CONFLICT',passId};
  let finalSnapshot;
  try{finalSnapshot=ports.readSnapshot();}
  catch(_){return {status:'NEEDS_REVIEW',reason:'COMMIT_READBACK_UNKNOWN',passId};}
  const finalLedger=mdPassIssuanceExactMatches_(finalSnapshot.ledger,'issuanceRequestId',command.issuanceRequestId);
  const finalPass=mdPassIssuanceExactMatches_(finalSnapshot.passes,'passId',passId);
  const reconciled=mdPassIssuanceReconcile_(finalLedger,finalPass);
  return reconciled.status==='MATCH'?{status:'COMMITTED',passId,alreadyCommitted:false}:{...reconciled,passId};
 }catch(_){return {status:'NEEDS_REVIEW',reason:'STORAGE_ERROR_UNKNOWN'};}
 finally{if(acquired){try{lock.releaseLock();}catch(_){}}}
}

function mdPassIssuanceSpreadsheetPorts_(){
 const book=mdBook_();
 const ledgerSheet=book.getSheetByName(MD_PASS_ISSUANCE_LEDGER_SHEET_);
 const passSheet=book.getSheetByName('이용권관리');
 if(!ledgerSheet||!passSheet)throw Error('ISSUANCE_LEDGER_TAB_MISSING');
 const ledgerHeaders=ledgerSheet.getRange(1,1,1,MD_PASS_ISSUANCE_HEADERS_.length).getDisplayValues()[0];
 const passHeaders=mdHeaders_(passSheet),expectedPassHeaders=MD_SCHEMAS['이용권관리'];
 if(!mdPassIssuanceValidateV2Headers_(ledgerHeaders).valid||
   ledgerSheet.getLastColumn()!==MD_PASS_ISSUANCE_HEADERS_.length||passHeaders.length!==expectedPassHeaders.length||
   expectedPassHeaders.some((header,i)=>passHeaders[i]!==header))throw Error('ISSUANCE_LEDGER_SCHEMA_MISMATCH');
 const rows=(sheet,count)=>sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,count).getValues():[];
 const ledgerFields=mdPassIssuanceV2Fields_();
 const ledgerFromRow=row=>Object.fromEntries(ledgerFields.map((key,i)=>[key,row[i]]));
 const ledgerToRow=record=>ledgerFields.map(key=>record[key]===undefined?'':record[key]);
 return {
  getLock:()=>LockService.getScriptLock(),
  createPassId:()=>mdId_('PASS'),
  readSnapshot(){
   const ledger=rows(ledgerSheet,MD_PASS_ISSUANCE_HEADERS_.length).map(row=>{
    const raw=ledgerFromRow(row);raw.catalogVersion=Number(raw.catalogVersion);raw.totalUses=Number(raw.totalUses);
    raw.attemptCount=Number(raw.attemptCount);return raw;
   });
   const passes=rows(passSheet,expectedPassHeaders.length).map(row=>({
    passId:row[0],petId:row[1],productId:row[2],paymentReference:'',catalogVersion:'',issuanceRequestId:'',idempotencyKey:'',
    guardianId:'',totalUses:Number(row[5]),usedUses:Number(row[6]),remainingUses:Number(row[7])
   }));
   return {schemaValid:true,legacyPaymentReferenceCoverage:'INCOMPLETE',ledger,passes};
  },
  appendLedger(record){ledgerSheet.appendRow(ledgerToRow(record));SpreadsheetApp.flush();return ledgerSheet.getLastRow();},
  appendPass(record){
   const row=Array(expectedPassHeaders.length).fill('');
   Object.assign(row,{0:record.passId,1:record.petId,2:record.productId,3:record.productName,4:new Date(),5:record.totalUses,6:0,7:record.totalUses,
    8:record.startDate,9:record.expiryDate,10:record.saleAmount,11:record.discountAmount,12:record.amount,13:'완료',14:'사용 가능'});
   passSheet.appendRow(row);
   SpreadsheetApp.flush();
  },
  updateLedger(rowNumber,changes){
   const current=ledgerSheet.getRange(rowNumber,1,1,MD_PASS_ISSUANCE_HEADERS_.length).getValues()[0];
   const row=ledgerFromRow(current);
   if(row.issuanceRequestId!==changes.issuanceRequestId||row.issuanceStatus!==changes.expectedStatus)return false;
   const allowed=new Set(['passId','issuanceStatus','committedAt','attemptCount','lastErrorCode']);
   Object.keys(changes).forEach(key=>{if(allowed.has(key))row[key]=changes[key];});
   ledgerSheet.getRange(rowNumber,1,1,MD_PASS_ISSUANCE_HEADERS_.length).setValues([ledgerToRow(row)]);
   SpreadsheetApp.flush();
   return true;
  }
 };
}

/** Private entry point. It returns DISABLED before opening or changing a workbook. */
function mdPersistPassIssuance_(command){
 if(!mdPassIssuanceEnabled_())return {status:'DISABLED',reason:'ISSUANCE_STORAGE_DISABLED'};
 try{return mdPassIssuanceRunWithPorts_(command,mdPassIssuanceSpreadsheetPorts_());}
 catch(_){return {status:'NEEDS_REVIEW',reason:'STORAGE_CONFIGURATION_UNKNOWN'};}
}

function mdReconcilePassIssuanceSnapshots_(ledgerRows,passRows){return mdPassIssuanceReconcile_(ledgerRows,passRows);}
