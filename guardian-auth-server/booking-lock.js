'use strict';
// Process-local booking mutex. All writers in the SAME Node process must use this.
// Not a distributed lock; production needs a transactional storage layer.
const pending=new Map();
async function withBookingLock(bookingId,work){
 const previous=pending.get(bookingId)||Promise.resolve();
 let release;
 const current=new Promise(resolve=>{release=resolve;});
 pending.set(bookingId,current);
 await previous;
 try{return await work();}
 finally{if(pending.get(bookingId)===current)pending.delete(bookingId);release();}
}
module.exports={withBookingLock};
