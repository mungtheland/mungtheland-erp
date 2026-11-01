const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const props=new Map([['MD_LAST_BACKUP_ID','COPY'],['MD_BACKUP_FOLDER_ID','FOLDER']]);
let reads=0;
const makeSheet=(name,values,formulas)=>({getName:()=>name,getLastRow:()=>values.length,getLastColumn:()=>values[0].length,
 getRange:(r,c,h,w)=>{reads++;return {getValues:()=>values.slice(r-1,r-1+h).map(x=>x.slice(c-1,c-1+w)),getFormulas:()=>formulas.slice(r-1,r-1+h).map(x=>x.slice(c-1,c-1+w))}}});
const source=makeSheet('운영', [['제목','합계'],['기록',10]],[['',''],['','=5+5']]);
const backup=makeSheet('운영', [['제목','합계'],['기록',10]],[['',''],['','=5+5']]);
const context={MD_SPREADSHEET_ID:'SOURCE',MD_BACKUP_FOLDER_PROPERTY:'MD_BACKUP_FOLDER_ID',MD_BACKUP_PREFIX:'멍더랜드ERP_백업_',
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)})},
 DriveApp:{getFileById:()=>({getName:()=> '멍더랜드ERP_백업_2026-11-01_08-19-31',getParents:()=>({hasNext:()=>true,next:()=>({getId:()=> 'FOLDER'})})})},
 SpreadsheetApp:{openById:id=>({getSheets:()=>[id==='SOURCE'?source:backup]})},
 Logger:{log:()=>{}},Date,String,JSON,Math};
vm.createContext(context);vm.runInContext(fs.readFileSync('src/BackupRecoveryAudit.js','utf8'),context);
const result=context.mdBackupRecoveryAudit();
assert.equal(result.mode,'READ_ONLY');assert.equal(result.exactMatchAtAuditTime,true);
assert.ok(reads>0);
backup.getRange=(r,c,h,w)=>({getValues:()=>[['제목','합계'],['기록',10]].slice(r-1,r-1+h).map(x=>x.slice(c-1,c-1+w)),getFormulas:()=>[['',''],['','=9+1']].slice(r-1,r-1+h).map(x=>x.slice(c-1,c-1+w))});
const altered=context.mdBackupRecoveryAudit();
assert.equal(altered.ok,false);assert.equal(altered.details[0].formulaDifferences,1);
props.set('MD_LAST_BACKUP_ID','SOURCE');
assert.throws(()=>context.mdBackupRecoveryAudit(),/동일/);
console.log('PASS: backup recovery read-only exact-match, formula drift, source-ID guard');
