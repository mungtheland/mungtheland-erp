// Isolated in-memory regression: never opens or writes the production spreadsheet.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sheets=new Map();
const names=['고객·반려견관리','예약·등하원관리','이용권관리','_이용권변동이력'];
for(const name of names)sheets.set(name,[]);
const headers={
 '고객·반려견관리':['반려견 ID','고객 ID','보호자명','연락처','반려견명'],
 '예약·등하원관리':['예약 ID','이용일','반려견 ID','반려견명','이용권 ID','예약상태','등원시간','하원시간','출석상태','차감상태','비고'],
 '이용권관리':['이용권 ID','반려견 ID','상품 ID','상품명','구매일','총 횟수','사용 횟수','잔여 횟수','시작일','만료일','판매금액','할인금액','결제금액','결제상태','이용권상태'],
 '_이용권변동이력':['이력 ID','일시','유형','이용권 ID','예약 ID','증감','이전','이후','운영자','사유']
};
for(const name of names)sheets.get(name).push(headers[name]);
function sheet(name){const rows=sheets.get(name);if(!rows)throw Error(name);return {
 getLastRow:()=>rows.length,
 getRange:(r,c,h=1,w=1)=>({getValues:()=>rows.slice(r-1,r-1+h).map(x=>Array.from({length:w},(_,i)=>x[c-1+i]??'')),getDisplayValues:()=>rows.slice(r-1,r-1+h).map(x=>Array.from({length:w},(_,i)=>String(x[c-1+i]??''))),getValue:()=>rows[r-1]?.[c-1]??'',getDisplayValue:()=>String(rows[r-1]?.[c-1]??''),setValue:v=>{rows[r-1][c-1]=v},setValues:values=>values.forEach((line,i)=>line.forEach((v,j)=>{rows[r-1+i][c-1+j]=v})),createTextFinder:id=>({matchEntireCell:()=>({findNext:()=>{const idx=rows.findIndex((x,i)=>i>0&&x[c-1]===id);return idx<0?null:{getRow:()=>idx+1}}})})}),
 appendRow:row=>rows.push(row),deleteRow:r=>rows.splice(r-1,1)
}};
let seq=0;const context={Date,Number,String,Boolean,Object,Array,Math,JSON,Error,Logger:{log(){}},SpreadsheetApp:{flush(){}},Session:{getEffectiveUser:()=>({getEmail:()=> 'test@example.invalid'})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{formatDate:(d,tz,fmt)=>{const x=new Date(d);return fmt==='yyyyMMdd'?x.toISOString().slice(0,10).replace(/-/g,''):x.toISOString().slice(0,10)},getUuid:()=>String(++seq).padStart(8,'0')+'-mock'},mdCheckSetup:()=>({ok:true}),mdSheet_:sheet,mdRequired_:(v,l)=>{if(v===undefined||v===null||String(v).trim()==='')throw Error(l);return String(v).trim()},mdId_:prefix=>prefix+'-TEST-'+(++seq),mdFindById_:(s,id)=>{const v=s.getRange(1,1,s.getLastRow(),1).getValues();return v.findIndex((r,i)=>i>0&&r[0]===id)+1||-1},mdAppend_:(name,record)=>{sheet(name).appendRow(headers[name].map(h=>record[h]??''));return record[headers[name][0]]}};
vm.createContext(context);
for(const p of ['src/OperatorAudit.js','src/Passes.js','src/PassAdjust.js'])vm.runInContext(fs.readFileSync(p,'utf8'),context,{filename:p});
sheets.get('고객·반려견관리').push(['DOG-TEST','CUS-TEST','테스트 보호자','000','테스트견']);
const today=new Date().toISOString().slice(0,10);
const created=context.mdRegisterPass({dogId:'DOG-TEST',productName:'주 2회',totalCount:3,startDate:'2020-01-01',expiryDate:'2099-12-31',price:60000,discount:0,paymentStatus:'완료',confirmPaid:true});
assert.equal(created.remainingCount,3);
assert.equal(context.mdListPasses('DOG-TEST')[0].remainingCount,3);
sheets.get('예약·등하원관리').push(['RSV-TEST',today,'DOG-TEST','테스트견','','예약',new Date(),'','등원 중','미차감','']);
const used=context.mdDeductPass({bookingId:'RSV-TEST',passId:created.passId,operator:'운영자 A'});
assert.equal(used.remainingCount,2);
assert.equal(context.mdDeductPass({bookingId:'RSV-TEST',passId:created.passId,operator:'운영자 A'}).alreadyDeducted,true);
assert.equal(context.mdPassHistory(created.passId).length,1);
const restored=context.mdRestorePass({bookingId:'RSV-TEST',passId:created.passId,reason:'테스트 복구',operator:'운영자 A'});
assert.equal(restored.remainingCount,3);
assert.equal(context.mdPassHistory(created.passId).length,2);
assert.equal(context.mdListPasses('DOG-TEST')[0].remainingCount,3);
// Cancelled reservations must never consume a pass, even if a check-in timestamp exists.
const booking=sheets.get('예약·등하원관리')[1];
booking[5]='예약취소';
assert.throws(()=>context.mdDeductPass({bookingId:'RSV-TEST',passId:created.passId,operator:'운영자 A'}),/예약상태/);
booking[5]='예약';
booking[8]='미등원';
assert.throws(()=>context.mdDeductPass({bookingId:'RSV-TEST',passId:created.passId,operator:'운영자 A'}),/출석상태/);
booking[8]='등원 중';
assert.equal(context.mdDeductPass({bookingId:'RSV-TEST',passId:created.passId,operator:'운영자 A'}).remainingCount,2);
assert.equal(context.mdRestorePass({bookingId:'RSV-TEST',passId:created.passId,reason:'정상 복구',operator:'운영자 A'}).remainingCount,3);
assert.equal(sheets.get('이용권관리').length,2);
// Repeated restore is rejected, with no extra ledger entry or count change.
const historyRows=sheets.get('_이용권변동이력');
const beforeDuplicateRestore=historyRows.length;
assert.throws(()=>context.mdRestorePass({bookingId:'RSV-TEST',passId:created.passId,reason:'중복 복구',operator:'운영자 A'}),/차감 기록/);
assert.equal(historyRows.length,beforeDuplicateRestore);
assert.equal(context.mdListPasses('DOG-TEST')[0].remainingCount,3);
// Deduct the last available use, then reject a new booking with zero remaining.
const passRow=sheets.get('이용권관리')[1];
passRow[5]=1;passRow[6]=0;passRow[7]=1;passRow[14]='사용 가능';
sheets.get('예약·등하원관리').push(['RSV-LAST',today,'DOG-TEST','테스트견','','예약',new Date(),'','등원 중','미차감','']);
assert.equal(context.mdDeductPass({bookingId:'RSV-LAST',passId:created.passId,operator:'운영자 A'}).remainingCount,0);
assert.equal(context.mdDeductPass({bookingId:'RSV-LAST',passId:created.passId,operator:'운영자 A'}).alreadyDeducted,true);
sheets.get('예약·등하원관리').push(['RSV-EXTRA',today,'DOG-TEST','테스트견','','예약',new Date(),'','등원 중','미차감','']);
const beforeZero=historyRows.length;
assert.throws(()=>context.mdDeductPass({bookingId:'RSV-EXTRA',passId:created.passId,operator:'운영자 A'}),/잔여 횟수/);
assert.equal(historyRows.length,beforeZero);
assert.equal(passRow[7],0);
// Restoring the final use makes one use available again.
assert.equal(context.mdRestorePass({bookingId:'RSV-LAST',passId:created.passId,reason:'마지막 회차 복구',operator:'운영자 A'}).remainingCount,1);
assert.equal(passRow[14],'사용 가능');
console.log('PASS: in-memory dog/pass/attendance/deduct/restore/history, production untouched');
