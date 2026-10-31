const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('src/Backup.js','utf8');
const props=new Map(),triggers=[],copies=[];
const sourceSheets=[['고객·반려견관리',1,16],['예약·등하원관리',1,11]];
const sheets=()=>sourceSheets.map(([name,rows,cols])=>({getName:()=>name,getLastRow:()=>rows,getLastColumn:()=>cols}));
const context={
  MD_SPREADSHEET_ID:'SOURCE',
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
  LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  DriveApp:{getFileById:id=>({getId:()=>id,makeCopy:(name,folder)=>{const file={getId:()=> 'COPY',getName:()=>name};copies.push(file);return file;}}),getFolderById:id=>({getName:()=>id})},
  SpreadsheetApp:{openById:id=>({getSheets:sheets})},
  Utilities:{formatDate:()=> '2026-11-01_21-00-00'},
  ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:t=>triggers.splice(triggers.indexOf(t),1),newTrigger:()=>({timeBased(){return this},atHour(){return this},everyDays(){return this},inTimezone(){return this},create(){triggers.push({getHandlerFunction:()=> 'mdBackupSpreadsheet'})}})},
  Logger:{log:()=>{}},Date
};
vm.createContext(context);vm.runInContext(code,context);
assert.throws(()=>context.mdBackupSpreadsheet(),/백업 폴더 미설정/);
assert.equal(copies.length,0);
props.set('MD_BACKUP_FOLDER_ID','FOLDER');
assert.equal(context.mdBackupSpreadsheet().backupId,'COPY');
assert.equal(copies.length,1);
context.mdInstallDailyBackup();context.mdInstallDailyBackup();
assert.equal(context.mdBackupStatus().triggerCount,1);
assert.equal(context.mdBackupStatus().folderConfigured,true);
console.log('PASS: backup configuration, copy and trigger idempotence (mock only)');
