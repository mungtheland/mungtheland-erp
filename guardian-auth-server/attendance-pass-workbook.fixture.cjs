'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const sources=['OperatorAudit.js','AttendancePassPlan.js','PassAdjust.js'].map(name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8'));
const dateKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});

function createPassWorkbookFixture({now='2026-11-24T02:00:00Z'}={}){
 const bookings=[[]],passes=[[]],history=[[]];
 const sheets=new Map([['예약·등하원관리',bookings],['이용권관리',passes],['_이용권변동이력',history]]);
 const faults=new Map();
 let locked=false,seq=0,subject='',deductCalls=0,inspectCalls=0;
 const clock=()=>new Date(now);
 const properties=new Map([
  ['MD_ATTENDANCE_PASS_SCOPE','local-sheets'],
  ['MD_PASS_PRODUCT_KINDS',JSON.stringify({REGULAR:'RECURRING',DAILY:'DAY'})],
  ['MD_PASS_CORRECTION_APPROVERS',JSON.stringify({'admin@example.invalid':'PASS-ADMIN-FIXTURE'})]
 ]);
 class FixtureDate extends Date{constructor(...args){super(...(args.length?args:[now]));}}
 const put=(rows,row,col,value)=>{assert.ok(locked);rows[row-1][col-1]=value;};
 const runtime=vm.createContext({
  Date:FixtureDate,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)})},
  Session:{getActiveUser:()=>({getEmail:()=>subject})},
  LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
  Utilities:{formatDate:(value,zone,pattern)=>{assert.equal(zone,'Asia/Seoul');assert.equal(pattern,'yyyy-MM-dd');return dateKst.format(value);}},
  SpreadsheetApp:{flush(){assert.ok(locked);}},Logger:{log(){}},
  mdBook_:()=>({getId:()=> 'erp-local-pass-fixture'}),mdCheckSetup:()=>assert.ok(locked),
  mdRequired_:(value)=>{assert.ok(value);return String(value).trim();},mdId_:prefix=>prefix+'-'+ ++seq,
  mdSheet_:name=>{
   const rows=sheets.get(name);
   assert.ok(rows);
   const values=(row,col,height,width)=>rows.slice(row-1,row-1+height).map(r=>Array.from({length:width},(_,i)=>r[col-1+i]??''));
   return {
    getLastRow:()=>rows.length,
    getRange:(row,col,height=1,width=1)=>({
     getValues:()=>values(row,col,height,width),
     getDisplayValues:()=>values(row,col,height,width).map(r=>r.map(String)),
     getValue:()=>values(row,col,1,1)[0][0],getDisplayValue:()=>String(values(row,col,1,1)[0][0]),
     setValue:value=>put(rows,row,col,value),
     setValues:entries=>entries.forEach((entry,i)=>entry.forEach((value,j)=>put(rows,row+i,col+j,value)))
    }),
    appendRow(row){
     assert.ok(locked);rows.push(row);
     if(rows===history&&faults.get(row[4])==='partial')throw Error('Fixture lost append acknowledgement');
    },
    deleteRow(row){assert.ok(locked);rows.splice(row-1,1);}
   };
  }
 });
 for(const source of sources)vm.runInContext(source,runtime);
 function seed(bookingId,{dogId='DOG-FIXTURE',product='REGULAR',date=dateKst.format(clock()),remaining=8,used=8-remaining,
                         start='2026-01-01',expiry='2026-12-31',checkedIn=false,linked=true}={}){
  const passId='PASS-'+bookingId;
  const booking=[bookingId,date,dogId,'Fixture',linked?passId:'','예약',checkedIn?clock():'','',checkedIn?'등원 중':'미등원','미차감'];
  const pass=[passId,dogId,product,product,'',8,used,remaining,start,expiry,0,0,0,'완료',remaining?'사용 가능':'소진'];
  bookings.push(booking);passes.push(pass);
  return {booking,pass,passId};
 }
 const ledger={
  scope:'local-sheets',
  async deduct(command){
   deductCalls++;
   const fault=faults.get(command.event.bookingId);
   if(fault==='reject')throw Error('Fixture command not delivered');
   const result=runtime.mdAttendancePass_('deduct',command);
   if(fault==='lost')throw Error('Fixture lost deduction response');
   return result;
  },
  async inspect(command){inspectCalls++;return runtime.mdAttendancePass_('read',command);}
 };
 return {ledger,clock,seed,passes,history,properties,faults,runtime,authorizeAdmin:()=>{subject='admin@example.invalid';},
  snapshot:()=>JSON.stringify([...sheets]),stats:()=>({deductCalls,inspectCalls})};
}

module.exports={createPassWorkbookFixture};
