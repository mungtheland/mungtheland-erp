const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const props=new Map([['MD_BACKUP_ALERT_EMAIL','operator@example.invalid'],['MD_BACKUP_FOLDER_ID','FOLDER'],['MD_LAST_BACKUP_ID','BACKUP'],['MD_LAST_BACKUP_AT','2026-11-01T00:00:00.000Z']]);
const mails=[],triggers=['mdBackupSpreadsheet','mdCheckDailyBackup'];
const context={Date,JSON,String,Logger:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)})},
 MailApp:{sendEmail:(...args)=>mails.push(args)},Utilities:{formatDate:(date,tz,fmt)=>fmt==='yyyy-MM-dd'?'2026-11-01':'2026-11-01 12:00:00'},
 ScriptApp:{getProjectTriggers:()=>triggers.map(name=>({getHandlerFunction:()=>name}))}};
vm.createContext(context);vm.runInContext(fs.readFileSync('src/BackupMonitoringDiagnostics.js','utf8'),context);
const before=Array.from(props.entries());
const status=context.mdBackupMonitoringStatus();
assert.equal(status.backupTriggerCount,1);assert.equal(status.monitoringTriggerCount,1);
assert.equal(status.backupCompletedToday,true);
assert.equal(mails.length,0);
const sent=context.mdSendBackupAlertTest();
assert.equal(sent.testOnly,true);assert.equal(mails.length,1);
assert.match(mails[0][1],/테스트/);assert.match(mails[0][2],/실제 백업 실패가 아닙니다/);
assert.deepEqual(Array.from(props.entries()),before,'diagnostics must not alter backup state');
props.delete('MD_BACKUP_ALERT_EMAIL');
assert.throws(()=>context.mdSendBackupAlertTest(),/설정/);
assert.equal(mails.length,1);
console.log('PASS: monitoring diagnostics and safe test email, no backup-state writes');
