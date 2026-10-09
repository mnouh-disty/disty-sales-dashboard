import { json } from '../_shared/auth.js';

export async function onRequestGet(context) {
  const { SOCIAL_SYNC_URL: source, SOCIAL_SYNC_TOKEN: token } = context.env;
  if (!source || !token) return json({error:'Social analytics is not connected yet. Set SOCIAL_SYNC_URL and SOCIAL_SYNC_TOKEN in Cloudflare.'},503);
  let url;
  try {
    url=new URL(source);
    if(url.protocol!=='https:' || url.hostname!=='script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) || url.username || url.password) throw new Error();
  } catch { return json({error:'The social analytics web app URL is invalid. Use its Google Apps Script /exec URL.'},503); }
  url.searchParams.set('token',token.trim());
  try {
    const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(25000)});
    if(!response.ok) return json({error:`Google returned HTTP ${response.status}. Check that the deployed Web app uses Execute as Me and Who has access Anyone.`,code:'google_http_error'},502);
    const body=await response.text();
    let payload;
    try { payload=JSON.parse(body); } catch {
      return json({error:'Google returned a webpage instead of analytics data. In Apps Script, deploy a Web app with Execute as Me and Who has access Anyone (without a Google sign-in requirement). Use its /exec URL in SOCIAL_SYNC_URL.',code:'google_non_json'},502);
    }
    if(payload.ok!==true) {
      const errors={
        'Unauthorized':['token_mismatch','The connection token does not match. Copy DISTY_DASHBOARD_TOKEN from this Apps Script project into the Cloudflare Production secret SOCIAL_SYNC_TOKEN, then redeploy.'],
        'Sync in progress. Retry shortly.':['sync_busy','A daily sync is writing the sheet. Wait a minute and click Retry.'],
        'Dashboard connection is not configured.':['script_not_configured','Run setupDashboardConnection in the deployed Apps Script project.'],
        'Unable to read the synced sheets.':['sheet_read_failed','Apps Script authenticated successfully but could not read the synced sheet. Run runSync once in that same project and check its execution log.']
      };
      const [code,error]=errors[payload.error] || ['script_error','The deployed Apps Script returned an unexpected error. Verify that its deployed version includes the dashboard bridge.'];
      return json({error,code},502);
    }
    if(payload.schemaVersion!==1 || !Array.isArray(payload.posts) || !Array.isArray(payload.accounts) || !Array.isArray(payload.logs)) return json({error:'The Web app returned an older or unexpected data format. Update its deployment to the latest saved script version.',code:'invalid_schema'},502);
    return json({posts:payload.posts,accounts:payload.accounts,logs:payload.logs,generatedAt:payload.generatedAt});
  } catch (failure) { return json({error:['TimeoutError','AbortError'].includes(failure.name)?'Google took too long to respond. Click Retry.':'Could not reach the Google Web app. Check SOCIAL_SYNC_URL and retry.',code:'connection_failed'},502); }
}
