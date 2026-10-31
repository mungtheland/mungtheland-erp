/** Read-only retention preview. Does not trash, move, or edit any Drive file. */
function mdBackupRetentionPreview(){
  const props=PropertiesService.getScriptProperties();
  const folderId=String(props.getProperty('MD_BACKUP_FOLDER_ID')||'').trim();
  if(!folderId)throw Error('MD_BACKUP_FOLDER_ID is not configured');
  const folder=DriveApp.getFolderById(folderId);
  const iterator=folder.getFiles();
  const files=[];
  const prefix='멍더랜드ERP_백업_';
  const pattern=/^멍더랜드ERP_백업_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/;
  while(iterator.hasNext()){
    const file=iterator.next();
    const name=file.getName();
    const match=pattern.exec(name);
    if(!match)continue;
    const iso=match[1]+'-'+match[2]+'-'+match[3]+'T'+match[4]+':'+match[5]+':'+match[6]+'+09:00';
    const ms=Date.parse(iso);
    if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==new Date(ms).toISOString().slice(0,10))continue;
    files.push({id:file.getId(),name,date:iso,ms});
  }
  const now=Date.now();
  const cutoff=now-30*86400000;
  files.sort((a,b)=>b.ms-a.ms||a.id.localeCompare(b.id));
  const keep=new Set();
  // Always retain the latest two copies as a safety floor.
  files.slice(0,2).forEach(f=>keep.add(f.id));
  files.filter(f=>f.ms>=cutoff).forEach(f=>keep.add(f.id));
  // Retain the latest available backup for each of the last 12 calendar months.
  const months=[];
  const kst=new Date(now+9*3600000);
  for(let i=0;i<12;i++){
    const year=kst.getUTCFullYear(),month=kst.getUTCMonth();
    const date=new Date(Date.UTC(year,month-i,1));
    months.push(date.toISOString().slice(0,7));
  }
  months.forEach(month=>{
    const candidates=files.filter(f=>f.name.slice(prefix.length,prefix.length+7)===month);
    if(candidates.length)keep.add(candidates[0].id);
  });
  const retained=files.filter(f=>keep.has(f.id));
  const candidates=files.filter(f=>!keep.has(f.id));
  const result={mode:'DRY_RUN_ONLY',scanned:files.length,retained:retained.length,candidateCount:candidates.length,
    candidates:candidates.map(f=>({id:f.id,name:f.name})),note:'No files were deleted or moved.'};
  Logger.log(JSON.stringify(result));
  return result;
}
