const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const props=new Map([['MD_LAST_BACKUP_ID','BACKUP'],['MD_BACKUP_FOLDER_ID','FOLDER']]);
const values=[['제목','값'],['합계',10]],formulas=[['',''],['','=5+5']];
const sheet=()=>({getName:()=> '회계관리',getLastRow:()=>2,getLastColumn:()=>2,getRange:(r,c,h,w)=>({
 getValues:()=>values.slice(r-1,r-1+h).map(x=>x.slice(c-1,c-1+w)),
 getFormulas:()=>formulas.slice(r-1,r-1+h).map(x=>x.slice(c-1,c-1+w))})});
let copies=0,productionOpened=false;
const context={MD_SPREADSHEET_ID:'PRODUCTION',Date,String,JSON,Math,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)})},
 DriveApp:{getFileById:id=>({getName:()=> '멍더랜드ERP_백업_2026-11-01_08-19-31',
 getParents:()=>{let n=0;return {hasNext:()=>n++===0,next:()=>({getId:()=> 'FOLDER'})}},
 makeCopy:(name,folder)=>{copies++;assert.match(name,/복원연습/);return {getId:()=> 'REHEARSAL',getName:()=>name}}}),
 getFolderById:id=>({getId:()=>id})},
 SpreadsheetApp:{openById:id=>{if(id==='PRODUCTION')productionOpened=true;return {getSheets:()=>[sheet()]}}},
 Utilities:{formatDate:()=> '2026-11-01_11-00-00'},Logger:{log(){}}
};
vm.createContext(context);vm.runInContext(fs.readFileSync('src/BackupRestoreRehearsal.js','utf8'),context);
const result=context.mdBackupRestoreRehearsal();
assert.equal(result.ok,true);assert.equal(result.rehearsalId,'REHEARSAL');
assert.equal(copies,1);assert.equal(productionOpened,false);
props.set('MD_LAST_BACKUP_ID','PRODUCTION');
assert.throws(()=>context.mdBackupRestoreRehearsal(),/운영 원본/);
assert.equal(copies,1);
console.log('PASS: isolated restore rehearsal creates separate copy, compares values/formulas, never opens production');
