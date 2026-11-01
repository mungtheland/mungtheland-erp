/** Test project only. DO NOT install this file in production.
 * Standalone helpers required by GuardianRequest modules; no src/Code.js needed.
 */
const MD_SPREADSHEET_ID='1am5gRi3NPV6YdkaGOwE9hActsZLK9D35GXDxT1ms-70';
function mdFindById_(sheet,id){
 const last=sheet.getLastRow();
 if(last<2)return -1;
 const values=sheet.getRange(2,1,last-1,1).getDisplayValues();
 const matches=values.map((row,i)=>({value:String(row[0]),index:i+2})).filter(x=>x.value===String(id));
 if(matches.length>1)throw Error('Duplicate ID: '+id);
 return matches.length?matches[0].index:-1;
}
function mdId_(prefix){return prefix+'-TEST-'+Utilities.getUuid().slice(0,12);}
