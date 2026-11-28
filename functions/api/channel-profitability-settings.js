import {json} from '../_shared/auth.js';
import {authenticate} from '../_shared/users.js';
import {defaultTrendyolSettings,validateTrendyolSettings} from '../../src/channel-profitability.js';
const schema="CREATE TABLE IF NOT EXISTS channel_profitability_settings (channel TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);";
export async function onRequest(context){
 try{
 const user=context.data?.user||await authenticate(context.request,context.env);
 if(!user)return json({error:'Authentication required.'},401);
 const db=context.env.CHANNELS_DB||context.env.USERS_DB;
 if(!db)return json({error:'Channel database not connected.'},503);
 await db.prepare(schema).run();
 await db.prepare('INSERT OR IGNORE INTO channel_profitability_settings(channel,payload,updated_at) VALUES(?,?,?)').bind('Trendyol',JSON.stringify(defaultTrendyolSettings),new Date().toISOString()).run();
 if(context.request.method==='GET'){const r=await db.prepare('SELECT payload FROM channel_profitability_settings WHERE channel=?').bind('Trendyol').first();return json({settings:validateTrendyolSettings(JSON.parse(r.payload))});}
 if(context.request.method!=='POST')return json({error:'Method not allowed.'},405);
 if(user.role!=='admin')return json({error:'Only admins can edit profitability settings.'},403);
 let settings;try{settings=validateTrendyolSettings((await context.request.json()).settings);}catch(e){return json({error:e.message},400);}
 await db.prepare('UPDATE channel_profitability_settings SET payload=?,updated_at=? WHERE channel=?').bind(JSON.stringify(settings),new Date().toISOString(),'Trendyol').run();
 return json({settings});
 }catch(e){console.error('Profitability settings error',e?.message);return json({error:'Could not load or save profitability settings.'},503);}
}
