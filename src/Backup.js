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
    Logger.log(JSON.stringify(result));
    return result;
  }catch(e){
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
