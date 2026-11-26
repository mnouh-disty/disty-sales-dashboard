import { json } from '../_shared/auth.js';
import { authenticate } from '../_shared/users.js';
import { keyOf } from '../../src/channels-data.js';
const schema='CREATE TABLE IF NOT EXISTS channel_sales (id TEXT PRIMARY KEY, payload TEXT NOT NULL, source_updated TEXT NOT NULL, imported_at TEXT NOT NULL)';
const valid=r=>r&&['Amazon.sa','Trendyol'].includes(r.channel)&&['orderId','lineId','day','sourceUpdated','status','sku','product','brand','city'].every(k=>typeof r[k]==='string'&&r[k].length<=2000)&&r.orderId&&r.lineId&&r.status&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&Number.isSafeInteger(r.qty)&&r.qty>=0&&Number.isFinite(r.revenue)&&r.revenue>=0&&(r.channel!=='Amazon.sa'||/^\d{4}-\d{2}-\d{2}T/.test(r.sourceUpdated));
const sanitize=r=>({channel:r.channel,orderId:r.orderId,lineId:r.lineId,day:r.day,sourceUpdated:r.sourceUpdated,status:r.status,sku:r.sku,product:r.product,brand:r.brand,city:r.city,qty:r.qty,revenue:r.revenue});
export async function onRequest(context){
  try{
    const user=context.data?.user||await authenticate(context.request,context.env);
    if(!user)return json({error:'Authentication required.'},401);
    const db=context.env.USERS_DB;if(!db)return json({error:'Channel storage requires the USERS_DB D1 binding in Cloudflare Pages.'},503);
    await db.prepare(schema).run();
    if(context.request.method==='GET'){
      const after=new URL(context.request.url).searchParams.get('after')||'';
      const result=await db.prepare('SELECT id,payload FROM channel_sales WHERE id>? ORDER BY id LIMIT 1000').bind(after).all();
      return json({rows:result.results.map(x=>JSON.parse(x.payload)),next:result.results.length===1000?result.results.at(-1).id:null});
    }
    if(context.request.method!=='POST')return json({error:'Method not allowed.'},405);
    if(user.role!=='admin')return json({error:'Only admins can upload reports.'},403);
    const body=await context.request.json().catch(()=>null);
    if(!Array.isArray(body?.rows)||!body.rows.length||body.rows.length>50||!body.rows.every(valid))return json({error:'Invalid report batch.'},400);
    const rows=body.rows.map(sanitize);
    const now=new Date().toISOString();const statements=[];
    for(const row of rows){const key=keyOf(row),payload=JSON.stringify(row);
      statements.push(db.prepare('INSERT OR IGNORE INTO channel_sales(id,payload,source_updated,imported_at) VALUES(?,?,?,?)').bind(key,payload,row.sourceUpdated,now));
      statements.push(db.prepare('UPDATE channel_sales SET payload=?,source_updated=?,imported_at=? WHERE id=? AND payload<>? AND source_updated<=?').bind(payload,row.sourceUpdated,now,key,payload,row.sourceUpdated));
    }
    const result=await db.batch(statements);let added=0,updated=0;for(let i=0;i<result.length;i+=2){added+=result[i].meta.changes||0;updated+=result[i+1].meta.changes||0;}
    return json({added,updated,skipped:rows.length-added-updated});
  }catch(e){return json({error:'Channel sales storage is temporarily unavailable.'},503);}
}
