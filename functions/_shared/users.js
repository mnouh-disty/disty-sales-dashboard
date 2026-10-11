import { safeEqual, verifySession } from './auth.js';

export const SCHEMA = `CREATE TABLE IF NOT EXISTS dashboard_users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','viewer')),
 active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL
)`;
const initialized = new WeakSet();
export async function usersDb(env) {
  const db = env.USERS_DB;
  if (!db) throw Object.assign(new Error('User storage is not connected. Bind a Cloudflare D1 database as USERS_DB, then redeploy.'), { status:503 });
  if (!initialized.has(db)) { await db.prepare(SCHEMA).run(); initialized.add(db); }
  return db;
}
export const publicUser = row => ({id:row.id,email:row.email,name:row.name,role:row.role,active:!!row.active,createdAt:row.created_at});
export async function hasUsers(env) {
  if (!env.USERS_DB) return false;
  const db=await usersDb(env);
  return !!(await db.prepare('SELECT id FROM dashboard_users LIMIT 1').first());
}
export async function authenticate(request,env) {
  const session=await verifySession(request,env.DASHBOARD_PASSWORD);
  if (!session.valid) return null;
  if (!session.identity) {
    if(await hasUsers(env)) return null;
    return {id:'owner',name:'Owner',email:'',role:'admin',active:true,bootstrap:true};
  }
  const db=await usersDb(env);
  const row=await db.prepare('SELECT * FROM dashboard_users WHERE id = ?').bind(session.identity.id).first();
  if(!row||!row.active||row.session_version!==session.identity.version)return null;
  return publicUser(row);
}
const hex=bytes=>[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function hashPassword(password,salt=hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:new TextEncoder().encode(salt)},key,256);
  return {salt,hash:hex(new Uint8Array(bits))};
}
export async function checkPassword(password,row) {
  // A dummy hash keeps unknown emails on the same expensive path.
  const result=await hashPassword(password,row?.salt||'00000000000000000000000000000000');
  return safeEqual(result.hash,row?.password_hash||'0'.repeat(64)) && !!row;
}
export function validateUser(body,{passwordRequired=true}={}) {
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const name=typeof body.name==='string'?body.name.trim():'';
  const password=typeof body.password==='string'?body.password:'';
  const role=body.role;
  if(!name||name.length>80)throw Object.assign(new Error('Enter a name of up to 80 characters.'),{status:400});
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw Object.assign(new Error('Enter a valid email address.'),{status:400});
  if(!['admin','viewer'].includes(role))throw Object.assign(new Error('Choose Admin or Viewer.'),{status:400});
  if((passwordRequired||password)&& (password.length<12||password.length>256))throw Object.assign(new Error('Use a password between 12 and 256 characters.'),{status:400});
  return {email,name,password,role};
}
export function sameOrigin(request){const origin=request.headers.get('Origin');return !origin||origin===new URL(request.url).origin;}
