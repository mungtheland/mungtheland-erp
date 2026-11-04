'use strict';
/**
 * Server-only enrollment linker. The staff authorization and identity check
 * must be verified by the caller's trusted server, never accepted as a browser
 * role/boolean. Invitation consumption alone is not identity verification.
 *
 * Stores are injected to keep tests isolated from production ERP.
 */
function createGuardianLinker({firebaseAuth,enrollmentStore,accountStore}){
 if(!firebaseAuth||typeof firebaseAuth.getUser!=='function')throw Error('Firebase Admin required');
 for(const [obj,methods] of [[enrollmentStore,['findVerifiedEnrollment','consumeApprovedLink']], [accountStore,['findByFirebaseUid','findByCustomerId','createUniqueLink']]]){
  if(!obj||methods.some(method=>typeof obj[method]!=='function'))throw Error('Trusted store required');
 }
 return async function linkGuardian({customerId,firebaseUid,staffPrincipal}){
  if(typeof customerId!=='string'||!/^CUS-[A-Z0-9-]{1,64}$/.test(customerId)||
     typeof firebaseUid!=='string'||firebaseUid.length<1||firebaseUid.length>128)throw Error('Link denied');
  // Only principals created by the trusted staff authentication middleware are
  // acceptable. This symbol is injected by the server, not serializable from JSON.
  if(!staffPrincipal||staffPrincipal.authenticated!==true||staffPrincipal.role!=='staff'||
     !staffPrincipal.staffId||staffPrincipal.source!=='server-verified-staff')throw Error('Link denied');
  const enrollment=await enrollmentStore.findVerifiedEnrollment(customerId);
  if(!enrollment||enrollment.verified!==true||enrollment.invitationConsumed!==true||
     enrollment.approvedFirebaseUid!==firebaseUid)throw Error('Link denied');
  const user=await firebaseAuth.getUser(firebaseUid);
  if(!user||user.disabled||!user.email||user.emailVerified!==true)throw Error('Link denied');
  if(await accountStore.findByFirebaseUid(firebaseUid)||await accountStore.findByCustomerId(customerId))throw Error('Link denied');
  // createUniqueLink MUST atomically enforce unique firebaseUid and customerId
  // and validate the approved enrollment is not consumed concurrently.
  const link=await accountStore.createUniqueLink({
   firebaseUid,customerId,email:user.email.toLowerCase(),status:'active',
   verifiedBy:staffPrincipal.staffId
  });
  if(!link||link.created!==true)throw Error('Link denied');
  await enrollmentStore.consumeApprovedLink(customerId,firebaseUid);
  return Object.freeze({linked:true,customerId});
 };
}
module.exports={createGuardianLinker};
