'use strict';

const PROJECT='mungtheland-guardian-test';
const DATABASE='(default)';
const COLLECTION='attendance_test_v1';
const APPROVED_BOOKINGS=new Set(['RSV-TEST-CONCURRENT-003','RSV-TEST-CONCURRENT-004']);
const KST=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});

function documentName(bookingId){
 if(!APPROVED_BOOKINGS.has(bookingId))throw Error('DOCUMENT_OUT_OF_SCOPE');
 return `projects/${PROJECT}/databases/${DATABASE}/documents/${COLLECTION}/${bookingId}`;
}

function stringValue(value){return typeof value?.stringValue==='string'?value.stringValue:null;}
function eventRows(document){
 const values=document?.fields?.events?.arrayValue?.values??[];
 if(!Array.isArray(values))throw Error('EVENTS_SHAPE_INVALID');
 return values.map(value=>value?.mapValue?.fields??{});
}

function summarizeAttendance(bookingId,document){
 const expectedName=documentName(bookingId);
 if(!document||document.name!==expectedName)throw Error('DOCUMENT_SCOPE_MISMATCH');
 const fields=document.fields??{};
 const state=stringValue(fields.state);
 const bookingMatches=stringValue(fields.bookingId)===bookingId;
 const events=eventRows(document);
 const eventsMatch=events.every(event=>stringValue(event.bookingId)===bookingId);
 const eventIds=events.map(event=>stringValue(event.eventId));
 const actions=events.map(event=>stringValue(event.action));
 const times=events.map(event=>stringValue(event.at));
 const validTimes=times.every(value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value));
 const kstTimes=validTimes?times.map(value=>KST.format(new Date(value))):[];
 const eventCounts={checkIn:actions.filter(action=>action==='check-in').length,checkOut:actions.filter(action=>action==='check-out').length};
 const ordered=(actions.length===1&&actions[0]==='check-in')||
  (actions.length===2&&actions[0]==='check-in'&&actions[1]==='check-out');
 const expectedState=eventCounts.checkOut===1?'하원 완료':eventCounts.checkIn===1?'등원 중':null;
 const duplicateEventIds=eventIds.some((eventId,index)=>!eventId||eventIds.indexOf(eventId)!==index);
 const duplicateActions=eventCounts.checkIn>1||eventCounts.checkOut>1;
 const passDeductionStatus=stringValue(fields.passDeduction?.mapValue?.fields?.status);
 return {
  exists:true,bookingMatches,eventsMatch,state,eventCount:events.length,eventCounts,ordered,validTimes,kstTimes,
  duplicateEventIds,duplicateActions,stateMatches:expectedState===state,
  events:events.map((event,index)=>({action:actions[index],atMs:validTimes?Date.parse(times[index]):null})),
  updateTime:typeof document.updateTime==='string'?document.updateTime:null,
  passDeductionStatus
 };
}

function sheetTime(value){
 if(value instanceof Date)return Number.isFinite(value.getTime())?value.getTime():null;
 if(typeof value==='number')return Date.UTC(1899,11,30)+value*86400000;
 if(typeof value==='string'&&value.trim()&&Number.isFinite(Date.parse(value)))return Date.parse(value);
 return null;
}

function compareWithSheets({bookingId,attendance,bookingRows,historyRows}){
 documentName(bookingId);
 const matches=(bookingRows??[]).filter(row=>String(row?.[0]??'')===bookingId);
 if(matches.length===0)return {status:'NO_MATCH',matches:0,attendanceStatus:'NOT_APPLICABLE',timeStatus:'NOT_APPLICABLE',deductionStatus:'BLOCKED'};
 if(matches.length!==1)return {status:'MISMATCH',matches:matches.length,attendanceStatus:'MISMATCH',timeStatus:'BLOCKED',deductionStatus:'BLOCKED'};
 if(!attendance?.exists)return {status:'MISMATCH',matches:1,attendanceStatus:'MISMATCH',timeStatus:'BLOCKED',deductionStatus:'BLOCKED'};
 const booking=matches[0];
 const expectedAttendance=booking[8]==='미등원'?null:booking[8]==='등원 중'?'등원 중':booking[8]==='하원'?'하원 완료':null;
 const attendanceStatus=attendance.bookingMatches&&attendance.eventsMatch&&attendance.stateMatches&&expectedAttendance===attendance.state?'PASS':'MISMATCH';
 const eventRowsByAction=new Map((attendance.events??[]).filter(event=>event?.action).map(event=>[event.action,event]));
 let timeStatus='BLOCKED';
 const checkIn=eventRowsByAction.get('check-in'),checkOut=eventRowsByAction.get('check-out');
 const firestoreIn=checkIn?.atMs??null;
 const firestoreOut=checkOut?.atMs??null;
 const sheetIn=sheetTime(booking[6]),sheetOut=sheetTime(booking[7]);
 if(attendance.validTimes&&firestoreIn!==null&&firestoreOut!==null&&sheetIn!==null&&sheetOut!==null)
  timeStatus=Math.abs(firestoreIn-sheetIn)<=1000&&Math.abs(firestoreOut-sheetOut)<=1000?'PASS':'MISMATCH';
 const history=(historyRows??[]).filter(row=>String(row?.[4]??'')===bookingId);
 const latest=history.map((row,index)=>({row,index})).sort((a,b)=>{
  const ta=sheetTime(a.row[1]),tb=sheetTime(b.row[1]);
  return (ta??0)-(tb??0)||a.index-b.index;
 }).at(-1)?.row;
 const deductionFlag=String(booking[9]||'미차감');
 const expectedDeduction=!latest?'미차감':latest[2]==='차감'?'차감':latest[2]==='복구'?'복구':null;
 let deductionStatus='BLOCKED';
 if(!String(booking[4]??''))deductionStatus='NEEDS_REVIEW';
 else if(expectedDeduction===null||deductionFlag!==expectedDeduction||
  history.some(row=>String(row[3]??'')!==String(booking[4]))||history.filter(row=>row[2]==='차감').length>1)
  deductionStatus='MISMATCH';
 else if(attendance.passDeductionStatus==='COMPLETED'&&expectedDeduction==='차감'&&history.length>0)
  deductionStatus='PASS';
 const parts=[attendanceStatus,timeStatus,deductionStatus];
 const status=parts.includes('MISMATCH')?'MISMATCH':parts.includes('BLOCKED')||parts.includes('NEEDS_REVIEW')?'BLOCKED':'PASS';
 return {status,matches:1,attendanceStatus,timeStatus,deductionStatus,historyCount:history.length};
}

module.exports={PROJECT,DATABASE,COLLECTION,APPROVED_BOOKINGS,documentName,summarizeAttendance,compareWithSheets};
