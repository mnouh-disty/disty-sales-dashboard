import { json } from '../_shared/auth.js';
import { normalizeMonthlyOverview, sheetsAccessToken } from '../_shared/ga4.js';

export async function onRequest({ request, env }) {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
  if (!env.GA4_GOOGLE_SERVICE_ACCOUNT_JSON || !env.GA4_SPREADSHEET_ID) return json({ error: 'The Google Sheet connection is not configured yet. Add the dashboard’s Google credentials and grant that account Viewer access to Disty GA4 Data.' }, 503);
  try {
    const credentials = JSON.parse(env.GA4_GOOGLE_SERVICE_ACCOUNT_JSON);
    if (!credentials.client_email || !credentials.private_key) throw new Error('Google service account credentials are incomplete.');
    const token = await sheetsAccessToken(credentials);
    const range = encodeURIComponent("'Monthly Overview'!A1:H1000");
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GA4_SPREADSHEET_ID)}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return json({ error: 'Could not read Disty GA4 Data. Check Viewer access and that the Google Sheets API is enabled.' }, 502);
    const data = await response.json();
    return json({ analytics: normalizeMonthlyOverview(data.values || []), updatedAt: new Date().toISOString(), websiteOnlyVerified: env.GA4_WEBSITE_ONLY_VERIFIED === 'true' });
  } catch (error) {
    const safe = error.message.startsWith('Monthly Overview') ? error.message : 'Could not connect to the Google Sheet. Check the dashboard’s Google credentials and try again.';
    return json({ error: safe }, 502);
  }
}
