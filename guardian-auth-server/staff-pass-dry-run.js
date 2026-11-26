'use strict';

const {mdPlanAttendancePass_}=require('../src/AttendancePassPlan');
const {validateAttendanceHistory}=require('./attendance-history');
const {PassLedgerReadError}=require('./staff-pass-ledger-read');

const bookingColumns=['예약 ID','이용일','반려견 ID',null,'이용권 ID','예약상태','등원시간','하원시간','출석상태','차감상태'];
const passColumns=['이용권 ID','반려견 ID','상품 ID',null,null,'총 횟수','사용 횟수','잔여 횟수','시작일','만료일',null,null,null,'결제상태','이용권상태'];
const requestFields=['scope','bookingId','eventId','issuedAt','expiresAt'];
const seoulDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const TIMEOUT=Symbol('timeout');
const maxRequestLifetime=60_000;

function createPassDeductionDryRun({verifyStaff,verifyService,readAttendance,readLedger,binding,clock=Date.now,timeoutMs=4000}){
 if(![verifyStaff,verifyService,readAttendance,readLedger,clock].every(fn=>typeof fn==='function')||
   !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30_000)
  throw Error('A bounded read-only diagnostic requires explicit verifiers and readers');
 const {scope,workbookId,projectId,databaseId,region,collection,issuer,audience,subject,bookingIds,historyColumns,productKinds}=binding||{};
 if(![scope,workbookId,projectId,databaseId,region,collection,issuer,audience,subject].every(x=>typeof x==='string'&&x.trim())||
   !Array.isArray(bookingIds)||!bookingIds.length||!bookingIds.every(id=>/^RSV-[A-Z0-9-]{1,64}$/.test(id))||
   !Array.isArray(historyColumns)||historyColumns.length!==10||
   ![...historyColumns].every((entry,index)=>index===1?entry===null:typeof entry==='string'&&entry.trim())||
   !productKinds||typeof productKinds!=='object'||Array.isArray(productKinds))
  throw Error('Explicit diagnostic scope and schema required');
 const allowedBookings=new Set(bookingIds);
 const kinds=Object.fromEntries(Object.entries(productKinds).map(([id,definition])=>[
  id,definition&&typeof definition==='object'?{kind:definition.kind,total:definition.total}:definition
 ]));
 const expectedHistoryColumns=[...historyColumns];
 const attendanceTarget=Object.freeze({projectId,databaseId,region,collection});
 const formatDay=date=>seoulDay.format(date);
 const blocked=reason=>({status:'BLOCKED',reason,writesPerformed:0});
 const review=reason=>({status:'NEEDS_REVIEW',reason,writesPerformed:0});

 async function bounded(operation,expiresAt){
  const remaining=expiresAt-clock();
  if(remaining<=0)throw TIMEOUT;
  const controller=new AbortController();
  let timer;
  try{
   const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(TIMEOUT);controller.abort();},Math.min(timeoutMs,remaining));});
   return await Promise.race([operation(controller.signal),deadline]);
  }finally{clearTimeout(timer);}
 }

 return async function dryRun(input){
  const {staffCredential,serviceCredential,command}=input||{};
  const now=clock();
  if(!command||typeof command!=='object'||Object.keys(command).length!==requestFields.length||!requestFields.every(field=>Object.hasOwn(command,field))||
    command.scope!==scope||!allowedBookings.has(command.bookingId)||typeof command.eventId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(command.eventId)||
    ![command.issuedAt,command.expiresAt].every(Number.isSafeInteger)||command.issuedAt>now||
    command.expiresAt<=now||command.expiresAt-command.issuedAt>maxRequestLifetime)
   return blocked('REQUEST_OUT_OF_SCOPE_OR_EXPIRED');
  const {bookingId,eventId,expiresAt}=command;
  const readSource=()=>bounded(signal=>readAttendance({...attendanceTarget,bookingId,signal}),expiresAt);
  const inAttendanceScope=value=>value&&Object.entries(attendanceTarget).every(([key,expected])=>value[key]===expected);
  let staff;
  try{staff=await bounded(signal=>verifyStaff(staffCredential,{signal}),expiresAt);}
  catch{return blocked('STAFF_AUTH_FAILED');}
  if(staff?.role!=='staff'||staff.status!=='active')return blocked('STAFF_AUTH_FAILED');

  let service;
  try{service=await bounded(signal=>verifyService(serviceCredential,{signal}),expiresAt);}
  catch{return blocked('SERVICE_AUTH_FAILED');}
  if(service?.iss!==issuer||service.aud!==audience||service.sub!==subject||
    !Number.isSafeInteger(service.exp)||service.exp*1000<expiresAt)
   return blocked('SERVICE_AUTH_FAILED');

  let source;
  try{source=await readSource();}
  catch(error){return blocked(error===TIMEOUT?'ATTENDANCE_TIMEOUT':'ATTENDANCE_READ_FAILED');}
  if(!inAttendanceScope(source))
   return blocked('ATTENDANCE_SCOPE_UNVERIFIED');
  const attendanceVersion=source.version;
  const document=source.document;
  if(!document)return review('ATTENDANCE_NOT_CONFIRMED');
  let state;
  try{state=validateAttendanceHistory(bookingId,document.events);}
  catch{return review('ATTENDANCE_HISTORY_INVALID');}
  const [event]=document.events;
  if(document.bookingId!==bookingId||document.state!==state||!event||event.eventId!==eventId||
    Date.parse(event.at)>clock())
   return review('ATTENDANCE_NOT_CONFIRMED');

  let workbook;
  try{workbook=await bounded(signal=>readLedger({workbookId,bookingId,signal}),expiresAt);}
  catch(error){return blocked(error===TIMEOUT?'LEDGER_TIMEOUT':error instanceof PassLedgerReadError?error.message:'LEDGER_READ_FAILED');}
  if(clock()>=expiresAt)return blocked('REQUEST_OUT_OF_SCOPE_OR_EXPIRED');
  if(workbook?.workbookId!==workbookId||workbook.complete!==true)return blocked('LEDGER_SCOPE_OR_COMPLETENESS_UNVERIFIED');
  if(workbook.snapshot!==undefined){
   const {openedAt,closedAt}=workbook.snapshot||{};
   if(![openedAt,closedAt].every(Number.isSafeInteger)||openedAt>closedAt||closedAt>clock()||
     typeof attendanceVersion!=='string'||!attendanceVersion)
    return blocked('ATTENDANCE_SNAPSHOT_UNVERIFIED');
   let readback;
   try{readback=await readSource();}
   catch(error){return blocked(error===TIMEOUT?'ATTENDANCE_TIMEOUT':'ATTENDANCE_READ_FAILED');}
   if(clock()>=expiresAt)return blocked('REQUEST_OUT_OF_SCOPE_OR_EXPIRED');
   if(!inAttendanceScope(readback))return blocked('ATTENDANCE_SCOPE_UNVERIFIED');
   if(readback.version!==attendanceVersion||readback.document?.state!==state||
     readback.document?.bookingId!==bookingId||readback.document?.events?.[0]?.eventId!==eventId)
    return blocked('ATTENDANCE_SNAPSHOT_CHANGED');
  }
  const {bookings,passes,history}=workbook;
  const valid=(table,columns)=>Array.isArray(table?.headers)&&
   columns.every((label,index)=>label===null||table.headers[index]===label)&&
   Array.isArray(table.rows)&&table.rows.every(Array.isArray);
  if(!valid(bookings,bookingColumns)||!valid(passes,passColumns)||!valid(history,expectedHistoryColumns))
   return blocked('LEDGER_SCHEMA_UNVERIFIED');

  const matches=bookings.rows.filter(row=>row[0]===bookingId);
  if(matches.length!==1)return review(matches.length?'BOOKING_DUPLICATE':'BOOKING_NOT_FOUND');
  const [booking]=matches;
  const linked=booking[4];
  const passRows=linked?passes.rows.filter(row=>row[0]===linked):[];
  if(passRows.length>1)return review('PASS_DUPLICATE');

  let result;
  try{
   result=mdPlanAttendancePass_({bookingId,booking,pass:passRows[0],history:history.rows,event,scope,
    productKinds:kinds,formatDay,today:formatDay(new Date(clock())),attendanceState:state,strictCatalog:workbook.snapshot!==undefined});
  }catch{return blocked('LEDGER_DATA_INVALID');}
  const claim=document.passDeduction;
  if(claim!==undefined&&(claim?.key!==scope+':'+bookingId||claim.eventId!==eventId||
    !['PENDING','NEEDS_REVIEW','COMPLETED','NOT_REQUIRED'].includes(claim.status)))
   return review('ATTEMPT_SCOPE_OR_EVENT_MISMATCH');
  if(claim!==undefined&&result.status==='ELIGIBLE')return review('ATTEMPT_ALREADY_RECORDED');
  if(['COMPLETED','NOT_REQUIRED'].includes(claim?.status)&&claim.status!==result.status)
   return review('ATTEMPT_LEDGER_MISMATCH');
  return {...result,writesPerformed:0};
 };
}

module.exports={createPassDeductionDryRun};
