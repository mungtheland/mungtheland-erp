'use strict';

const tables=[
 {key:'bookings',title:'예약·등하원관리',width:10,columns:[[0,2],[4,9]],dates:[1]},
 {key:'passes',title:'이용권관리',width:15,columns:[[0,2],[5,9],[13,14]],dates:[8,9]},
 {key:'history',title:'_이용권변동이력',width:10,columns:[[0,0],[2,9]],dates:[]}
];
const column=index=>String.fromCharCode(65+index);
const a1=(title,start,end,lastRow='')=>`'${title}'!${column(start)}1:${column(end)}${lastRow}`;
const APPROVAL_RANGES=Object.freeze(tables.flatMap(({title,columns})=>columns.map(([start,end])=>a1(title,start,end))));
const SHEETS_META='spreadsheetId,properties(timeZone),sheets(properties(title,sheetType,gridProperties(rowCount,columnCount)))';
const SHEETS_GRID='spreadsheetId,properties(timeZone),sheets(properties(title,sheetType,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue)))';
const DRIVE_META='id,version,mimeType,capabilities(canEdit)';
const NATIVE_SHEET='application/vnd.google-apps.spreadsheet';
const SERIAL_EPOCH=Date.UTC(1899,11,30);
const readErrors=new Set(['LEDGER_READ_SCOPE_DENIED','LEDGER_READ_COLUMNS_DENIED','LEDGER_READ_SHAPE_UNVERIFIED',
 'LEDGER_NON_LITERAL_CELL','LEDGER_SNAPSHOT_CHANGED','LEDGER_SNAPSHOT_UNVERIFIED']);

class PassLedgerReadError extends Error {
 constructor(code){super(readErrors.has(code)?code:'LEDGER_READ_FAILED');this.code=this.message;}
}
const deny=code=>{throw new PassLedgerReadError(code);};

function readLayout(data,workbookId){
 if(data?.spreadsheetId!==workbookId||data.properties?.timeZone!=='Asia/Seoul'||!Array.isArray(data.sheets)||data.sheets.length!==tables.length)
  deny('LEDGER_READ_SHAPE_UNVERIFIED');
 const result=new Map();
 for(const sheet of data.sheets){
  const {title,sheetType,gridProperties}=sheet?.properties||{};
  const spec=tables.find(table=>table.title===title);
  if(!spec||result.has(title)||sheetType!=='GRID'||!Number.isSafeInteger(gridProperties?.rowCount)||
    gridProperties.rowCount<1||!Number.isSafeInteger(gridProperties.columnCount)||gridProperties.columnCount<spec.width)
   deny('LEDGER_READ_SHAPE_UNVERIFIED');
  result.set(title,{rows:gridProperties.rowCount,columns:gridProperties.columnCount,sheet});
 }
 return result;
}

function literalValue(cell){
 if(cell==null)return null;
 if(typeof cell!=='object'||Array.isArray(cell))deny('LEDGER_READ_SHAPE_UNVERIFIED');
 const decode=value=>{
  if(value==null||Object.keys(value).length===0)return null;
  const [key,...rest]=Object.keys(value);
  if(rest.length||!['stringValue','numberValue','boolValue'].includes(key))deny('LEDGER_NON_LITERAL_CELL');
  const raw=value[key];
  const valid=key==='stringValue'?typeof raw==='string':key==='numberValue'?Number.isFinite(raw):typeof raw==='boolean';
  if(!valid)deny('LEDGER_READ_SHAPE_UNVERIFIED');
  return raw===''?null:raw;
 };
 const entered=decode(cell.userEnteredValue),effective=decode(cell.effectiveValue);
 if(entered!==effective)deny('LEDGER_NON_LITERAL_CELL');
 return entered;
}

function projectTable(spec,layout){
 const {sheet,rows:rowCount}=layout;
 if(!Array.isArray(sheet.data)||sheet.data.length!==spec.columns.length)deny('LEDGER_READ_SHAPE_UNVERIFIED');
 const rows=[];
 const seen=new Set();
 for(const grid of sheet.data){
  const start=grid?.startColumn??0;
  const cols=spec.columns.find(group=>group[0]===start);
  if(!grid||!cols||seen.has(start)||(grid.startRow??0)!==0||!Array.isArray(grid.rowData)||grid.rowData.length<1||
    grid.rowData.length>rowCount)deny('LEDGER_READ_SHAPE_UNVERIFIED');
  seen.add(start);
  for(const [i,raw] of grid.rowData.entries()){
   const cells=raw?.values??[];
   if(!Array.isArray(cells)||cells.length>cols[1]-start+1)deny('LEDGER_READ_SHAPE_UNVERIFIED');
   const row=(rows[i]??=Array(spec.width).fill(null));
   cells.forEach((cell,j)=>{row[start+j]=literalValue(cell);});
  }
 }
 const [headers,...data]=rows;
 for(const row of data){
  for(const i of spec.dates){
   const value=row[i];
   if(typeof value!=='number')continue;
   const day=new Date(SERIAL_EPOCH+value*86400000);
   if(!Number.isSafeInteger(value)||value<1||!Number.isFinite(day.getTime())||day.getUTCFullYear()>9999)
    deny('LEDGER_READ_SHAPE_UNVERIFIED');
   row[i]=day.toISOString().slice(0,10);
  }
  if(spec.key==='history'&&row[8]!=='AUTO_ATTENDANCE'){
   row[8]=null;
   row[9]=null;
  }
 }
 return {headers,rows:data.filter(row=>row.some(value=>value!==null))};
}

// The caller supplies owner approval and GETs bound to the independently
// verified viewer. This factory does not obtain or upgrade any credentials.
function createPassLedgerReader({environment,workbooks,approval,viewerSubject,getSpreadsheet,getDriveFile,clock=Date.now,maxSnapshotMs=4000}){
 const environments=['production','isolated','synthetic'];
 const ids=environments.map(key=>workbooks?.[key]);
 const workbookId=ids[environments.indexOf(environment)];
 if(!workbookId||ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length||
    approval?.environment!==environment||approval.workbookId!==workbookId||typeof viewerSubject!=='string'||
    !viewerSubject.trim()||approval.viewerSubject!==viewerSubject||
    !Number.isSafeInteger(approval.expiresAt)||approval.expiresAt<=clock()||
    !Array.isArray(approval.bookingIds)||!approval.bookingIds.length||!approval.bookingIds.every(id=>typeof id==='string'&&/^RSV-[A-Z0-9-]{1,64}$/.test(id))||
    ![getSpreadsheet,getDriveFile].every(fn=>typeof fn==='function')||
    !Number.isSafeInteger(maxSnapshotMs)||maxSnapshotMs<1)
  deny('LEDGER_READ_SCOPE_DENIED');

 if(!Array.isArray(approval.ranges)||approval.ranges.length!==APPROVAL_RANGES.length||
   !APPROVAL_RANGES.every(range=>approval.ranges.includes(range)))
  deny('LEDGER_READ_COLUMNS_DENIED');
 const bookingIds=new Set(approval.bookingIds);
 const expiresAt=approval.expiresAt;

 return async function readLedger(request){
  const {workbookId:requested,bookingId,signal}=request||{};
  if(requested!==workbookId||!bookingIds.has(bookingId)||Object.keys(request).some(key=>!['workbookId','bookingId','signal'].includes(key))||
    clock()>=expiresAt)
   deny('LEDGER_READ_SCOPE_DENIED');

  const openedAt=clock();
  const options={signal,retry:false};
  const checkpoint=()=>{
   signal?.throwIfAborted();
   const at=clock();
   if(at<openedAt||at-openedAt>maxSnapshotMs||at>=expiresAt)deny('LEDGER_SNAPSHOT_UNVERIFIED');
   return at;
  };
  const verifyVersion=async()=>{
   checkpoint();
   const {data}=await getDriveFile({fileId:workbookId,fields:DRIVE_META,supportsAllDrives:true},options);
   if(data?.id!==workbookId||data.mimeType!==NATIVE_SHEET||data.capabilities?.canEdit!==false||
     typeof data.version!=='string'||!/^[1-9]\d{0,18}$/.test(data.version))
    deny('LEDGER_SNAPSHOT_UNVERIFIED');
   return data.version;
  };

  const version=await verifyVersion();
  checkpoint();
  const meta=await getSpreadsheet({spreadsheetId:workbookId,ranges:[...APPROVAL_RANGES],fields:SHEETS_META},options);
  const layout=readLayout(meta?.data,workbookId);
  const ranges=tables.flatMap(({title,columns})=>columns.map(([start,end])=>a1(title,start,end,layout.get(title).rows)));
  checkpoint();
  const captured=await getSpreadsheet({spreadsheetId:workbookId,ranges,fields:SHEETS_GRID},options);
  const readback=readLayout(captured?.data,workbookId);
  for(const [title,shape] of layout){
   const got=readback.get(title);
   if(got.rows!==shape.rows||got.columns!==shape.columns)deny('LEDGER_SNAPSHOT_CHANGED');
  }
  if(await verifyVersion()!==version)deny('LEDGER_SNAPSHOT_CHANGED');
  const closedAt=checkpoint();

  return {workbookId,complete:true,snapshot:{version,openedAt,closedAt},
   ...Object.fromEntries(tables.map(spec=>[spec.key,projectTable(spec,readback.get(spec.title))]))};
 };
}

module.exports={createPassLedgerReader,PassLedgerReadError,APPROVAL_RANGES};
