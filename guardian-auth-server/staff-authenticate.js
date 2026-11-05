'use strict';
const {createGuardianAuthenticator}=require('./authenticate');
function createStaffAuthenticator({firebaseAuth,accountStore,projectId}){
 const verify=createGuardianAuthenticator({
  firebaseAuth,projectId,
  accountStore:{findByFirebaseUid:async uid=>{
   const staff=await accountStore.findByFirebaseUid(uid);
   return staff&&staff.status==='active'&&staff.staffId
    ?{customerId:staff.staffId,email:staff.email,status:'active'}:null;
  }}
 });
 return async token=>{
  const principal=await verify(token);
  return Object.freeze({role:'staff',status:'active',staffId:principal.customerId});
 };
}
module.exports={createStaffAuthenticator};
