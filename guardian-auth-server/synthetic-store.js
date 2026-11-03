'use strict';
/**
 * Synthetic-only transactional store. No persistence, production customer
 * records, or Firebase credentials. A single event-loop process can exercise
 * the linking contract; production must use a durable transactional database.
 */
function createSyntheticGuardianStore(){
 const enrollments=new Map([['CUS-TEST-001',{verified:true,invitationConsumed:true,approvedFirebaseUid:'uid-test-001',version:1,linked:false}]]);
 const byUid=new Map(),byCustomer=new Map();
 return {
  async getApprovedEnrollment(customerId){
   const e=enrollments.get(customerId);return e?{...e}:null;
  },
  async commitApprovedLink({customerId,firebaseUid,email,staffId,approvalVersion}){
   const e=enrollments.get(customerId);
   if(!e||e.version!==approvalVersion||e.linked||!e.verified||!e.invitationConsumed||
      e.approvedFirebaseUid!==firebaseUid||byUid.has(firebaseUid)||byCustomer.has(customerId))return {created:false};
   if(typeof email!=='string'||!email.includes('@')||!staffId)return {created:false};
   e.linked=true;e.version++;
   const account=Object.freeze({customerId,firebaseUid,email,status:'active',verifiedBy:staffId});
   byUid.set(firebaseUid,account);byCustomer.set(customerId,account);
   return {created:true};
  },
  async findByFirebaseUid(uid){return byUid.get(uid)||null;},
  async findByCustomerId(id){return byCustomer.get(id)||null;}
 };
}
module.exports={createSyntheticGuardianStore};
