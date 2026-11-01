/** Read-only recovery rehearsal. Never restores, deletes, or edits any spreadsheet. */
function mdBackupRecoveryAudit(){
  const props=PropertiesService.getScriptProperties();
  const backupId=String(props.getProperty('MD_LAST_BACKUP_ID')||'').trim();
  if(!backupId)throw Error('최근 백업 ID가 없습니다. 먼저 백업 상태를 확인하세요.');
  if(backupId===MD_SPREADSHEET_ID)throw Error('백업 ID와 운영 원본 ID가 동일합니다.');
  const folderId=String(props.getProperty(MD_BACKUP_FOLDER_PROPERTY)||'').trim();
  if(!folderId)throw Error('백업 폴더가 설정되지 않았습니다.');
  const file=DriveApp.getFileById(backupId);
  if(!file.getName().startsWith(MD_BACKUP_PREFIX))throw Error('백업 파일명이 예상 형식과 다릅니다.');
  const parents=file.getParents();
  let inFolder=false;
  while(parents.hasNext())if(parents.next().getId()===folderId)inFolder=true;
  if(!inFolder)throw Error('백업 파일이 지정된 백업 폴더에 없습니다.');
  const original=SpreadsheetApp.openById(MD_SPREADSHEET_ID);
  const copy=SpreadsheetApp.openById(backupId);
  const srcSheets=original.getSheets(),dstSheets=copy.getSheets();
  const issues=[],details=[];
  const dstMap={};
  dstSheets.forEach(s=>{dstMap[s.getName()]=s;});
  if(srcSheets.length!==dstSheets.length)issues.push('탭 수 불일치');
  for(const src of srcSheets){
    const name=src.getName(),dst=dstMap[name];
    if(!dst){issues.push('누락된 탭: '+name);continue;}
    const srcRows=src.getLastRow(),dstRows=dst.getLastRow();
    const srcCols=src.getLastColumn(),dstCols=dst.getLastColumn();
    if(srcRows!==dstRows||srcCols!==dstCols)issues.push('행/열 수 차이: '+name+' (백업 시점 이후 운영 데이터 변경일 수 있음)');
    // Hash-free exact comparison in bounded chunks; never return personal values.
    // Current-source comparisons can legitimately differ after a backup.
    const rows=Math.min(srcRows,dstRows),cols=Math.min(srcCols,dstCols);
    let mismatchedCells=0,formulaDifferences=0;
    const chunk=200;
    for(let r=1;r<=rows;r+=chunk){
      const height=Math.min(chunk,rows-r+1);
      if(!cols)continue;
      const a=src.getRange(r,1,height,cols),b=dst.getRange(r,1,height,cols);
      const av=a.getValues(),bv=b.getValues(),af=a.getFormulas(),bf=b.getFormulas();
      for(let i=0;i<height;i++)for(let j=0;j<cols;j++){
        const x=av[i][j],y=bv[i][j];
        const xv=x instanceof Date?x.getTime():String(x);
        const yv=y instanceof Date?y.getTime():String(y);
        if(xv!==yv)mismatchedCells++;
        if(af[i][j]!==bf[i][j])formulaDifferences++;
      }
    }
    details.push({sheet:name,sourceRows:srcRows,backupRows:dstRows,sourceColumns:srcCols,backupColumns:dstCols,mismatchedCells,formulaDifferences});
  }
  const exactMatch=issues.length===0&&details.every(d=>d.mismatchedCells===0&&d.formulaDifferences===0);
  const result={ok:issues.length===0&&details.every(d=>d.formulaDifferences===0),
    mode:'READ_ONLY',backupId,backupName:file.getName(),sourceSheetCount:srcSheets.length,backupSheetCount:dstSheets.length,
    exactMatchAtAuditTime:exactMatch,issues,details,
    note:'백업 이후 운영 원본이 변경되면 데이터 차이가 정상적으로 발생할 수 있습니다. 이 검사는 백업 사본을 실제 복원하지 않으며 복원 성공을 보증하지 않습니다.'};
  Logger.log(JSON.stringify(result));
  return result;
}
