'use strict';
/**
 * Server-side Firebase Authentication adapter (not an HTTP endpoint).
 * Requires firebase-admin on a trusted Node.js server. Never ship this file
 * or Admin SDK credentials to browser/Apps Script client code.
 *
 * accountStore.findByFirebaseUid(uid) must return a trusted, server-maintained
 * mapping: {customerId, status:'active', email}. It must NOT use client input.
 */
function createGuardianAuthenticator({firebaseAuth,accountStore,projectId}){
 if(!firebaseAuth||typeof firebaseAuth.verifyIdToken!=='function')throw Error('Firebase verifier required');
 if(!accountStore||typeof accountStore.findByFirebaseUid!=='function')throw Error('Account mapping store required');
 if(typeof projectId!=='string'||!projectId.trim())throw Error('Firebase project ID required');
 return async function authenticateGuardian(idToken){
  if(typeof idToken!=='string'||idToken.length<100||idToken.length>8192)throw Error('Authentication failed');
  let claims;
  try{claims=await firebaseAuth.verifyIdToken(idToken,true);}catch(_){throw Error('Authentication failed');}
  if(!claims||claims.aud!==projectId||claims.iss!==`https://securetoken.google.com/${projectId}`||
     !claims.sub||claims.sub!==claims.uid||claims.email_verified!==true||
     !claims.email||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now()||
     claims.firebase?.sign_in_provider==='anonymous')throw Error('Authentication failed');
  const account=await accountStore.findByFirebaseUid(claims.uid);
  if(!account||account.status!=='active'||!account.customerId||
     String(account.email).toLowerCase()!==String(claims.email).toLowerCase())throw Error('Authentication failed');
  return Object.freeze({customerId:String(account.customerId),firebaseUid:claims.uid,role:'guardian'});
 };
}
module.exports={createGuardianAuthenticator};
