// One in-memory journey using production functions; no Google APIs or production data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const names=['고객·반려견관리','예약·등하원관리','이용권관리','_이용권변동이력','회계관리'];
const rows=new Map(names.map(n=>[n,[]]));
const context={Date,Math,JSON,Number,String,Boolean,Object,Array,Error,isNaN,Logger:{log(){}},SpreadsheetApp:{flush(){}},
 Session:{getEffectiveUser:()=>({getEmail:()=> 'test-operator@example.invalid'})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 Utilities:{formatDate:(d,tz,fmt)=>fmt==='yyyyMMdd'?new Date(d).toISOString().slice(0,10).replace(/-/g,''):fmt==='yyyy-MM-dd HH:mm:ss'?'2026-11-01 12:00:00':new Date(d).toISOString().slice(0,10),getUuid:()=>String(++seq).padStart(8,'0')+'-test'}};
let seq=0;
vm.createContext(context);
for(const file of ['src/OperatorAudit.js','src/Code.js','src/Passes.js','src/PassAdjust.js','src/Accounting.js','src/Settlement.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const headers={...JSON.parse(vm.runInContext('JSON.stringify(MD_SCHEMAS)',context)),
 '_이용권변동이력':['이력 ID','일시','유형','이용권 ID','예약 ID','증감','이전','이후','운영자','사유']};
for(const name of names){if(!headers[name])throw Error('Missing schema '+name);rows.get(name).push(headers[name]);}
function sheet(name){const data=rows.get(name);if(!data)throw Error('Unknown sheet '+name);return {
 getLastRow:()=>data.length,getLastColumn:()=>headers[name].length,
 getRange:(r,c,h=1,w=1)=>({
  getValues:()=>data.slice(r-1,r-1+h).map(x=>Array.from({length:w},(_,i)=>x[c-1+i]??'')),
  getDisplayValues:()=>data.slice(r-1,r-1+h).map(x=>Array.from({length:w},(_,i)=>String(x[c-1+i]??''))),
  getValue:()=>data[r-1]?.[c-1]??'',getDisplayValue:()=>String(data[r-1]?.[c-1]??''),
  setValue:v=>{data[r-1][c-1]=v},
  setValues:v=>v.forEach((line,i)=>line.forEach((x,j)=>{data[r-1+i][c-1+j]=x})),
  createTextFinder:id=>({matchEntireCell:()=>({findNext:()=>{const idx=data.findIndex((x,i)=>i>0&&String(x[c-1])===String(id));return idx<0?null:{getRow:()=>idx+1}}})})
 }),
 appendRow:r=>data.push(r),deleteRow:r=>data.splice(r-1,1)
}};
context.mdSheet_=sheet;
context.mdCheckSetup=()=>({ok:true});
context.mdId_=p=>p+'-TEST-'+(++seq);
context.mdFindById_=(s,id)=>{const data=s.getRange(1,1,s.getLastRow(),1).getValues();const i=data.findIndex((r,j)=>j>0&&r[0]===id);return i<0?-1:i+1;};
context.mdAppend_=(name,record)=>{rows.get(name).push(headers[name].map(h=>record[h]??''));return record[headers[name][0]];};
const today=new Date().toISOString().slice(0,10);
const dog=context.mdRegisterDog({guardianName:'격리 보호자',phone:'000-0000-0000',dogName:'격리 반려견'});
const pass=context.mdRegisterPass({dogId:dog.dogId,productName:'주 2회',totalCount:3,startDate:'2020-01-01',expiryDate:'2099-12-31',price:60000,discount:0,paymentStatus:'완료',confirmPaid:true});
const booking=context.mdCreateBooking({dogId:dog.dogId,date:today});
assert.throws(()=>context.mdCreateBooking({dogId:dog.dogId,date:today}),/이미 존재/);
assert.throws(()=>context.mdDeductPass({bookingId:booking.bookingId,passId:pass.passId,operator:'신송이'}),/등원/);
assert.equal(context.mdCheckIn(booking.bookingId).checkedIn,true);
assert.equal(context.mdCheckIn(booking.bookingId).alreadyCheckedIn,true);
assert.equal(context.mdDeductPass({bookingId:booking.bookingId,passId:pass.passId,operator:'신송이'}).remainingCount,2);
assert.equal(context.mdDeductPass({bookingId:booking.bookingId,passId:pass.passId,operator:'신송이'}).alreadyDeducted,true);
assert.equal(context.mdCheckOut(booking.bookingId).checkedOut,true);
assert.equal(context.mdCheckOut(booking.bookingId).alreadyCheckedOut,true);
assert.equal(context.mdListPasses(dog.dogId)[0].remainingCount,2);
assert.equal(context.mdPassHistory(pass.passId).length,1);
assert.equal(rows.get('회계관리').length,1,'attendance and pass use must not create revenue');
const txn=context.mdAddAccountingEntry({type:'매출',category:'유치원 이용권',description:'실제 입금 확인 후 수동 등록',date:today,amount:60000,paymentMethod:'계좌이체',requestId:'REQ-JOURNEY0001',relatedId:pass.passId});
assert.equal(context.mdAddAccountingEntry({type:'매출',category:'유치원 이용권',description:'중복 요청',date:today,amount:60000,paymentMethod:'계좌이체',requestId:'REQ-JOURNEY0001'}).alreadyRecorded,true);
assert.equal(rows.get('회계관리').length,2);
const summary=context.mdSettlementPreview({month:today.slice(0,7),reserve:10000});
assert.equal(summary.monthProfit,60000);
assert.equal(summary.distributable,50000);
assert.equal(summary.owners['신송이'],25000);
assert.equal(summary.owners['정소영'],25000);
assert.equal(summary.previewOnly,true);
assert.equal(rows.get('회계관리').length,2,'settlement preview must not write');
console.log('PASS: isolated end-to-end dog > booking > check-in > manual pass > check-out > actual cash ledger > 50:50 preview');
