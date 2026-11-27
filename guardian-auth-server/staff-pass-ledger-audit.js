'use strict';

const EXPECTED_HEADERS=Object.freeze({
 bookings:Object.freeze(['예약 ID','이용일','반려견 ID','반려견명','이용권 ID','예약상태','등원시간','하원시간','출석상태','차감상태','비고']),
 passes:Object.freeze(['이용권 ID','반려견 ID','상품 ID','상품명','구매일','총 횟수','사용 횟수','잔여 횟수','시작일','만료일','판매금액','할인금액','결제금액','결제상태','이용권상태']),
 history:Object.freeze(['이력 ID','처리시각','처리유형','이용권 ID','예약 ID','변동횟수','변경전 잔여','변경후 잔여','처리자','사유'])
});
const {INTEGRATION_TEST_WORKBOOK_ID}=require('./staff-pass-ledger-read');
const codes=Object.freeze(['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T']);
const text=value=>typeof value==='string'?value.trim():'';
const nonempty=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
const exactDate=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};

function analyzePassLedger({workbook,productCatalog,firestoreEvidence,source='synthetic'}){
 const results=Object.fromEntries(codes.map(code=>[code,{status:'PASS',issues:0}]));
 const set=(code,status,issues=0)=>{results[code]={status,issues};};
 const tables=['bookings','passes','history'];
 const captured=workbook?.snapshot;
 const validSnapshot=captured&&typeof captured.version==='string'&&captured.version.length>0&&
  Number.isSafeInteger(captured.openedAt)&&Number.isSafeInteger(captured.closedAt)&&captured.openedAt<=captured.closedAt;
 if(!workbook||workbook.complete!==true||!validSnapshot||!['Etc/GMT','Asia/Seoul'].includes(captured.timeZone)||
  (source==='integration-test'&&workbook.workbookId!==INTEGRATION_TEST_WORKBOOK_ID)){
  for(const code of codes)set(code,'BLOCKED');
  return safeResult(results,{bookings:0,passes:0,history:0},source);
 }
 let schemaIssue=0;
 for(const key of tables){
  const table=workbook[key],expected=EXPECTED_HEADERS[key];
  if(!Array.isArray(table?.headers)||expected.some((header,index)=>table.headers[index]!==header)||
   !Array.isArray(table.rows)||table.rows.some(row=>!Array.isArray(row)||row.length>expected.length))schemaIssue++;
 }
 if(schemaIssue){for(const code of codes)set(code,'BLOCKED',schemaIssue);return safeResult(results,{bookings:0,passes:0,history:0},source);}
 const bookings=workbook.bookings.rows.filter(row=>row.some(nonempty));
 const passes=workbook.passes.rows.filter(row=>row.some(nonempty));
 const history=workbook.history.rows.filter(row=>row.some(nonempty));
 const rowCounts={bookings:bookings.length,passes:passes.length,history:history.length};
 const uniqueCounts=(rows,index)=>rows.reduce((map,row)=>{
  const id=text(row[index]);if(id)map.set(id,(map.get(id)||0)+1);return map;
 },new Map());
 const bookingIds=uniqueCounts(bookings,0),passIds=uniqueCounts(passes,0),historyIds=uniqueCounts(history,0);
 const duplicates=map=>[...map.values()].filter(count=>count>1).reduce((sum,count)=>sum+count-1,0);
 const missingIds= (rows,index)=>rows.filter(row=>!text(row[index])).length;
 const bookingIdIssues=duplicates(bookingIds)+missingIds(bookings,0),passIdIssues=duplicates(passIds)+missingIds(passes,0),historyIdIssues=duplicates(historyIds)+missingIds(history,0);
 set('A',bookingIdIssues?'FAIL':'PASS',bookingIdIssues);
 set('B',passIdIssues?'FAIL':'PASS',passIdIssues);
 set('C',historyIdIssues?'FAIL':'PASS',historyIdIssues);
 const passById=new Map(passes.filter(row=>text(row[0])).map(row=>[text(row[0]),row]));
 const bookingById=new Map(bookings.filter(row=>text(row[0])).map(row=>[text(row[0]),row]));
 const bookingHistory=new Map(),passHistory=new Map();
 for(const row of history){
  const bookingId=text(row[4]),passId=text(row[3]);
  if(bookingId){const list=bookingHistory.get(bookingId)||[];list.push(row);bookingHistory.set(bookingId,list);}
  if(passId){const list=passHistory.get(passId)||[];list.push(row);passHistory.set(passId,list);}
 }
 let missingPass=0,dogMismatch=0;
 for(const booking of bookings){const passId=text(booking[4]);if(!passId||!passById.has(passId))missingPass++;
  else if(passId&&text(booking[2])&&text(booking[2])!==text(passById.get(passId)[1]))dogMismatch++;}
 set('D',missingPass?'FAIL':'PASS',missingPass);set('E',dogMismatch?'FAIL':'PASS',dogMismatch);
 let skuMismatch=0,unknownSku=0;
 for(const pass of passes){const definition=productCatalog?.[text(pass[2])];
  if(!definition){unknownSku++;continue;}
  if(definition.kind==='RECURRING'&&(![8,12,16,20].includes(definition.total)||pass[5]!==definition.total))skuMismatch++;
  if(definition.kind==='DAY'&&pass[5]!==1)skuMismatch++;
 }
 set('F',!productCatalog||unknownSku?'BLOCKED':skuMismatch?'FAIL':'PASS',skuMismatch+unknownSku);
 let arithmetic=0,negative=0;
 for(const pass of passes){const [total,used,remaining]=pass.slice(5,8);
  if(![total,used,remaining].every(Number.isSafeInteger)||total!==used+remaining)arithmetic++;
  if(Number.isFinite(remaining)&&remaining<0)negative++;}
 set('G',arithmetic?'FAIL':'PASS',arithmetic);set('H',negative?'FAIL':'PASS',negative);
 const hasCharge=rows=>rows.some(row=>text(row[2])==='차감');
 let unpaidUse=0;
 for(const pass of passes){if(pass[13]!=='완료'&&(Number(pass[6])>0||hasCharge(passHistory.get(text(pass[0]))||[])))unpaidUse++;}
 set('I',unpaidUse?'FAIL':'PASS',unpaidUse);
 let dateUse=0;
 for(const [bookingId,rows] of bookingHistory){const booking=bookingById.get(bookingId);if(!booking||!hasCharge(rows))continue;
  const pass=passById.get(text(booking[4]));if(!pass)continue;
  const visit=booking[1],start=pass[8],expiry=pass[9];
  if(!exactDate(visit)||(start&&!exactDate(start))||(expiry&&!exactDate(expiry))||(start&&visit<start)||(expiry&&visit>expiry))dateUse++;}
 set('J',dateUse?'FAIL':'PASS',dateUse);
 let duplicateDeductions=0,manualAuto=0,continuity=0,historyBalance=0;
 for(const rows of bookingHistory.values()){
  const charges=rows.filter(row=>text(row[2])==='차감');
  if(charges.length>1)duplicateDeductions+=charges.length-1;
  if(charges.some(row=>row[8]==='AUTO_ATTENDANCE')&&charges.some(row=>row[8]!== 'AUTO_ATTENDANCE'))manualAuto++;
 }
 set('K',duplicateDeductions?'FAIL':'PASS',duplicateDeductions);set('L',manualAuto?'FAIL':'PASS',manualAuto);
 for(const [passId,rows] of passHistory){
  const ordered=[...rows].sort((a,b)=>String(a[1]||'').localeCompare(String(b[1]||'')));
  for(let index=0;index<ordered.length;index++){
   const row=ordered[index],delta=row[5],before=row[6],after=row[7],action=text(row[2]);
   const expected=action==='차감'?-1:action==='복구'?1:null;
   if(!expected||delta!==expected||!Number.isSafeInteger(before)||!Number.isSafeInteger(after)||after!==before+expected||
    (index&&ordered[index-1][7]!==before))continuity++;
  }
  const pass=passById.get(passId);
  if(pass){const net=ordered.reduce((sum,row)=>sum+(Number.isSafeInteger(row[5])?row[5]:0),0);
   if(pass[7]!==pass[5]+net||pass[6]!==-net)historyBalance++;}
 }
 set('M',continuity?'FAIL':'PASS',continuity);set('N',historyBalance?'FAIL':'PASS',historyBalance);
 let cancelledUse=0,unconfirmedUse=0,dayUse=0,flagMismatch=0,confirmedUnsettled=0,unknownDayType=0;
 for(const booking of bookings){
  const id=text(booking[0]),rows=bookingHistory.get(id)||[],charges=rows.filter(row=>text(row[2])==='차감');
  const cancelled=['예약취소','취소','취소완료'].includes(text(booking[5]));
  const confirmed=['등원 중','하원','하원 완료'].includes(text(booking[8]));
  if(/취소/.test(text(booking[5]))&&charges.length)cancelledUse+=charges.length;
  if(!confirmed&&charges.length)unconfirmedUse+=charges.length;
  const pass=passById.get(text(booking[4]));
  if(pass&&productCatalog?.[text(pass[2])]?.kind==='DAY'&&charges.length)dayUse+=charges.length;
  const net=rows.reduce((sum,row)=>sum+(text(row[2])==='차감'?-1:text(row[2])==='복구'?1:0),0);
  const ordered=rows.map((row,index)=>({row,index})).sort((a,b)=>
   String(a.row[1]||'').localeCompare(String(b.row[1]||''))||a.index-b.index);
  const latest=ordered.at(-1)?.row;
  const flag=text(booking[9])||'미차감';
  const expected=!latest?'미차감':text(latest[2])==='차감'?'차감':text(latest[2])==='복구'?'복구':null;
  if(expected===null||flag!==expected)flagMismatch++;
  const definition=pass&&productCatalog?.[text(pass[2])],kind=definition?.kind;
  if(confirmed&&!definition)unknownDayType++;
  if(confirmed&&kind!=='DAY'&&definition&&(net!==-1||flag!=='차감'))confirmedUnsettled++;
 }
 set('O',cancelledUse?'FAIL':'PASS',cancelledUse);set('P',unconfirmedUse?'FAIL':'PASS',unconfirmedUse);
 const unknownProductRows=passes.filter(pass=>!productCatalog?.[text(pass[2])]).length;
 set('Q',!productCatalog||unknownProductRows?'BLOCKED':dayUse?'FAIL':'PASS',unknownProductRows+dayUse);
 set('R',flagMismatch?'FAIL':'PASS',flagMismatch);
 set('S',unknownDayType?'BLOCKED':confirmedUnsettled?'FAIL':'PASS',unknownDayType+confirmedUnsettled);
 if(source==='synthetic'&&Array.isArray(firestoreEvidence))set('T','NOT_APPLICABLE');
 else set('T','BLOCKED');
 return safeResult(results,rowCounts,source);
}

function safeResult(checks,rowCounts,source){
 const summary={PASS:0,FAIL:0,NOT_APPLICABLE:0,BLOCKED:0};
 for(const check of Object.values(checks))summary[check.status]++;
 return {source,readOnly:true,writesPerformed:0,rowCounts,summary,checks};
}

module.exports={analyzePassLedger,EXPECTED_HEADERS};
