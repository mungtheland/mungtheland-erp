'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {runAudit,formatReport}=require('./run-attendance-audit');
const {HEADER}=require('./isolated-attendance-store');
test('CLI audits isolated sheet data with read calls only',async()=>{
 const calls=[];
 const data={
  "'예약·등하원관리'!A1:Z1000":[['예약번호'],['RSV-TEST-001','2026-11-05','DOG-TEST-001','','','예약']],
  "'고객·반려견관리'!A1:Z1000":[['반려견번호'],['DOG-TEST-001','CUS-TEST-001','','테스트멍이']],
  "'직원등하원이력_TEST'!A1:E10000":[HEADER,['EVT-00000000-0000-4000-8000-000000000000','RSV-TEST-001','check-in','STAFF-TEST-001','2026-11-05T01:00:00Z']]
 };
 const sheets={spreadsheets:{values:{get:async args=>{calls.push(args);return {data:{values:data[args.range]}};},append:async()=>{throw Error('No writes permitted');}}}};
 const result=await runAudit(sheets);
 assert.equal(result.scannedBookings,1);assert.equal(result.scannedEvents,1);
 assert.equal(result.issues[0].code,'STATUS_REVIEW');assert.equal(result.readOnly,true);
 assert.equal(calls.length,3);assert.ok(calls.every(c=>c.spreadsheetId==='1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY'));
 assert.match(formatReport(result),/검토 필요 1건/);
});
test('CLI fails closed on missing isolated event header',async()=>{
 const sheets={spreadsheets:{values:{get:async args=>({data:{values:args.range.includes('직원등하원이력')?[]:[['header']]}}),append:async()=>{throw Error('No writes permitted');}}}};
 await assert.rejects(()=>runAudit(sheets),/header mismatch/);
});
