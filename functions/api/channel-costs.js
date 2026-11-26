import {json} from '../_shared/auth.js';
import {authenticate} from '../_shared/users.js';
import {parseCost} from '../../src/channel-costs.js';
const schema="CREATE TABLE IF NOT EXISTS channel_product_costs (channel TEXT NOT NULL, sku TEXT NOT NULL, cost_halalas INTEGER NOT NULL CHECK(cost_halalas>=0), updated_at TEXT NOT NULL, PRIMARY KEY(channel,sku));";
export async function onRequest(context){
 try{
  const user=context.data?.user||await authenticate(context.request,context.env);
  if(!user)return json({error:'Authentication required.'},401);
  const db=context.env.CHANNELS_DB||context.env.USERS_DB;
  if(!db)return json({error:'Channel database not connected.'},503);
  await db.prepare(schema).run();
  if(context.request.method==='GET'){
   const result=await db.prepare('SELECT channel,sku,cost_halalas FROM channel_product_costs ORDER BY channel,sku').all();
   return json({costs:result.results});
  }
  if(context.request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(user.role!=='admin')return json({error:'Only admins can edit product costs.'},403);
  const body=await context.request.json().catch(()=>null);
  if(!body||!['Amazon.sa','Trendyol'].includes(body.channel)||typeof body.sku!=='string'||!body.sku.trim()||body.sku.length>2000)return json({error:'Valid channel and SKU required.'},400);
  if(body.cost===null){await db.prepare('DELETE FROM channel_product_costs WHERE channel=? AND sku=?').bind(body.channel,body.sku).run();return json({cost_halalas:null});}
  let cost;try{cost=parseCost(body.cost);}catch(e){return json({error:e.message},400);}
  await db.prepare('INSERT INTO channel_product_costs(channel,sku,cost_halalas,updated_at) VALUES(?,?,?,?) ON CONFLICT(channel,sku) DO UPDATE SET cost_halalas=excluded.cost_halalas,updated_at=excluded.updated_at').bind(body.channel,body.sku,cost,new Date().toISOString()).run();
  return json({cost_halalas:cost});
 }catch(e){console.error('Channel cost database failure',e?.message);return json({error:'Product costs could not be loaded or saved. Please retry.'},503);}
}
