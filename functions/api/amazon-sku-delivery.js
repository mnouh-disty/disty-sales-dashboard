import {json} from '../_shared/auth.js';
import {authenticate} from '../_shared/users.js';
import {parseExpense} from '../../src/channel-profitability.js';
const schema="CREATE TABLE IF NOT EXISTS amazon_sku_delivery (sku TEXT PRIMARY KEY, fee_halalas INTEGER NOT NULL CHECK(fee_halalas>=0), updated_at TEXT NOT NULL);";
export async function onRequest(context){
 try{
 const user=context.data?.user||await authenticate(context.request,context.env);if(!user)return json({error:'Authentication required.'},401);
 const db=context.env.CHANNELS_DB||context.env.USERS_DB;if(!db)return json({error:'Channel database not connected.'},503);
 await db.prepare(schema).run();
 if(context.request.method==='GET'){const r=await db.prepare('SELECT sku,fee_halalas FROM amazon_sku_delivery').all();return json({rows:r.results});}
 if(context.request.method!=='POST')return json({error:'Method not allowed.'},405);
 if(user.role!=='admin')return json({error:'Only admins can edit delivery costs.'},403);
 const b=await context.request.json();if(typeof b.sku!=='string'||!b.sku.trim()||b.sku.length>2000)return json({error:'Invalid SKU.'},400);
 let fee;try{fee=parseExpense(b.fee);}catch(e){return json({error:e.message},400);}
 if(fee===null)await db.prepare('DELETE FROM amazon_sku_delivery WHERE sku=?').bind(b.sku).run();
 else await db.prepare('INSERT INTO amazon_sku_delivery(sku,fee_halalas,updated_at) VALUES(?,?,?) ON CONFLICT(sku) DO UPDATE SET fee_halalas=excluded.fee_halalas,updated_at=excluded.updated_at').bind(b.sku,fee,new Date().toISOString()).run();
 return json({sku:b.sku,fee});
 }catch(e){return json({error:'Could not load or save Amazon delivery costs.'},503);}
}
