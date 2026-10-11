import { json } from './_shared/auth.js';
import { authenticate, sameOrigin } from './_shared/users.js';

export async function onRequest(context) {
  const path=new URL(context.request.url).pathname;
  if (!path.startsWith('/api/')) return context.next();
  if (!['GET','HEAD','OPTIONS'].includes(context.request.method)&&!sameOrigin(context.request))return json({error:'Request origin is not allowed.'},403);
  if (path==='/api/auth/login'||path==='/api/auth/session')return context.next();
  try {
    const user=await authenticate(context.request,context.env);
    if(!user)return json({error:'Authentication required.'},401);
    context.data.user=user;
    return context.next();
  }catch{return json({error:'Authentication storage is temporarily unavailable.'},503);}
}
