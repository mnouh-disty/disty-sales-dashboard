export function normalizeMonthlyOverview(values) {
  if (!Array.isArray(values) || !values.length) return [];
  const headers = values[0].map(value => String(value).trim().toLowerCase());
  const indices = ['month', 'sessions', 'active users'].map(name => headers.indexOf(name));
  if (indices.some(index => index < 0)) throw new Error('Monthly Overview needs Month, Sessions and Active Users columns.');
  const months = new Set();
  return values.slice(1).filter(row => row.some(value => String(value ?? '').trim())).map(row => {
    const raw = row[indices[0]];
    const month = typeof raw === 'number' ? new Date(Date.UTC(1899, 11, 30) + raw * 86400000).toISOString().slice(0, 7) : String(raw ?? '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Monthly Overview contains an invalid month. Use YYYY-MM or a date cell.');
    if (months.has(month)) throw new Error('Monthly Overview contains duplicate months. Active users cannot be summed across rows.');
    months.add(month);
    const counts = indices.slice(1).map(index => {
      const value = row[index];
      const count = typeof value === 'number' ? value : Number(String(value ?? '').replaceAll(',', '').trim());
      if (value === null || value === undefined || String(value).trim() === '' || !Number.isSafeInteger(count) || count < 0) throw new Error('Monthly Overview contains a missing or invalid metric.');
      return count;
    });
    return { month, visits: counts[0], activeUsers: counts[1] };
  }).sort((a, b) => b.month.localeCompare(a.month));
}

const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export async function sheetsAccessToken(credentials, fetcher = fetch) {
  const encoder = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const unsigned = `${base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${base64url(encoder.encode(JSON.stringify(claims)))}`;
  const pem = credentials.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned)));
  const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(signature)}` }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Google authentication failed. Check the dashboard’s Google credentials.');
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Google authentication returned no access token.');
  return payload.access_token;
}
