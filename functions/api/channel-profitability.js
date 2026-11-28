import {json} from '../_shared/auth.js';
import {authenticate} from '../_shared/users.js';
import {parseExpense,expenseFields} from '../../src/channel-profitability.js';
const schema="CREATE TABLE IF NOT EXISTS channel_order_expenses (channel TEXT NOT NULL, order_id TEXT NOT NULL, product_cost INTEGER CHECK(product_cost>=0), commission INTEGER CHECK(commission>=0), ops_cost INTEGER CHECK(ops_cost>=0), updated_at TEXT NOT NULL, PRIMARY KEY(channel,order_id));";
const publicRow=r=>({channel:r.channel,orderId:r.order_id,productCost:r.product_cost,commission:r.commission,opsCost:r.ops_cost,updatedAt:r.updated_at});
export async function onRequest(context){
 try{
  const actor=context.data?.user||await authenticate(context.request,context.env);
  if(!actor)return json({error:'Authentication required.'},401);
  const db=context.env.CHANNELS_DB||context.env.USERS_DB;
  if(!db)return json({error:'Channel database not connected.'},503);
  await db.prepare(schema).run();
  if(context.request.method==='GET'){
   const params=new URL(context.request.url).searchParams;
   const channel=params.get('channel')||'',order=params.get('order')||'';
   const r=await db.prepare('SELECT * FROM channel_order_expenses WHERE (channel,order_id)>(?,?) ORDER BY channel,order_id LIMIT 1000').bind(channel,order).all();
   const rows=r.results.map(publicRow);return json({rows,next:rows.length===1000?{channel:rows.at(-1).channel,order:rows.at(-1).orderId}:null});
  }
  if(context.request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(actor.role!=='admin')return json({error:'Only admins can edit order expenses.'},403);
  const b=await context.request.json().catch(()=>null);
  if(!b||!['Amazon.sa','Trendyol'].includes(b.channel)||typeof b.orderId!=='string'||!b.orderId.trim()||b.orderId.length>2000||!expenseFields.every(k=>Object.hasOwn(b,k)))return json({error:'Invalid order or expense fields.'},400);
  let values;try{values=expenseFields.map(k=>parseExpense(b[k]));}catch(e){return json({error:e.message},400);}
  const prefix=JSON.stringify([b.channel,b.orderId]).slice(0,-1)+',';
  const exists=await db.prepare('SELECT id FROM channel_sales WHERE id>=? AND id<? LIMIT 1').bind(prefix,prefix+'\uffff').first();
  if(!exists)return json({error:'Order not found. Import the sales report first.'},404);
  const now=new Date().toISOString();
  await db.prepare('INSERT INTO channel_order_expenses(channel,order_id,product_cost,commission,ops_cost,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(channel,order_id) DO UPDATE SET product_cost=excluded.product_cost,commission=excluded.commission,ops_cost=excluded.ops_cost,updated_at=excluded.updated_at').bind(b.channel,b.orderId,...values,now).run();
  return json({row:{channel:b.channel,orderId:b.orderId,productCost:values[0],commission:values[1],opsCost:values[2],updatedAt:now}});
 }catch(e){console.error('Channel profitability database error',e?.message);return json({error:'Order expenses could not be loaded or saved. Please retry.'},503);}
}
