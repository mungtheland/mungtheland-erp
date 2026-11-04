'use strict';
/**
 * Read-only, internal service; NOT an HTTP endpoint.
 * The principal must be returned by authenticateGuardian(), never constructed
 * from a request body or client-supplied customer ID.
 * bookingRepository must be a trusted server-side adapter.
 */
function createGuardianBookingReader({authenticateGuardian,bookingRepository}){
 if(typeof authenticateGuardian!=='function'||!bookingRepository||
    typeof bookingRepository.findById!=='function')throw Error('Trusted dependencies required');
 return async function readGuardianBooking({idToken,bookingId}){
  const principal=await authenticateGuardian(idToken);
  if(!principal||principal.role!=='guardian'||!principal.customerId)throw Error('Access denied');
  if(typeof bookingId!=='string'||!/^RSV-[A-Z0-9-]{1,64}$/.test(bookingId))throw Error('Access denied');
  const booking=await bookingRepository.findById(bookingId);
  if(!booking||booking.customerId!==principal.customerId)throw Error('Access denied');
  // Return an explicit allowlist, never raw ERP row or internal staff notes.
  return Object.freeze({
   bookingId:booking.bookingId,
   dogName:booking.dogName,
   visitDate:booking.visitDate,
   status:booking.status
  });
 };
}
module.exports={createGuardianBookingReader};
