import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSocial,metricTotal,accountSummary,day,bucket,postTrend,csv} from '../src/social.js';
import {onRequestGet} from '../functions/api/social.js';
import {onRequest as middleware} from '../functions/_middleware.js';

test('missing metrics remain unknown, zero remains zero and long IDs are preserved',()=>{
 const data=normalizeSocial({posts:[{Platform:'x','Post ID':'2107822929778196752','Publish date':'2026-10-09T22:00:00Z',Likes:0,Comments:0,Shares:''},{Platform:'instagram','Post ID':'1',Likes:2,Comments:1,Shares:3},{Platform:'instagram','Post ID':'1',Likes:4,Comments:1,Shares:3}]});
 assert.equal(data.posts.length,2);assert.equal(data.posts[0].id,'2107822929778196752');assert.equal(data.posts[0].date,'2026-10-10');assert.equal(data.posts[0].interactions,null);assert.equal(data.posts[1].interactions,8);
 assert.deepEqual(metricTotal(data.posts,'interactions'),{value:8,known:1,total:2});
 assert.equal(metricTotal([], 'likes').value,null);
});
test('growth uses prior baseline and end cutoff, never sums follower snapshots',()=>{
 const accounts=[{platform:'x',date:'2026-10-08',followers:300},{platform:'x',date:'2026-10-09',followers:310},{platform:'x',date:'2026-10-10',followers:307},{platform:'x',date:'2026-10-11',followers:500}];
 const [result]=accountSummary(accounts,['x'],'2026-10-09','2026-10-10');assert.equal(result.followers,307);assert.equal(result.growth,7);assert.equal(result.baseline,'2026-10-08');assert.equal(result.partial,false);
 assert.equal(accountSummary(accounts,['x'],'2026-10-08','2026-10-08')[0].growth,null);
 assert.equal(accountSummary(accounts,['linkedin'])[0].followers,null);
 assert.equal(accountSummary(accounts.slice(1),['x'],'2026-10-01','2026-10-10')[0].partial,true);
});
test('publication chart and weekly buckets use Riyadh calendar dates',()=>{
 assert.equal(day('2026-10-09T21:00:00Z'),'2026-10-10');assert.equal(day('bad'),'');assert.equal(bucket('2026-10-11','week'),'2026-10-05');
 assert.deepEqual(postTrend([{date:'2026-10-09',interactions:12},{date:'2026-10-09',interactions:null}],'month'),[{date:'2026-10',posts:2,interactions:12}]);
});
test('CSV protects spreadsheet formulas while keeping quoted Arabic text',()=>{
 const result=csv([{content:'=HYPERLINK("evil")'},{content:'دستي, hello'}],[{key:'content',label:'Content'}]);assert.ok(result.includes("'="));assert.ok(result.includes('دستي, hello'));
});
test('social route inherits session protection',async()=>{
 const response=await middleware({request:new Request('https://disty.example/api/social'),env:{DASHBOARD_PASSWORD:'private'},next:()=>{throw new Error('Should not reach route');}});assert.equal(response.status,401);
});
test('proxy validates configuration and excludes tokens from response',async()=>{
 assert.equal((await onRequestGet({env:{}})).status,503);
 assert.equal((await onRequestGet({env:{SOCIAL_SYNC_URL:'https://attacker.example/exec',SOCIAL_SYNC_TOKEN:'secret'}})).status,503);
 const previous=globalThis.fetch;
 try{globalThis.fetch=async url=>{assert.equal(url.searchParams.get('token'),'private-token');return Response.json({ok:true,schemaVersion:1,posts:[],accounts:[],logs:[],token:'private-token'});};
 const response=await onRequestGet({env:{SOCIAL_SYNC_URL:'https://script.google.com/macros/s/test/exec',SOCIAL_SYNC_TOKEN:'private-token'}});assert.equal(response.status,200);assert.equal((await response.text()).includes('private-token'),false);
 globalThis.fetch=async()=>Response.json({ok:false,error:'private-token'});const failed=await onRequestGet({env:{SOCIAL_SYNC_URL:'https://script.google.com/macros/s/test/exec',SOCIAL_SYNC_TOKEN:'private-token'}});assert.equal(failed.status,502);assert.equal((await failed.text()).includes('private-token'),false);
 }finally{globalThis.fetch=previous;}
});
