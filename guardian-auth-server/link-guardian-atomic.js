'use strict';
/**
 * Preferred v2 linking contract. The store's commitApprovedLink must perform
 * an atomic compare-and-set of the enrollment approval, invitation consumption,
 * firebaseUid uniqueness, and customerId uniqueness in ONE transaction.
 * Do not expose as an HTTP endpoint before verified staff authentication.
 */
function createAtomicGuardianLinker({firebaseAuth,store,verifyStaff}){
 if(!firebaseAuth||typeof firebaseAuth.getUser!=='function'||
    !store||typeof store.getApprovedEnrollment!=='function'||typeof store.commitApprovedLink!=='function'||
    typeof verifyStaff!=='function')throw Error('Trusted dependencies required');
 return async function link({staffCredential,customerId,firebaseUid}){
  if(typeof customerId!=='string'||!/^CUS-[A-Z0-9-]{1,64}$/.test(customerId)||
     typeof firebaseUid!=='string'||firebaseUid.length<1||firebaseUid.length>128)throw Error('Link denied');
  let staff;
  try{staff=await verifyStaff(staffCredential);}catch(_){throw Error('Link denied');}
  if(!staff||staff.role!=='staff'||!staff.staffId)throw Error('Link denied');
  const approved=await store.getApprovedEnrollment(customerId);
  if(!approved||approved.verified!==true||approved.invitationConsumed!==true||
     approved.approvedFirebaseUid!==firebaseUid||approved.linked===true)throw Error('Link denied');
  let user;
  try{user=await firebaseAuth.getUser(firebaseUid);}catch(_){throw Error('Link denied');}
  if(!user||user.disabled||user.emailVerified!==true||!user.email)throw Error('Link denied');
  const result=await store.commitApprovedLink({
   customerId,firebaseUid,email:user.email.toLowerCase(),staffId:staff.staffId,
   approvalVersion:approved.version
  });
  if(!result||result.created!==true)throw Error('Link denied');
  return Object.freeze({linked:true,customerId});
 };
}
module.exports={createAtomicGuardianLinker};
