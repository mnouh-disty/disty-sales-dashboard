import {json} from '../_shared/auth.js';
import {authenticate} from '../_shared/users.js';
import {defaultCommissionCategories} from '../../src/commission-category-rules.js';

const categorySchema=`CREATE TABLE IF NOT EXISTS channel_commission_categories (channel TEXT NOT NULL, category TEXT NOT NULL, method TEXT NOT NULL, threshold_sar REAL NOT NULL DEFAULT 0 CHECK(threshold_sar>=0), lower_rate REAL NOT NULL CHECK(lower_rate>=0 AND lower_rate<=1), upper_rate REAL NOT NULL CHECK(upper_rate>=0 AND upper_rate<=1), minimum_sar REAL NOT NULL DEFAULT 0 CHECK(minimum_sar>=0), tiers TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL, PRIMARY KEY(channel,category))`;
const assignmentSchema=`CREATE TABLE IF NOT EXISTS channel_sku_categories (channel TEXT NOT NULL, sku TEXT NOT NULL, category TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', updated_at TEXT NOT NULL, PRIMARY KEY(channel,sku))`;
const channels=['Amazon.sa','Trendyol'];
const publicCategory=r=>({channel:r.channel,category:r.category,method:r.method,threshold:r.threshold_sar,lower:r.lower_rate,upper:r.upper_rate,minimum:r.minimum_sar,tiers:JSON.parse(r.tiers||'[]'),updatedAt:r.updated_at});
const validNumber=(n,max=Number.MAX_SAFE_INTEGER)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;

async function seed(db){
 const row=await db.prepare('SELECT COUNT(*) total FROM channel_commission_categories').first();
 if(Number(row?.total)>=defaultCommissionCategories.length)return;
 const now=new Date().toISOString();
 const statements=defaultCommissionCategories.map(r=>db.prepare('INSERT OR IGNORE INTO channel_commission_categories(channel,category,method,threshold_sar,lower_rate,upper_rate,minimum_sar,tiers,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(r.channel,r.category,r.method,r.threshold,r.lower,r.upper,r.minimum,JSON.stringify(r.tiers),now));
 for(let i=0;i<statements.length;i+=40)await db.batch(statements.slice(i,i+40));
}
export async function onRequest(context){
 try{
  const actor=context.data?.user||await authenticate(context.request,context.env);if(!actor)return json({error:'Authentication required.'},401);
  const db=context.env.CHANNELS_DB||context.env.USERS_DB;if(!db)return json({error:'Channel database not connected.'},503);
  await db.prepare(categorySchema).run();await db.prepare(assignmentSchema).run();await seed(db);
  if(context.request.method==='GET'){
   const [categories,assignments]=await Promise.all([db.prepare('SELECT * FROM channel_commission_categories ORDER BY channel,category').all(),db.prepare('SELECT channel,sku,category,source,updated_at FROM channel_sku_categories ORDER BY channel,sku').all()]);
   return json({categories:categories.results.map(publicCategory),assignments:assignments.results.map(r=>({channel:r.channel,sku:r.sku,category:r.category,source:r.source,updatedAt:r.updated_at}))});
  }
  if(context.request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(actor.role!=='admin')return json({error:'Only admins can edit commission settings.'},403);
  const b=await context.request.json().catch(()=>null),now=new Date().toISOString();
  if(!b||!channels.includes(b.channel))return json({error:'Invalid commission setting.'},400);
  if(b.type==='assignment'){
   if(typeof b.sku!=='string'||!b.sku.trim()||b.sku.length>2000||typeof b.category!=='string')return json({error:'Invalid SKU category assignment.'},400);
   const sku=b.sku.trim(),category=b.category.trim();
   if(!category){await db.prepare('DELETE FROM channel_sku_categories WHERE channel=? AND sku=?').bind(b.channel,sku).run();return json({assignment:null,channel:b.channel,sku});}
   const exists=await db.prepare('SELECT 1 ok FROM channel_commission_categories WHERE channel=? AND category=?').bind(b.channel,category).first();if(!exists)return json({error:'Choose a valid category for this channel.'},400);
   await db.prepare("INSERT INTO channel_sku_categories(channel,sku,category,source,updated_at) VALUES(?,?,?,'manual',?) ON CONFLICT(channel,sku) DO UPDATE SET category=excluded.category,source='manual',updated_at=excluded.updated_at").bind(b.channel,sku,category,now).run();
   return json({assignment:{channel:b.channel,sku,category,source:'manual',updatedAt:now}});
  }
  if(b.type==='category'){
   if(typeof b.category!=='string'||!b.category.trim()||!['Flat','Step','Progressive','Tiered'].includes(b.method)||!validNumber(b.threshold)||!validNumber(b.lower,1)||!validNumber(b.upper,1)||!validNumber(b.minimum)||!Array.isArray(b.tiers))return json({error:'Invalid category commission rule.'},400);
   if(!b.tiers.every(t=>Array.isArray(t)&&t.length===3&&validNumber(t[0])&&validNumber(t[1],1)&&validNumber(t[2])))return json({error:'Invalid commission tier.'},400);const tiers=b.tiers;
   const category=b.category.trim();
   await db.prepare('INSERT INTO channel_commission_categories(channel,category,method,threshold_sar,lower_rate,upper_rate,minimum_sar,tiers,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(channel,category) DO UPDATE SET method=excluded.method,threshold_sar=excluded.threshold_sar,lower_rate=excluded.lower_rate,upper_rate=excluded.upper_rate,minimum_sar=excluded.minimum_sar,tiers=excluded.tiers,updated_at=excluded.updated_at').bind(b.channel,category,b.method,b.threshold,b.lower,b.upper,b.minimum,JSON.stringify(tiers),now).run();
   return json({category:{channel:b.channel,category,method:b.method,threshold:b.threshold,lower:b.lower,upper:b.upper,minimum:b.minimum,tiers,updatedAt:now}});
  }
  return json({error:'Invalid commission setting type.'},400);
 }catch(e){console.error('Commission settings error',e?.message);return json({error:'Could not load or save commission settings.'},503);}
}
