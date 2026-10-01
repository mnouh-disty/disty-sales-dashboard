import { json } from '../_shared/auth.js';
import { sheetsAccessToken } from '../_shared/ga4.js';
import { normalizeAds } from '../../src/ads-data.js';
const sources = [['monthly','Google Ads Monthly'], ['campaigns','Google Ads Campaigns'], ['adGroups','Google Ads Ad Groups'], ['ads','Google Ads Ads']];
export async function onRequest({request, env}) {
  if (!['GET', 'POST'].includes(request.method)) return json({error:'Method not allowed.'},405,{Allow:'GET, POST'});
  if (!env.GA4_GOOGLE_SERVICE_ACCOUNT_JSON || !env.GA4_SPREADSHEET_ID) return json({error:'The Google Sheet connection is not configured.'},503);
  try {
    const token = await sheetsAccessToken(JSON.parse(env.GA4_GOOGLE_SERVICE_ACCOUNT_JSON));
    const query = new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'});
    sources.forEach(([,title]) => query.append('ranges', `'${title}'!A1:P1000`));
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GA4_SPREADSHEET_ID)}/values:batchGet?${query}`, {headers:{Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(15000)});
    if (!response.ok) return json({error:'Could not read Google Ads data. Check that all four Google Ads tabs exist and the dashboard account has Viewer access.'},502);
    const payload = await response.json();
    if (payload.valueRanges?.length !== sources.length) throw new Error('Google Ads response is incomplete.');
    const data = Object.fromEntries(sources.map(([type],index) => [type,normalizeAds(payload.valueRanges[index].values || [],type)]));
    return json({...data, currency: env.GOOGLE_ADS_CURRENCY || null, updatedAt:new Date().toISOString()});
  } catch (error) {
    return json({error: error.message.startsWith('Google Ads ') ? error.message : 'Could not connect to Google Ads data. Check the Google Sheet connection and retry.'},502);
  }
}
