import {active,statusGroup} from './channels-data.js';
export const expenseFields=['productCost','commission','opsCost'];
export const orderKey=r=>JSON.stringify([r.channel,r.orderId]);
export function parseExpense(value){
  if(value===null||value==='')return null;
  if(typeof value!=='string'||!/^\d{1,9}(\.\d{1,2})?$/.test(value.trim()))throw Error('Enter a non-negative SAR amount with up to two decimal places, or leave blank.');
  return Math.round(Number(value)*100);
}
export function buildOrders(lines,expenses={}){
  const map=new Map(),seen=new Set();
  for(const r of lines){
    const lineKey=JSON.stringify([r.channel,r.orderId,r.lineId]);if(seen.has(lineKey))continue;seen.add(lineKey);
    const key=orderKey(r);let o=map.get(key);
    if(!o){o={key,channel:r.channel,orderId:r.orderId,day:r.day,qty:0,revenueCents:0,reportedCents:0,items:new Set(),statuses:new Set(),skus:new Set()};map.set(key,o);}
    if(r.day<o.day)o.day=r.day;
    o.items.add(r.product||r.sku||'Unknown item');if(r.sku)o.skus.add(r.sku);
    o.statuses.add(statusGroup(r.status));o.reportedCents+=Math.round(r.revenue*100);
    if(active(r)){o.qty+=r.qty;o.revenueCents+=Math.round(r.revenue*100);}
  }
  return [...map.values()].map(o=>{
    const e=expenses[o.key]||{},status=o.statuses.size===1?[...o.statuses][0]:'Mixed';
    const missing=expenseFields.filter(k=>!Number.isSafeInteger(e[k])||e[k]<0);
    const complete=missing.length===0;
    const total=complete?expenseFields.reduce((sum,k)=>sum+e[k],0):null;
    const profit=complete?o.revenueCents-total:null;
    return {...o,items:[...o.items],skus:[...o.skus],statuses:[...o.statuses],status,expense:e,missing,complete,total,profit,margin:complete&&o.revenueCents>0?profit/o.revenueCents:null};
  }).sort((a,b)=>b.day.localeCompare(a.day)||a.orderId.localeCompare(b.orderId));
}
export function profitSummary(orders){
  const s={orders:orders.length,complete:0,missing:0,revenue:0,coveredRevenue:0,missingRevenue:0,productCost:0,commission:0,opsCost:0,total:0,profit:0};
  for(const o of orders){s.revenue+=o.revenueCents;if(!o.complete){s.missing++;s.missingRevenue+=o.revenueCents;continue;}s.complete++;s.coveredRevenue+=o.revenueCents;for(const k of expenseFields)s[k]+=o.expense[k];s.total+=o.total;s.profit+=o.profit;}
  s.margin=s.complete&&s.coveredRevenue>0?s.profit/s.coveredRevenue:null;
  return s;
}
