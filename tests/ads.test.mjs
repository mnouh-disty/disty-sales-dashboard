import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAds, adsTotals, adsGrouped } from '../src/ads-data.js';
import { onRequest } from '../functions/api/ads.js';
const header = ['Month','Impressions','Clicks','Spend','Conversions','Conversion Value'];
test('monthly source supports date strings, serial dates and fractional conversions',()=>{
  const serial=(Date.UTC(2026,8,1)-Date.UTC(1899,11,30))/86400000;
  assert.deepEqual(normalizeAds([header,['2026-08-01',1000,10,30,0.25,5],[serial,2000,40,80,1.75,95]],'monthly').map(r=>[r.month,r.conversions]),[['2026-08',0.25],['2026-09',1.75]]);
});
test('rates use combined totals rather than averaging monthly rates',()=>{
  const rows=normalizeAds([header,['2026-08-01',1000,10,30,0.25,5],['2026-09-01',2000,40,80,1.75,95]],'monthly');
  const totals=adsTotals(rows);
  assert.equal(totals.spend,110);assert.equal(totals.cpc,2.2);assert.equal(totals.ctr,50/3000*100);assert.equal(totals.cpa,55);assert.equal(totals.roas,100/110);
});
test('zero denominators produce unavailable metrics, and no conversions does not imply free acquisition',()=>{
  const totals=adsTotals([{impressions:100,clicks:0,spend:20,conversions:0,conversionValue:0}]);
  assert.equal(totals.cpa,null);assert.equal(totals.cpc,null);assert.equal(totals.roas,0);assert.equal(adsTotals([]).ctr,null);
});
test('campaign grouping preserves IDs, sums selected rows and uses latest status',()=>{
  const rows=[{month:'2026-08',campaignId:'01',campaign:'A',status:'ENABLED',impressions:100,clicks:10,spend:20,conversions:0,conversionValue:0},{month:'2026-09',campaignId:'01',campaign:'A',status:'PAUSED',impressions:200,clicks:20,spend:30,conversions:0,conversionValue:0}];
  const groups=adsGrouped(rows,['campaignId']);assert.equal(groups.length,1);assert.equal(groups[0].spend,50);assert.equal(groups[0].status,'PAUSED');
  assert.equal(adsTotals(rows.filter(r=>r.month==='2026-09')).spend,30);
});
test('duplicates and missing metrics fail explicitly',()=>{
  assert.throws(()=>normalizeAds([header,['2026-08-01',100,1,5,0,0],['2026-08-01',100,1,5,0,0]],'monthly'),/duplicate/);
  assert.throws(()=>normalizeAds([header,['2026-08-01',100,1,'',0,0]],'monthly'),/invalid Spend/);
});
test('Ads endpoint requires the existing private sheet connection',async()=>{
  const response=await onRequest({request:new Request('https://example.com/api/ads'),env:{}});
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('Ads endpoint batch reads the four exact tabs and never exposes its Google credentials',async()=>{
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const der=await crypto.subtle.exportKey('pkcs8',keys.privateKey);
  const pem=`-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`;
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'private-token'});
    const ranges=new URL(url).searchParams.getAll('ranges');
    assert.deepEqual(ranges,["'Google Ads Monthly'!A1:P1000","'Google Ads Campaigns'!A1:P1000","'Google Ads Ad Groups'!A1:P1000","'Google Ads Ads'!A1:P1000"]);
    return Response.json({valueRanges:[{values:[header,['2026-08-01',100,5,10,0,0]]},{values:[]},{values:[]},{values:[]}]});
  };
  try{
    const response=await onRequest({request:new Request('https://example.com/api/ads'),env:{GA4_SPREADSHEET_ID:'example-sheet',GA4_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'test@example.com',private_key:pem})}});
    assert.equal(response.status,200);const body=await response.text();assert.ok(!body.includes('private-token'));assert.ok(!body.includes('PRIVATE KEY'));assert.equal(JSON.parse(body).monthly[0].spend,10);
  }finally{globalThis.fetch=original;}
});
