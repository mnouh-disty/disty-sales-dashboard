import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createSession,sessionCookie,verifySession} from '../functions/_shared/auth.js';
import {hashPassword,checkPassword,authenticate,validateUser} from '../functions/_shared/users.js';
import {onRequest as middleware} from '../functions/_middleware.js';
import {onRequest as manageUsers} from '../functions/api/users.js';
import {onRequestPost as login} from '../functions/api/auth/login.js';

function database(){
 const sqlite=new DatabaseSync(':memory:');
 return {prepare(sql){const stmt=sqlite.prepare(sql);let args=[];const query={bind(...values){args=values;return query;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){const result=stmt.run(...args);return {meta:{changes:Number(result.changes)}};}};return query;}};
}
const cookieFor=token=>sessionCookie(token).split(';')[0];
function request(path,method='GET',body=null,cookie='',origin='https://dashboard.test'){
 return new Request('https://dashboard.test'+path,{method,headers:{Cookie:cookie,Origin:origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
}
async function call(env,cookie,method,body){
 const context={env,request:request('/api/users',method,body,cookie),data:{}};
 context.next=()=>manageUsers(context);
 return middleware(context);
}
function resetCache(){const cache=new Map();globalThis.caches={default:{match:async req=>cache.get(req.url)?.clone(),put:async(req,res)=>cache.set(req.url,res.clone()),delete:async req=>cache.delete(req.url)}};}

test('passwords are salted, verified and validated without returning a credential',async()=>{
 const password='unique secure password';const a=await hashPassword(password),b=await hashPassword(password);
 assert.notEqual(a.salt,b.salt);assert.notEqual(a.hash,b.hash);
 assert.equal(await checkPassword(password,{salt:a.salt,password_hash:a.hash}),true);
 assert.equal(await checkPassword('wrong',{salt:a.salt,password_hash:a.hash}),false);
 assert.equal(await checkPassword(password,null),false);
 assert.throws(()=>validateUser({email:'bad',name:'A',password,role:'admin'}));
 assert.throws(()=>validateUser({email:'a@test.com',name:'A',password:'short',role:'admin'}));
});

test('account lifecycle uses real SQL: bootstrap, login, roles, reset, disable and last-admin guard',async()=>{
 resetCache();
 const env={DASHBOARD_PASSWORD:'owner secret password',USERS_DB:database()};
 const ownerCookie=cookieFor((await createSession(env.DASHBOARD_PASSWORD)).token);
 assert.equal((await call(env,'','GET')).status,401);
 const first={name:'Owner',email:'OWNER@test.com',role:'admin',password:'owner individual password'};
 assert.equal((await call(env,ownerCookie,'POST',{...first,role:'viewer'})).status,400);
 const created=await call(env,ownerCookie,'POST',first);assert.equal(created.status,201);
 const adminCookie=created.headers.get('set-cookie').split(';')[0];const admin=(await created.json()).user;
 assert.equal(admin.email,'owner@test.com');assert.equal(admin.password_hash,undefined);
 assert.equal(await authenticate(request('/api/orders','GET',null,ownerCookie),env),null);
 assert.equal((await call(env,ownerCookie,'GET')).status,401);
 assert.equal((await call(env,adminCookie,'POST',first)).status,409);
 const vBody={name:'Viewer',email:'viewer@test.com',role:'viewer',password:'viewer individual password'};
 const vResponse=await call(env,adminCookie,'POST',vBody);assert.equal(vResponse.status,201);const viewer=(await vResponse.json()).user;
 const signIn=await login({env,request:request('/api/auth/login','POST',{email:vBody.email,password:vBody.password})});assert.equal(signIn.status,200);
 const viewerCookie=signIn.headers.get('set-cookie').split(';')[0];assert.equal((await call(env,viewerCookie,'GET')).status,403);
 const list=await call(env,adminCookie,'GET');const text=await list.text();assert.equal(JSON.parse(text).users.length,2);assert.ok(!text.includes('password_hash'));assert.ok(!text.includes('salt'));assert.ok(!text.includes(vBody.password));
 const demote=await call(env,adminCookie,'PATCH',{...admin,password:'',role:'viewer',active:true});assert.equal(demote.status,409);
 const disabled=await call(env,adminCookie,'PATCH',{...viewer,password:'',active:false});assert.equal(disabled.status,200);
 assert.equal(await authenticate(request('/api/orders','GET',null,viewerCookie),env),null);
 const newPassword='a different viewer password';
 assert.equal((await call(env,adminCookie,'PATCH',{...viewer,password:newPassword,active:true})).status,200);
 assert.equal((await login({env,request:request('/api/auth/login','POST',{email:vBody.email,password:vBody.password})})).status,401);
 const newLogin=await login({env,request:request('/api/auth/login','POST',{email:vBody.email,password:newPassword})});assert.equal(newLogin.status,200);
 assert.equal(await authenticate(request('/api/orders','GET',null,viewerCookie),env),null);
 assert.equal((await call(env,adminCookie,'PATCH',{...admin,password:'',active:false})).status,400);
 const ownReset=await call(env,adminCookie,'PATCH',{...admin,password:'new admin password 123',active:true});assert.equal(ownReset.status,200);
 assert.equal(await authenticate(request('/api/orders','GET',null,adminCookie),env),null);
 assert.equal((await authenticate(request('/api/orders','GET',null,ownReset.headers.get('set-cookie').split(';')[0]),env)).role,'admin');
});

test('missing storage leaves owner login working and reports setup; CSRF and token tampering are rejected',async()=>{
 const env={DASHBOARD_PASSWORD:'owner secret password'};const session=await createSession(env.DASHBOARD_PASSWORD);const cookie=cookieFor(session.token);
 assert.equal((await authenticate(request('/api/orders','GET',null,cookie),env)).role,'admin');
 const unavailable=await call(env,cookie,'GET');assert.equal(unavailable.status,503);assert.match((await unavailable.json()).error,/USERS_DB/);
 const denied=await middleware({env,request:request('/api/auth/login','POST',{password:env.DASHBOARD_PASSWORD},'','https://evil.test'),next:()=>assert.fail('Cross-origin mutation ran')});assert.equal(denied.status,403);
 const named=await createSession(env.DASHBOARD_PASSWORD,{id:'original',version:1});const pieces=named.token.split('.');pieces[2]=btoa(JSON.stringify({id:'other',version:1}));
 assert.equal((await verifySession(request('/api/orders','GET',null,cookieFor(pieces.join('.'))),env.DASHBOARD_PASSWORD)).valid,false);
});
