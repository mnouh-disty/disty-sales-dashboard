import { json } from '../../_shared/auth.js';
import { authenticate,hasUsers } from '../../_shared/users.js';
export async function onRequestGet(context) {
  try {
    const user=await authenticate(context.request,context.env);
    const namedAccounts=await hasUsers(context.env);
    return json({authenticated:!!user,user,namedAccounts},user?200:401);
  }catch{return json({error:'Account storage is temporarily unavailable.'},503);}
}
export function onRequest(){return json({error:'Method not allowed.'},405,{Allow:'GET'});}
