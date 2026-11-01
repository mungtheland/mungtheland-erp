/** Isolated restore rehearsal: copy a backup to a separate Drive file and verify it.
 * Never overwrites or changes the production spreadsheet or original backup.
 * Intentionally retains the rehearsal copy for operator inspection.
 */
function mdBackupRestoreRehearsal(){
  const props=PropertiesService.getScriptProperties();
  const backupId=String(props.getProperty('MD_LAST_BACKUP_ID')||'').trim();
  const folderId=String(props.getProperty('MD_BACKUP_FOLDER_ID')||'').trim();
  if(!backupId||!folderId)throw Error('백업 ID 또는 폴더 설정이 없습니다.');
  if(backupId===MD_SPREADSHEET_ID)throw Error('운영 원본은 복원 연습 대상으로 사용할 수 없습니다.');
  const source=DriveApp.getFileById(backupId);
  if(!source.getName().startsWith('멍더랜드ERP_백업_'))throw Error('백업 파일명이 올바르지 않습니다.');
  const parents=source.getParents();
  let validParent=false;
  while(parents.hasNext())if(parents.next().getId()===folderId)validParent=true;
  if(!validParent)throw Error('지정된 백업 폴더의 파일이 아닙니다.');
  const folder=DriveApp.getFolderById(folderId);
  const stamp=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd_HH-mm-ss');
  const rehearsal=source.makeCopy('멍더랜드ERP_복원연습_'+stamp,folder);
  const rehearsalId=rehearsal.getId();
  if(rehearsalId===backupId||rehearsalId===MD_SPREADSHEET_ID)throw Error('복원 연습 사본 ID 충돌');
  const original=SpreadsheetApp.openById(backupId),restored=SpreadsheetApp.openById(rehearsalId);
  const srcSheets=original.getSheets(),dstSheets=restored.getSheets();
  const issues=[],details=[];
  const dstByName={};
  dstSheets.forEach(s=>{dstByName[s.getName()]=s;});
  if(srcSheets.length!==dstSheets.length)issues.push('탭 수 불일치');
  for(const src of srcSheets){
    const name=src.getName(),dst=dstByName[name];
    if(!dst){issues.push('탭 누락: '+name);continue;}
    const rows=src.getLastRow(),cols=src.getLastColumn();
    if(rows!==dst.getLastRow()||cols!==dst.getLastColumn()){issues.push('크기 불일치: '+name);continue;}
    let dataDifferences=0,formulaDifferences=0;
    for(let start=1;start<=rows;start+=100){
      const height=Math.min(100,rows-start+1);
      if(!cols)continue;
      const left=src.getRange(start,1,height,cols),right=dst.getRange(start,1,height,cols);
      const a=left.getValues(),b=right.getValues(),af=left.getFormulas(),bf=right.getFormulas();
      for(let i=0;i<height;i++)for(let j=0;j<cols;j++){
        const x=a[i][j],y=b[i][j];
        const xVal=x instanceof Date?x.getTime():String(x);
        const yVal=y instanceof Date?y.getTime():String(y);
        if(xVal!==yVal)dataDifferences++;
        if(af[i][j]!==bf[i][j])formulaDifferences++;
      }
    }
    details.push({sheet:name,rows,columns:cols,dataDifferences,formulaDifferences});
  }
  const ok=issues.length===0&&details.every(x=>x.dataDifferences===0&&x.formulaDifferences===0);
  const result={ok,mode:'ISOLATED_COPY',backupId,rehearsalId,rehearsalName:rehearsal.getName(),sheetCount:dstSheets.length,issues,details,
    note:'운영 원본과 기존 백업은 수정하지 않았습니다. 연습 사본은 삭제하지 않고 보관합니다. 서식·권한·외부 연결 및 웹앱 전환까지 검증한 것은 아닙니다.'};
  Logger.log(JSON.stringify(result));
  return result;
}
