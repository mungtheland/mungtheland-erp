/** 멍더랜드 ERP: Google Drive 전체 파일 백업. 원본 시트는 변경하지 않는다. */
const MD_BACKUP_FOLDER_PROPERTY='MD_BACKUP_FOLDER_ID';
const MD_BACKUP_PREFIX='멍더랜드ERP_백업_';
function mdBackupSpreadsheet(){
  const props=PropertiesService.getScriptProperties();
  const folderId=String(props.getProperty(MD_BACKUP_FOLDER_PROPERTY)||'').trim();
  if(!folderId)throw Error('백업 폴더 미설정: 스크립트 속성 MD_BACKUP_FOLDER_ID를 설정하세요.');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const source=DriveApp.getFileById(MD_SPREADSHEET_ID);
    const folder=DriveApp.getFolderById(folderId);
    const stamp=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd_HH-mm-ss');
    const copy=source.makeCopy(MD_BACKUP_PREFIX+stamp,folder);
    if(copy.getId()===source.getId())throw Error('백업 파일 ID가 원본과 같습니다.');
    const backupBook=SpreadsheetApp.openById(copy.getId());
    const sourceBook=SpreadsheetApp.openById(MD_SPREADSHEET_ID);
    const sourceSheets=sourceBook.getSheets();
    const backupSheets=backupBook.getSheets();
    if(sourceSheets.length!==backupSheets.length)throw Error('백업 탭 수가 원본과 다릅니다. 백업을 확인하세요: '+copy.getId());
    for(let i=0;i<sourceSheets.length;i++){
      if(sourceSheets[i].getName()!==backupSheets[i].getName()||
        sourceSheets[i].getLastRow()!==backupSheets[i].getLastRow()||
        sourceSheets[i].getLastColumn()!==backupSheets[i].getLastColumn())
        throw Error('백업 탭 구조가 원본과 다릅니다: '+sourceSheets[i].getName()+' / '+copy.getId());
    }
    const result={ok:true,backupId:copy.getId(),backupName:copy.getName(),sheetCount:backupSheets.length,createdAt:stamp};
    props.setProperty('MD_LAST_BACKUP_ID',copy.getId());
    props.setProperty('MD_LAST_BACKUP_AT',new Date().toISOString());
    props.deleteProperty('MD_LAST_BACKUP_ERROR');
    Logger.log(JSON.stringify(result));
    return result;
  }catch(e){
    mdBackupFailure_(e);
    Logger.log('ERP BACKUP FAILED: '+e.stack);
    throw e;
  }finally{lock.releaseLock();}
}
/** 설치 후 매일 21시(한국 시간 기준 스크립트 타임존)에 백업한다. 기존 동일 핸들러 트리거만 교체한다. */
function mdInstallDailyBackup(){
  const folderId=String(PropertiesService.getScriptProperties().getProperty(MD_BACKUP_FOLDER_PROPERTY)||'').trim();
  if(!folderId)throw Error('먼저 스크립트 속성 MD_BACKUP_FOLDER_ID를 설정하세요.');
  DriveApp.getFolderById(folderId).getName();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='mdBackupSpreadsheet').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('mdBackupSpreadsheet').timeBased().atHour(21).everyDays(1).inTimezone('Asia/Seoul').create();
  return {installed:true,hour:21,timezone:'Asia/Seoul'};
}
/** 현재 설정·트리거만 확인한다. 백업 파일 생성 없음. */
function mdBackupStatus(){
  const p=PropertiesService.getScriptProperties();
  return {folderConfigured:!!p.getProperty(MD_BACKUP_FOLDER_PROPERTY),lastBackupAt:p.getProperty('MD_LAST_BACKUP_AT')||'',lastBackupId:p.getProperty('MD_LAST_BACKUP_ID')||'',triggerCount:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='mdBackupSpreadsheet').length};
}

/** 실패 정보 저장 및 설정된 운영자에게 이메일 알림. 알림 실패가 원래 오류를 가리지 않도록 한다. */
function mdBackupFailure_(error){
  try{
    const p=PropertiesService.getScriptProperties();
    const at=new Date().toISOString();
    const message=String(error&&error.message||error);
    p.setProperty('MD_LAST_BACKUP_ERROR',at+' '+message.slice(0,500));
    const recipient=String(p.getProperty('MD_BACKUP_ALERT_EMAIL')||'').trim();
    if(!recipient){Logger.log('BACKUP ALERT EMAIL NOT CONFIGURED');return;}
    MailApp.sendEmail(recipient,'[멍더랜드 ERP] 자동 백업 실패',
      '백업 실패 시각: '+at+'\n오류: '+message+'\nApps Script 실행 기록을 확인하세요.');
  }catch(alertError){Logger.log('BACKUP ALERT FAILED: '+alertError);}
}
/** 매일 23시 실행: 오늘 성공한 백업이 없으면 관리자에게 알린다. */
function mdCheckDailyBackup(){
  const p=PropertiesService.getScriptProperties();
  const today=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
  const last=p.getProperty('MD_LAST_BACKUP_AT')||'';
  const lastDay=last?Utilities.formatDate(new Date(last),'Asia/Seoul','yyyy-MM-dd'):'';
  if(lastDay===today)return {ok:true,date:today};
  const alertKey='MD_LAST_MISSING_BACKUP_ALERT_DAY';
  if(p.getProperty(alertKey)!==today){
    mdBackupFailure_(Error('오늘('+today+') 성공한 ERP 백업 기록이 없습니다.'));
    p.setProperty(alertKey,today);
  }
  return {ok:false,date:today,lastBackupAt:last};
}
/** 백업 및 누락 감지 트리거 설치. 설치 전에 알림 이메일 설정을 요구한다. */
function mdInstallBackupMonitoring(){
  const p=PropertiesService.getScriptProperties();
  const email=String(p.getProperty('MD_BACKUP_ALERT_EMAIL')||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('스크립트 속성 MD_BACKUP_ALERT_EMAIL에 알림 받을 이메일을 설정하세요.');
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='mdCheckDailyBackup').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('mdCheckDailyBackup').timeBased().atHour(23).everyDays(1).inTimezone('Asia/Seoul').create();
  return {installed:true,hour:23,timezone:'Asia/Seoul'};
}
