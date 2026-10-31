const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const files=[];
const make=(name,id)=>files.push({getName:()=>name,getId:()=>id});
make('unrelated file','other');
make('멍더랜드ERP_백업_2026-11-01_08-19-31','recent');
make('멍더랜드ERP_백업_2026-10-01_08-19-31','oct');
make('멍더랜드ERP_백업_2026-09-01_08-19-31','sep');
make('멍더랜드ERP_백업_2026-08-01_08-19-31','aug');
make('멍더랜드ERP_백업_2026-08-02_08-19-31','aug-latest');
make('멍더랜드ERP_백업_2024-01-01_08-19-31','old');
const context={
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'FOLDER'})},
 DriveApp:{getFolderById:()=>({getFiles:()=>{let i=0;return {hasNext:()=>i<files.length,next:()=>files[i++]}}})},
 Utilities:{formatDate:(d,tz,fmt)=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d);const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return v.year+'-'+v.month+'-'+v.day+'_'+v.hour+'-'+v.minute+'-'+v.second}},
 Logger:{log:()=>{}},Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-11-01T12:00:00Z']))}static now(){return Date.parse('2026-11-01T12:00:00Z')}static parse(x){return Date.parse(x)}}
};
vm.createContext(context);vm.runInContext(fs.readFileSync('src/BackupRetention.js','utf8'),context);
const result=context.mdBackupRetentionPreview();
assert.equal(result.mode,'DRY_RUN_ONLY');
assert.equal(result.scanned,6);
assert.equal(result.candidateCount,2);
assert.deepEqual(Array.from(result.candidates.map(x=>x.id)).sort(),['aug','old']);
assert.equal(files.length,7);
console.log('PASS: read-only retention preview, monthly fallback and no deletion');
