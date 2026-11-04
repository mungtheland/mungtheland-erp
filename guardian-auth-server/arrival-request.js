'use strict';
const SHEET_ID='1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY';
const TAB="'보호자등원요청'";
const ID=/^RSV-[A-Z0-9-]{1,64}$/;
function validate(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid request');
 const mealTime=data.mealTime||'';
 if(mealTime&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(mealTime))throw Error('Invalid meal time');
 const food=data.foodProvided,belt=data.mannerBelt;
 if(!['yes','no','unknown'].includes(food)||!['yes','no','unknown'].includes(belt))throw Error('Invalid options');
 const condition=String(data.condition||'').trim(),notes=String(data.notes||'').trim();
 if(condition.length>200||notes.length>500)throw Error('Too long');
 return {mealTime,food,belt,condition,notes};
}
function createArrivalRequestService({sheets,bookingRepository,spreadsheetId=SHEET_ID}){
 if(spreadsheetId!==SHEET_ID)throw Error('Isolated sheet only');
 const range=TAB+'!A1:N200';
 async function rows(){const r=await sheets.spreadsheets.values.get({spreadsheetId,range});return r.data.values||[];}
 async function owned(customerId,bookingId){
  if(!ID.test(bookingId||''))throw Error('Access denied');
  const b=await bookingRepository.findById(bookingId);
  if(!b||b.customerId!==customerId)throw Error('Access denied');
 }
 return {
  async get(customerId,bookingId){
   await owned(customerId,bookingId);
   const found=(await rows()).slice(1).filter(r=>r[1]===bookingId);
   if(found.length>1)throw Error('Conflicting requests');
   if(!found.length)return null;
   const r=found[0];
   if(r[3]!==customerId)throw Error('Access denied');
   return {mealTime:r[4]||'',foodProvided:r[5]||'unknown',mannerBelt:r[6]||'unknown',condition:r[7]||'',notes:r[8]||'',revision:Number(r[9]||0),reviewedRevision:Number(r[11]||0),reviewStatus:Number(r[11]||0)===Number(r[9]||0)?'confirmed':'unconfirmed'};
  },
  async save(customerId,bookingId,data,expectedRevision){
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('Invalid expected revision');
   await owned(customerId,bookingId);
   const v=validate(data);
   const all=await rows(),matches=[];
   for(let i=1;i<all.length;i++)if(all[i][1]===bookingId)matches.push({row:i+1,values:all[i]});
   if(matches.length>1)throw Error('Conflicting requests');
   const existing=matches[0];
   if(existing&&existing.values[3]!==customerId)throw Error('Access denied');
   const currentRevision=Number(existing?.values[9]||0);
   if(currentRevision!==expectedRevision)throw Error('Revision conflict');
   const revision=currentRevision+1;
   const bookingRows=await sheets.spreadsheets.values.get({spreadsheetId,range:"'예약·등하원관리'!A1:K200"});
   const matched=(bookingRows.data.values||[]).slice(1).filter(r=>r[0]===bookingId);
   if(matched.length!==1)throw Error('Access denied');
   const booking=matched[0];
   // Check status server-side, not just in the browser. G/H are actual attendance timestamps; I is attendance state.
   if(booking[6]||booking[7]||booking[8]!=='미등원'||booking[5]!=='예약')throw Error('Request locked after check-in or cancellation');
   const dogId=booking[2];
   const requestId=existing?.values[0]||('REQ-TEST-'+bookingId.slice(4));
   const values=[[requestId,bookingId,dogId,customerId,v.mealTime,v.food,v.belt,v.condition,v.notes,String(revision),new Date().toISOString(),'','','']];
   if(existing){
    // A policy: guardian may edit before check-in; any edit clears staff review (L:N).
    // Revision increments so staff must explicitly review the latest submission.
    await sheets.spreadsheets.values.update({spreadsheetId,range:TAB+'!A'+existing.row+':N'+existing.row,valueInputOption:'RAW',requestBody:{values}});
   }else{
    await sheets.spreadsheets.values.append({spreadsheetId,range:TAB+'!A1:N200',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values}});
   }
   return {saved:true,revision};
  }
 };
}
module.exports={createArrivalRequestService,validate};
