import { json } from '../_shared/auth.js';

export async function onRequestGet(context) {
  const { SOCIAL_SYNC_URL: source, SOCIAL_SYNC_TOKEN: token } = context.env;
  if (!source || !token) return json({error:'Social analytics is not connected yet. Set SOCIAL_SYNC_URL and SOCIAL_SYNC_TOKEN in Cloudflare.'},503);
  let url;
  try {
    url=new URL(source);
    if(url.protocol!=='https:' || url.hostname!=='script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) || url.username || url.password) throw new Error();
  } catch { return json({error:'The social analytics web app URL is invalid. Use its Google Apps Script /exec URL.'},503); }
  url.searchParams.set('token',token);
  try {
    const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(25000)});
    if(!response.ok) throw new Error();
    const payload=await response.json();
    if(payload.ok!==true || payload.schemaVersion!==1 || !Array.isArray(payload.posts) || !Array.isArray(payload.accounts) || !Array.isArray(payload.logs)) throw new Error();
    return json({posts:payload.posts,accounts:payload.accounts,logs:payload.logs,generatedAt:payload.generatedAt});
  } catch { return json({error:'Could not read social analytics. Check the web app deployment, matching token and sheet access, then retry.'},502); }
}
