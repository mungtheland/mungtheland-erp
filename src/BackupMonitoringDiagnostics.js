/** Operator-invoked safe email delivery test. Does not change backup status or send a failure alert. */
function mdSendBackupAlertTest(){
  const p=PropertiesService.getScriptProperties();
  const email=String(p.getProperty('MD_BACKUP_ALERT_EMAIL')||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('MD_BACKUP_ALERT_EMAIL 설정을 확인하세요.');
  const at=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd HH:mm:ss');
  MailApp.sendEmail(email,'[멍더랜드 ERP] 백업 알림 테스트',
    '이 메일은 알림 전송 경로를 점검하기 위한 테스트입니다. 실제 백업 실패가 아닙니다.\n테스트 시각: '+at+' (KST)\n메일함에서 수신 여부를 확인하세요.');
  const result={ok:true,testOnly:true,recipient:email,sentAt:at,backupStatusUnchanged:true,note:'메일 API 호출 성공. 실제 수신 여부는 수신함에서 확인해야 합니다.'};
  Logger.log(JSON.stringify(result));
  return result;
}
/** Read-only status of backup and monitoring triggers, plus last backup date. */
function mdBackupMonitoringStatus(){
  const p=PropertiesService.getScriptProperties();
  const triggers=ScriptApp.getProjectTriggers();
  const count=name=>triggers.filter(t=>t.getHandlerFunction()===name).length;
  const last=p.getProperty('MD_LAST_BACKUP_AT')||'';
  const today=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
  const lastDay=last?Utilities.formatDate(new Date(last),'Asia/Seoul','yyyy-MM-dd'):'';
  const result={mode:'READ_ONLY',date:today,backupTriggerCount:count('mdBackupSpreadsheet'),
    monitoringTriggerCount:count('mdCheckDailyBackup'),alertEmailConfigured:!!String(p.getProperty('MD_BACKUP_ALERT_EMAIL')||'').trim(),
    backupFolderConfigured:!!String(p.getProperty('MD_BACKUP_FOLDER_ID')||'').trim(),
    lastBackupAt:last,lastBackupId:p.getProperty('MD_LAST_BACKUP_ID')||'',backupCompletedToday:lastDay===today,
    lastError:p.getProperty('MD_LAST_BACKUP_ERROR')||'',
    note:'트리거 존재는 정기 실행 성공을 의미하지 않습니다. Google Apps Script 실행 기록과 Drive 백업 파일을 확인하세요.'};
  Logger.log(JSON.stringify(result));
  return result;
}
