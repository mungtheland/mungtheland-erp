'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createPassLedgerReader,PassLedgerReadError,INTEGRATION_TEST_WORKBOOK_ID,INTEGRATION_TEST_VIEWER}=require('./staff-pass-ledger-read');
const {createPassDeductionDryRun}=require('./staff-pass-dry-run');
const {createSyntheticDryRunFixture,createSyntheticLedgerOptions}=require('./run-staff-pass-dry-run.cjs');

const ranges=["'예약·등하원관리'!A:K","'이용권관리'!A:O","'_이용권변동이력'!A:J"];
function setup(){
 const fixture=createSyntheticDryRunFixture();
 const options=createSyntheticLedgerOptions(fixture);
 const requests=[];
 for(const key of ['getDriveFile','getSpreadsheet']){
  const original=options[key];
  options[key]=(args,transport)=>{
   requests.push({key,args,transport});
   return original(args,transport);
  };
 }
 const target={workbookId:options.approval.workbookId,bookingId:fixture.booking[0]};
 const read=()=>createPassLedgerReader(options)(target);
 const run=()=>{
  fixture.ports.readLedger=createPassLedgerReader(options);
  return createPassDeductionDryRun(fixture.ports)(fixture.request);
 };
 return {fixture,options,requests,target,read,run};
}

test('A - operational, isolated and synthetic registrations cannot alias or be substituted',async()=>{
 const {options,requests,target}=setup();
 assert.throws(()=>createPassLedgerReader({...options,environment:'production'}),{code:'LEDGER_READ_SCOPE_DENIED'});
 assert.throws(()=>createPassLedgerReader({...options,workbooks:{...options.workbooks,isolated:options.workbooks.production}}),{code:'LEDGER_READ_SCOPE_DENIED'});
 const read=createPassLedgerReader(options);
 await assert.rejects(read({...target,workbookId:options.workbooks.isolated}),{code:'LEDGER_READ_SCOPE_DENIED'});
 assert.equal(requests.length,0);
});

test('B - absent approval, wrong viewer and expired or out-of-scope reservation make no requests',async()=>{
 const {options,requests,target}=setup();
 assert.throws(()=>createPassLedgerReader({...options,approval:undefined}),{code:'LEDGER_READ_SCOPE_DENIED'});
 assert.throws(()=>createPassLedgerReader({...options,viewerSubject:'unapproved'}),{code:'LEDGER_READ_SCOPE_DENIED'});
 const read=createPassLedgerReader(options);
 await assert.rejects(read({...target,bookingId:'RSV-OUTSIDE'}),{code:'LEDGER_READ_SCOPE_DENIED'});
 options.clock=()=>options.approval.expiresAt;
 assert.throws(()=>createPassLedgerReader(options),{code:'LEDGER_READ_SCOPE_DENIED'});
 assert.equal(requests.length,0);
});

test('B - Drive must confirm the exact native Sheets file for a non-editor',async()=>{
 for(const change of [
  data=>{data.id='another-workbook';},
  data=>{data.mimeType='application/octet-stream';},
  data=>{data.capabilities.canEdit=true;},
  data=>{delete data.version;}
 ]){
  const {options,read,requests}=setup(),get=options.getDriveFile;
  options.getDriveFile=async(...args)=>{const response=await get(...args);change(response.data);return response;};
  await assert.rejects(read(),{code:'LEDGER_SNAPSHOT_UNVERIFIED'});
  assert.deepEqual(requests.map(call=>call.key),['getDriveFile']);
 }
});

test('C - only the three exact integration schema ranges and minimal fields are requested',async()=>{
 const {options,read,requests,target}=setup();
 const snapshot=await read();
 assert.deepEqual(requests.map(call=>call.key),['getDriveFile','getSpreadsheet','getSpreadsheet','getDriveFile']);
 const [,metadata,grid]=requests;
 assert.deepEqual(metadata.args.ranges,ranges);
 assert.deepEqual(grid.args.ranges,["'예약·등하원관리'!A1:K100","'이용권관리'!A1:O100","'_이용권변동이력'!A1:J100"]);
 assert.equal(grid.args.spreadsheetId,target.workbookId);
 assert.equal(metadata.args.fields.includes('rowData'),false);
 assert.match(grid.args.fields,/rowData\(values\(userEnteredValue,effectiveValue\)\)/);
 assert.ok(requests.every(({transport})=>transport.retry===false));
 assert.equal(snapshot.complete,true);
 assert.equal(snapshot.bookings.rows[0][3],null);
 assert.equal(snapshot.bookings.rows[0][10],null);
 assert.equal(snapshot.passes.rows[0][3],null);
 assert.deepEqual(snapshot.snapshot,{version:'9007199254740993',openedAt:options.clock(),closedAt:options.clock(),timeZone:'Asia/Seoul'});
 assert.equal(metadata.args.ranges.some(range=>/!A1:[A-Z]+$/.test(range)),false);
 assert.equal((grid.args.fields.match(/\(/g)||[]).length,(grid.args.fields.match(/\)/g)||[]).length);
});

test('C - a requested range override or broader or incomplete approval is denied before any GET',async()=>{
 const {options,requests,target}=setup();
 for(const selected of [ranges.slice(1),[...ranges,"'고객·반려견관리'!A1:O"],["'예약·등하원관리'!A1:J",...ranges.slice(1)]]){
  assert.throws(()=>createPassLedgerReader({...options,approval:{...options.approval,ranges:selected}}),{code:'LEDGER_READ_COLUMNS_DENIED'});
 }
 const read=createPassLedgerReader(options);
 await assert.rejects(read({...target,ranges:['A:Z']}),{code:'LEDGER_READ_SCOPE_DENIED'});
 assert.equal(requests.length,0);
});

test('C - unapproved returned tabs, non-grid sheets and wrong time zone prevent any cell GET',async()=>{
 for(const change of [
  data=>{data.sheets[0].properties.title='OTHER_TAB';},
  data=>{data.sheets[0].properties.sheetType='DATA_SOURCE';},
  data=>{data.properties.timeZone='UTC';}
 ]){
  const {options,read,requests}=setup(),get=options.getSpreadsheet;
  options.getSpreadsheet=async(...args)=>{const response=await get(...args);change(response.data);return response;};
  await assert.rejects(read(),{code:'LEDGER_READ_SHAPE_UNVERIFIED'});
  assert.deepEqual(requests.map(call=>call.key),['getDriveFile','getSpreadsheet']);
 }
});

test('C - integration workbook requires Etc/GMT metadata and preserves only approved schema',async()=>{
 const {options,fixture}=setup();
 const integration={...options,environment:'integration-test',viewerSubject:INTEGRATION_TEST_VIEWER,
  workbooks:{...options.workbooks,'integration-test':INTEGRATION_TEST_WORKBOOK_ID},
  approval:{...options.approval,environment:'integration-test',workbookId:INTEGRATION_TEST_WORKBOOK_ID,viewerSubject:INTEGRATION_TEST_VIEWER}};
 const drive=integration.getDriveFile;
 integration.getDriveFile=async(...args)=>{const result=await drive(...args);result.data.id=INTEGRATION_TEST_WORKBOOK_ID;return result;};
 const get=integration.getSpreadsheet;
 integration.getSpreadsheet=async(args,transport)=>{
  const result=await get(args,transport);result.data.spreadsheetId=INTEGRATION_TEST_WORKBOOK_ID;
  result.data.properties.timeZone='Etc/GMT';
  if(result.data.sheets[2].data){
   const serial=(Date.parse('2026-11-26T01:30:00Z')-Date.UTC(1899,11,30))/86400000;
   result.data.sheets[2].data[0].rowData.push({values:[
    {userEnteredValue:{stringValue:'HISTORY-ID'},effectiveValue:{stringValue:'HISTORY-ID'}},{userEnteredValue:{numberValue:serial},effectiveValue:{numberValue:serial}},
    {userEnteredValue:{stringValue:'차감'},effectiveValue:{stringValue:'차감'}},{userEnteredValue:{stringValue:'PASS-ID'},effectiveValue:{stringValue:'PASS-ID'}},
    {userEnteredValue:{stringValue:'RSV-SYNTHETIC-050'},effectiveValue:{stringValue:'RSV-SYNTHETIC-050'}},{userEnteredValue:{numberValue:-1},effectiveValue:{numberValue:-1}},
    {userEnteredValue:{numberValue:8},effectiveValue:{numberValue:8}},{userEnteredValue:{numberValue:7},effectiveValue:{numberValue:7}},
    {userEnteredValue:{stringValue:'AUTO_ATTENDANCE'},effectiveValue:{stringValue:'AUTO_ATTENDANCE'}},{userEnteredValue:{stringValue:'synthetic event'},effectiveValue:{stringValue:'synthetic event'}}
   ]});
  }
  return result;
 };
 const result=await createPassLedgerReader(integration)({workbookId:INTEGRATION_TEST_WORKBOOK_ID,bookingId:fixture.booking[0]});
 assert.equal(result.snapshot.timeZone,'Etc/GMT');
 assert.equal(result.bookings.headers[3],'반려견명');
 assert.equal(result.history.headers[1],'처리시각');
 assert.equal(result.history.rows[0][1],'2026-11-26T01:30:00.000Z');
 const wrongFile={...integration,workbooks:{...integration.workbooks,'integration-test':'wrong-test-id'}};
 assert.throws(()=>createPassLedgerReader(wrongFile),{code:'LEDGER_READ_SCOPE_DENIED'});
 const wrongViewer={...integration,viewerSubject:'another-reader'};
 assert.throws(()=>createPassLedgerReader(wrongViewer),{code:'LEDGER_READ_SCOPE_DENIED'});
});

test('C - server cannot smuggle an unrequested column in a returned GridData segment',async()=>{
 const {options,read}=setup(),get=options.getSpreadsheet;
 options.getSpreadsheet=async(...args)=>{
  const response=await get(...args);
  if(response.data.sheets[0].data)response.data.sheets[0].data[0].rowData[1].values.push(
   {userEnteredValue:{stringValue:'PRIVATE'}},{userEnteredValue:{stringValue:'OUTSIDE'}});
  return response;
 };
 await assert.rejects(read(),{code:'LEDGER_READ_SHAPE_UNVERIFIED'});
});

test('D - each approved product ID has exactly its expected recurring count',async()=>{
 for(const total of [8,12,16,20]){
  const {fixture,run}=setup();
  Object.assign(fixture.pass,{2:'PRODUCT-'+total,5:total,7:total});
  fixture.ports.binding.productCatalog.products.find(product=>product.productId==='PRODUCT-'+total).totalUses=total;
  const result=await run();
  assert.equal(result.status,'ELIGIBLE');
  assert.equal(result.projection.remainingAfter,total-1);
 }
});

test('D - unknown product or mismatched SKU-count mapping is not eligible',async()=>{
 for(const [update,reason] of [
  [f=>{f.pass[2]='UNKNOWN';},'PRODUCT_NOT_IN_CATALOG'],
  [f=>{f.pass[5]=12;f.pass[7]=12;},'PRODUCT_TOTAL_USES_MISMATCH'],
  [f=>{f.ports.binding.productCatalog.products.find(product=>product.productId==='PRODUCT-8').totalUses=12;},'PRODUCT_TOTAL_USES_MISMATCH']
 ]){
  const {fixture,run}=setup();
  update(fixture);
  assert.deepEqual(await run(),{status:'NEEDS_REVIEW',reason,writesPerformed:0});
 }
});

for(const [name,update,status,reason] of [
 ['E - cross-dog booking and pass',f=>{f.pass[1]='DOG-OTHER';},'NEEDS_REVIEW','PASS_DOG_MISMATCH'],
 ['F - remaining and history mismatch',f=>{f.pass[6]=1;f.pass[7]=7;},'NEEDS_REVIEW','PASS_BALANCE_MISMATCH'],
 ['F - arithmetic mismatch',f=>{f.pass[7]=7;},'NEEDS_REVIEW','PASS_BALANCE_MISMATCH'],
 ['F - duplicate linked pass',f=>{f.workbook.passes.rows.push([...f.pass]);},'NEEDS_REVIEW','PASS_DUPLICATE'],
 ['F - duplicate booking with sparse ranges',f=>{f.workbook.bookings.rows.push([],[],[...f.booking]);},'NEEDS_REVIEW','BOOKING_DUPLICATE'],
 ['G - booking not linked',f=>{f.booking[4]='';},'NEEDS_REVIEW','PASS_NOT_LINKED'],
 ['H - manual deduction is complete',f=>f.markManual(),'COMPLETED','ALREADY_MANUAL'],
 ['I - daily pass excluded',f=>{f.pass[2]='PRODUCT-DAY';},'NOT_REQUIRED','DAYCARE_DAILY'],
 ['J - attendance and booking status mismatch',f=>{f.booking[5]='예약취소';},'NEEDS_REVIEW','PASS_BOOKING_ATTENDANCE_MISMATCH']
]){
 test(name,async()=>{
  const {fixture,run}=setup();
  update(fixture);
  assert.deepEqual(await run(),{status,reason,writesPerformed:0});
 });
}

test('E - numeric Sheets dates are interpreted as Seoul calendar days',async()=>{
 const {fixture,run}=setup();
 const serial=iso=>(Date.parse(iso+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
 fixture.booking[1]=serial('2026-11-26');
 fixture.pass[8]=serial('2026-11-26');
 fixture.pass[9]=serial('2026-11-26');
 assert.equal((await run()).status,'ELIGIBLE');
});

test('E - DATE_TIME purchase dates and same-day booking date-times normalize without exposing names',async()=>{
 const {options,fixture,target}=setup();
 const serial=iso=>(Date.parse(iso+'Z')-Date.UTC(1899,11,30))/86400000;
 fixture.booking[6]=serial('2026-11-26T09:30:00');
 fixture.pass[4]=serial('2026-11-20T14:15:00');
 const snapshot=await createPassLedgerReader(options)(target);
 assert.equal(snapshot.bookings.rows[0][6],'09:30:00');
 assert.equal(snapshot.passes.rows[0][4],'2026-11-20');
 assert.equal(snapshot.bookings.rows[0][3],null);
});

test('E - a booking DATE_TIME on a different day is rejected',async()=>{
 const {options,fixture,target}=setup();
 const serial=iso=>(Date.parse(iso+'Z')-Date.UTC(1899,11,30))/86400000;
 fixture.booking[6]=serial('2026-11-27T09:30:00');
 await assert.rejects(createPassLedgerReader(options)(target),{code:'LEDGER_READ_SHAPE_UNVERIFIED'});
});

test('K - a rejected service principal cannot reach the Sheets or Firestore readers',async()=>{
 const {fixture,requests,run}=setup();
 fixture.ports.verifyService=async()=>({sub:'different'});
 fixture.ports.readAttendance=async()=>assert.fail('Unexpected attendance read');
 assert.deepEqual(await run(),{status:'BLOCKED',reason:'SERVICE_AUTH_FAILED',writesPerformed:0});
 assert.equal(requests.length,0);
});

test('L - a timed-out Drive read aborts and a late response cannot start a Sheets read',async()=>{
 const {fixture,options,requests,run}=setup();
 const get=options.getDriveFile;
 let signal,release;
 fixture.ports.timeoutMs=25;
 options.getDriveFile=(args,transport)=>{
  signal=transport.signal;
  return new Promise(resolve=>{release=()=>resolve(get(args,transport));});
 };
 assert.deepEqual(await run(),{status:'BLOCKED',reason:'LEDGER_TIMEOUT',writesPerformed:0});
 assert.equal(signal.aborted,true);
 release();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(requests.map(call=>call.key),['getDriveFile']);
});

test('M - source revision drift is blocked even past numeric safe integer precision',async()=>{
 const {run,options,requests}=setup(),get=options.getDriveFile;
 let n=0;
 options.getDriveFile=async(...args)=>{
  const result=await get(...args);
  if(++n===2)result.data.version='9007199254740994';
  return result;
 };
 assert.deepEqual(await run(),{status:'BLOCKED',reason:'LEDGER_SNAPSHOT_CHANGED',writesPerformed:0});
 assert.equal(requests.length,4);
});

test('M - changed grid dimensions, missing column segment and unsupported computed data are rejected',async()=>{
 for(const [modify,reason] of [
  [s=>{s.properties.gridProperties.rowCount+=1;},'LEDGER_SNAPSHOT_CHANGED'],
  [s=>{s.data.pop();},'LEDGER_READ_SHAPE_UNVERIFIED'],
  [s=>{s.data[0].rowData[1].values[1]={userEnteredValue:{formulaValue:'=TODAY()'},effectiveValue:{numberValue:46000}};},'LEDGER_NON_LITERAL_CELL'],
  [s=>{delete s.data[0].rowData[1].values[1].userEnteredValue;},'LEDGER_NON_LITERAL_CELL']
 ]){
  const {options,run}=setup(),get=options.getSpreadsheet;
  options.getSpreadsheet=async(...args)=>{
   const result=await get(...args);
   if(result.data.sheets[0].data)modify(result.data.sheets[0]);
   return result;
  };
  assert.deepEqual(await run(),{status:'BLOCKED',reason,writesPerformed:0});
 }
});

test('M - a stale capture time blocks the snapshot',async()=>{
 const {options,run}=setup();
 const initial=options.clock();
 let ms=0;
 options.clock=()=>initial+ms;
 const get=options.getSpreadsheet;
 options.getSpreadsheet=async(...args)=>{
  const result=await get(...args);
  if(result.data.sheets[0].data)ms=4001;
  return result;
 };
 assert.deepEqual(await run(),{status:'BLOCKED',reason:'LEDGER_SNAPSHOT_UNVERIFIED',writesPerformed:0});
});

test('M - changed attendance document between reads blocks a verified Sheets capture',async()=>{
 const {fixture,run}=setup();
 let reads=0;
 fixture.ports.readAttendance=async()=>{
  reads++;
  // Even a provider returning the same object cannot hide a changed observed version.
  if(reads===2)fixture.source.version='new-version';
  return fixture.source;
 };
 assert.deepEqual(await run(),{status:'BLOCKED',reason:'ATTENDANCE_SNAPSHOT_CHANGED',writesPerformed:0});
 assert.equal(reads,2);
});

test('N - manual audit personal fields are removed and only fixed result fields are returned',async()=>{
 const {fixture,read,run}=setup();
 fixture.markManual();
 const snapshot=await read();
 assert.equal(snapshot.history.rows[0][8],null);
 assert.equal(snapshot.history.rows[0][9],null);
 assert.doesNotMatch(JSON.stringify(snapshot),/SYNTHETIC_PRIVATE/);
 assert.deepEqual(await run(),{status:'COMPLETED',reason:'ALREADY_MANUAL',writesPerformed:0});
 const hidden=new PassLedgerReadError('RAW_PRIVATE_MESSAGE');
 assert.doesNotMatch(hidden.message,/PRIVATE/);
});

test('O - no writer dependency is accessed and repeat diagnosis leaves both sources intact',async()=>{
 const {fixture,options,requests,run}=setup();
 const original=structuredClone([fixture.workbook,fixture.source]);
 for(const name of ['set','add','update','batchUpdate','write','deduct','restore','transition','post','runTransaction']){
  Object.defineProperty(options,name,{get(){assert.fail('Write port used');}});
 }
 assert.equal((await run()).status,'ELIGIBLE');
 assert.equal((await run()).status,'ELIGIBLE');
 assert.deepEqual([fixture.workbook,fixture.source],original);
 assert.equal(requests.length,8);
 assert.ok(requests.every(call=>['getDriveFile','getSpreadsheet'].includes(call.key)));
 assert.equal(require.cache[require.resolve('../src/PassAdjust.js')],undefined);
});
