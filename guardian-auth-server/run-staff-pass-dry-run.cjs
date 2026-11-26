'use strict';

const {createPassDeductionDryRun}=require('./staff-pass-dry-run');
const {createStaffAuthenticator}=require('./staff-authenticate');
const {createPassLedgerReader,APPROVAL_RANGES}=require('./staff-pass-ledger-read');

// Fixed synthetic data. The CLI never reads credentials, files containing ledger data, or cloud APIs.
function createSyntheticDryRunFixture({projectId='demo-mungtheland-pass'}={}){
 const now=Date.parse('2026-11-26T10:10:00Z');
 const bookingId='RSV-SYNTHETIC-050',passId='PASS-SYNTHETIC-050',dogId='DOG-SYNTHETIC-050';
 const binding={
  scope:'synthetic-stage50',workbookId:'synthetic-workbook',projectId,
  databaseId:'(default)',region:'asia-northeast3',collection:'attendance_test_v1',
  issuer:'synthetic-issuer',audience:'synthetic-audience',subject:'synthetic-workload',
  bookingIds:[bookingId],historyColumns:['이력 ID',null,'유형','이용권 ID','예약 ID','증감','이전','이후','운영자','사유'],
  productKinds:{'PRODUCT-DAY':{kind:'DAY'},...Object.fromEntries([8,12,16,20].map(total=>[
   'PRODUCT-'+total,{kind:'RECURRING',total}
  ]))}
 };
 const event={eventId:'EVT-SYNTHETIC-IN',bookingId,action:'check-in',staffId:'STAFF-SYNTHETIC-050',at:'2026-11-26T10:00:00Z'};
 const booking=[bookingId,'2026-11-26',dogId,'SYNTHETIC_PRIVATE_NAME',passId,'예약','','','미등원','미차감'];
 const pass=[passId,dogId,'PRODUCT-8','','',8,0,8,'2026-11-01','2026-12-31','','','','완료','사용 가능'];
 const source={projectId:binding.projectId,databaseId:binding.databaseId,region:binding.region,collection:binding.collection,version:'synthetic-attendance-version',
  document:{bookingId,state:'등원 중',events:[event]}};
 const workbook={
  workbookId:binding.workbookId,complete:true,
  bookings:{headers:['예약 ID','이용일','반려견 ID',null,'이용권 ID','예약상태','등원시간','하원시간','출석상태','차감상태'],rows:[booking]},
  passes:{headers:['이용권 ID','반려견 ID','상품 ID',null,null,'총 횟수','사용 횟수','잔여 횟수','시작일','만료일',null,null,null,'결제상태','이용권상태'],rows:[pass]},
  history:{headers:[...binding.historyColumns],rows:[]}
 };
 const staffCredential='synthetic-staff-credential-'.repeat(4);
 const serviceCredential='synthetic-service-credential';
 const email='synthetic@example.invalid',uid='synthetic-uid';
 const verifyStaff=createStaffAuthenticator({
  projectId:binding.projectId,
  firebaseAuth:{async verifyIdToken(token,checkRevoked){
   if(token!==staffCredential||checkRevoked!==true)throw Error('Synthetic authentication rejected');
   return {aud:binding.projectId,iss:'https://securetoken.google.com/'+binding.projectId,sub:uid,uid,
    email,email_verified:true,exp:Math.floor(Date.now()/1000)+300};
  }},
  accountStore:{async findByFirebaseUid(candidate){
   return candidate===uid?{email,status:'active',staffId:event.staffId}:null;
  }}
 });
 const ports={
  binding,clock:()=>now,verifyStaff,
  async verifyService(token){
   return token===serviceCredential?{iss:binding.issuer,aud:binding.audience,sub:binding.subject,exp:now/1000+60}:null;
  },
  async readAttendance(){return source;},
  async readLedger(){return workbook;}
 };
 const request={staffCredential,serviceCredential,command:{
  scope:binding.scope,bookingId,eventId:event.eventId,issuedAt:now-1000,expiresAt:now+5000
 }};
 function markManual(){
  booking[9]='차감';pass[6]=1;pass[7]=7;
  workbook.history.rows.push(['HIS-SYNTHETIC','','차감',passId,bookingId,-1,8,7,'SYNTHETIC_PRIVATE_ACTOR','SYNTHETIC_PRIVATE_NOTE']);
 }
 return {ports,request,source,workbook,booking,pass,markManual};
}

function createSyntheticLedgerOptions(fixture){
 const {workbook,ports:{binding,clock}}=fixture;
 const workbooks={production:'synthetic-unopened-production',isolated:'synthetic-unopened-isolated',synthetic:binding.workbookId};
 const titles={'예약·등하원관리':'bookings','이용권관리':'passes','_이용권변동이력':'history'};
 const viewerSubject='synthetic-viewer';
 const approval={environment:'synthetic',workbookId:binding.workbookId,viewerSubject,
  expiresAt:clock()+60000,ranges:[...APPROVAL_RANGES],bookingIds:[...binding.bookingIds]};
 const pack=value=>{
  if(value==null||value==='')return {};
  const key=typeof value==='string'?'stringValue':typeof value==='number'?'numberValue':'boolValue';
  return {userEnteredValue:{[key]:value},effectiveValue:{[key]:value}};
 };
 return {
  environment:'synthetic',workbooks,approval,viewerSubject,clock,
  async getDriveFile(){return {data:{id:workbook.workbookId,version:'9007199254740993',
   mimeType:'application/vnd.google-apps.spreadsheet',capabilities:{canEdit:false}}};},
  async getSpreadsheet({ranges,fields}){
   const grid=fields.includes('userEnteredValue');
   const sheets=[];
   for(const [title,key] of Object.entries(titles)){
    const table=workbook[key];
    const rowCount=Math.max(100,[table.headers,...table.rows].length);
    const sheet={properties:{title,sheetType:'GRID',gridProperties:{rowCount,columnCount:26}}};
    if(grid)sheet.data=ranges.filter(range=>range.startsWith("'"+title+"'!")).map(range=>{
     const [,start,end]=/!([A-Z])1:([A-Z])\d+$/.exec(range);
     const startColumn=start.charCodeAt(0)-65,endColumn=end.charCodeAt(0)-65;
     const rowData=[table.headers,...table.rows].map(row=>({values:row.slice(startColumn,endColumn+1).map(pack)}));
     return {startColumn,startRow:0,rowData};
    });
    sheets.push(sheet);
   }
   return {data:{spreadsheetId:workbook.workbookId,properties:{timeZone:'Asia/Seoul'},sheets}};
  }
 };
}

async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--synthetic')throw Error('Use --synthetic');
 const examples=[
  ()=>{},f=>{f.pass[2]='PRODUCT-DAY';},f=>{f.booking[4]='';},
  f=>{f.pass[9]='2026-11-25';},f=>f.markManual(),
  f=>{f.source.document.passDeduction={key:f.ports.binding.scope+':'+f.booking[0],eventId:f.request.command.eventId,status:'PENDING'};}
 ];
 const statuses={},reasons={};
 let sampleProjection;
 for(const prepare of examples){
  const fixture=createSyntheticDryRunFixture();
  prepare(fixture);
  fixture.ports.readLedger=createPassLedgerReader(createSyntheticLedgerOptions(fixture));
  const result=await createPassDeductionDryRun(fixture.ports)(fixture.request);
  statuses[result.status]=(statuses[result.status]||0)+1;
  reasons[result.reason]=(reasons[result.reason]||0)+1;
  if(result.projection)sampleProjection=result.projection;
 }
 process.stdout.write(JSON.stringify({source:'SYNTHETIC',cases:examples.length,statuses,reasons,sampleProjection,writesPerformed:0},null,2)+'\n');
}

if(require.main===module)main().catch(()=>{
 process.stderr.write('Synthetic dry-run failed. Use --synthetic.\n');
 process.exitCode=1;
});
module.exports={createSyntheticDryRunFixture,createSyntheticLedgerOptions};
