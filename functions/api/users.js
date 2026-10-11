import { createSession,json,sessionCookie } from '../_shared/auth.js';
import { authenticate,usersDb,publicUser,hashPassword,validateUser } from '../_shared/users.js';

export async function onRequest(context) {
  try {
    const actor=context.data?.user||await authenticate(context.request,context.env);
    if(!actor)return json({error:'Authentication required.'},401);
    if(actor.role!=='admin')return json({error:'Only admins can manage users.'},403);
    const db=await usersDb(context.env);
    if(context.request.method==='GET'){
      const rows=await db.prepare('SELECT id,email,name,role,active,created_at FROM dashboard_users ORDER BY created_at').all();
      return json({users:rows.results.map(publicUser),bootstrap:!!actor.bootstrap});
    }
    if(!['POST','PATCH'].includes(context.request.method))return json({error:'Method not allowed.'},405,{Allow:'GET, POST, PATCH'});
    const body=await context.request.json().catch(()=>null);
    if(!body||typeof body!=='object')return json({error:'Invalid request.'},400);
    if(context.request.method==='POST'){
      const input=validateUser(body);
      if(actor.bootstrap&&input.role!=='admin')return json({error:'Create your own Admin account first.'},400);
      const {salt,hash}=await hashPassword(input.password);
      const row={id:crypto.randomUUID(),email:input.email,name:input.name,role:input.role,active:1,created_at:new Date().toISOString(),session_version:1};
      try{await db.prepare('INSERT INTO dashboard_users (id,email,name,password_hash,salt,role,active,created_at) VALUES (?,?,?,?,?,?,1,?)').bind(row.id,row.email,row.name,hash,salt,row.role,row.created_at).run();}
      catch(error){if(/UNIQUE/i.test(error.message))return json({error:'This email already has an account.'},409);throw error;}
      const headers={};
      if(actor.bootstrap){const session=await createSession(context.env.DASHBOARD_PASSWORD,{id:row.id,version:1});headers['set-cookie']=sessionCookie(session.token);}
      return json({user:publicUser(row),currentUser:actor.bootstrap?publicUser(row):undefined},201,headers);
    }
    if(typeof body.id!=='string')return json({error:'User ID is required.'},400);
    const existing=await db.prepare('SELECT * FROM dashboard_users WHERE id = ?').bind(body.id).first();
    if(!existing)return json({error:'User not found.'},404);
    const input=validateUser(body,{passwordRequired:false});
    if(typeof body.active!=='boolean')return json({error:'Choose whether the account is active.'},400);
    if(actor.id===existing.id&&!body.active)return json({error:'You cannot disable your own account.'},400);
    const credentials=input.password?await hashPassword(input.password):{hash:existing.password_hash,salt:existing.salt};
    // The guard runs in the UPDATE itself, so simultaneous demotions cannot remove the last admin.
    let result;
    try{
      result=await db.prepare(`UPDATE dashboard_users SET email=?,name=?,role=?,active=?,password_hash=?,salt=?,session_version=session_version+1
        WHERE id=? AND (role!='admin' OR active=0 OR (?='admin' AND ?=1) OR EXISTS
          (SELECT 1 FROM dashboard_users WHERE id!=? AND role='admin' AND active=1))`)
        .bind(input.email,input.name,input.role,body.active?1:0,credentials.hash,credentials.salt,existing.id,input.role,body.active?1:0,existing.id).run();
    }catch(error){if(/UNIQUE/i.test(error.message))return json({error:'This email already has an account.'},409);throw error;}
    if(!result.meta.changes)return json({error:'Keep at least one active Admin account.'},409);
    const row=await db.prepare('SELECT * FROM dashboard_users WHERE id=?').bind(existing.id).first();
    const headers={};
    if(actor.id===row.id){const session=await createSession(context.env.DASHBOARD_PASSWORD,{id:row.id,version:row.session_version});headers['set-cookie']=sessionCookie(session.token);}
    return json({user:publicUser(row),currentUser:actor.id===row.id?publicUser(row):undefined},200,headers);
  }catch(error){return json({error:error.status?error.message:'User management is temporarily unavailable.'},error.status||503);}
}
