import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMonthlyOverview } from '../functions/_shared/ga4.js';
import { onRequest } from '../functions/api/analytics.js';
const headers = ['Month', 'Active Users', 'New Users', 'Sessions'];
test('monthly totals preserve source user counts and sort months, including zeros', () => {
  assert.deepEqual(normalizeMonthlyOverview([headers, ['2026-09', 20, 15, 30], ['2026-08', 20, 10, 25], ['2026-10', 0, 0, 0]]), [
    {month:'2026-10', visits:0, activeUsers:0}, {month:'2026-09', visits:30, activeUsers:20}, {month:'2026-08', visits:25, activeUsers:20}
  ]);
});
test('date serials and formatted counts are accepted', () => {
  const serial = (Date.UTC(2026, 9, 1) - Date.UTC(1899, 11, 30)) / 86400000;
  assert.deepEqual(normalizeMonthlyOverview([headers, [serial, '1,234', 0, '2,345']]), [{month:'2026-10', visits:2345, activeUsers:1234}]);
});
test('duplicate months cannot inflate monthly distinct users', () => {
  assert.throws(() => normalizeMonthlyOverview([headers, ['2026-09', 20, 0, 30], ['2026-09', 20, 0, 30]]), /duplicate/);
});
test('invalid months, headers and missing counts are errors rather than zero', () => {
  assert.throws(() => normalizeMonthlyOverview([['Month', 'Users'], ['2026-09', 20]]), /columns/);
  assert.throws(() => normalizeMonthlyOverview([headers, ['2026-13', 20, 0, 30]]), /invalid month/);
  assert.throws(() => normalizeMonthlyOverview([headers, ['2026-09', '', 0, 30]]), /invalid metric/);
});
test('unconfigured integration returns explicit setup status without exposing credentials', async () => {
  const response = await onRequest({request: new Request('https://dashboard.example/api/analytics'), env: {}});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match((await response.json()).error, /not configured/);
});
test('protected analytics endpoint reads only the monthly source and keeps its credentials server-side', async () => {
  const keys = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256'}, true, ['sign','verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`;
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({url, options});
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({access_token:'private-google-token'});
    assert.equal(options.headers.Authorization, 'Bearer private-google-token');
    return Response.json({values:[headers, ['2026-09', 1234, 1000, 2345]]});
  };
  try {
    const response = await onRequest({request:new Request('https://dashboard.example/api/analytics'), env:{GA4_SPREADSHEET_ID:'exact-sheet-id', GA4_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'analytics@example.iam.gserviceaccount.com', private_key:pem})}});
    assert.equal(response.status,200);
    const body = await response.text();
    const data = JSON.parse(body);
    assert.deepEqual(data.analytics,[{month:'2026-09',visits:2345,activeUsers:1234}]);
    assert.equal(data.websiteOnlyVerified,false);
    assert.equal(calls.length,2);
    assert.match(decodeURIComponent(calls[1].url), /exact-sheet-id\/values\/'Monthly Overview'!A1:H1000/);
    assert.ok(!body.includes('private-google-token'));
    assert.ok(!body.includes('PRIVATE KEY'));
    const jwt = calls[0].options.body.get('assertion').split('.');
    const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
    assert.equal(claims.scope,'https://www.googleapis.com/auth/spreadsheets.readonly');
    assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',keys.publicKey,Buffer.from(jwt[2],'base64url'),new TextEncoder().encode(jwt.slice(0,2).join('.'))),true);
  } finally {globalThis.fetch = original;}
});
