import {active,statusGroup} from './channels-data.js';
export const expenseFields=['productCost','commission','opsCost'];
export const orderKey=r=>JSON.stringify([r.channel,r.orderId]);
export function parseExpense(value){
  if(value===null||value==='')return null;
  if(typeof value!=='string'||!/^\d{1,9}(\.\d{1,2})?$/.test(value.trim()))throw Error('Enter a non-negative SAR amount with up to two decimal places, or leave blank.');
  return Math.round(Number(value)*100);
}
export const defaultTrendyolSettings=Object.freeze({"handling":125,"packaging":150,"returnRate":8,"salesVat":15,"purchaseVat":15,"purchaseRecovery":100});
export function validateTrendyolSettings(s){
 const keys=Object.keys(defaultTrendyolSettings);
 if(!s||!keys.every(k=>typeof s[k]==='number'&&Number.isFinite(s[k])&&s[k]>=0))throw Error('Enter valid non-negative settings.');
 if(!['handling','packaging'].every(k=>Number.isSafeInteger(s[k])&&s[k]<=100000000)||s.returnRate>=100||['salesVat','purchaseVat','purchaseRecovery'].some(k=>s[k]>100))throw Error('Invalid cost or percentage. Return rate must be below 100%.');
 return Object.fromEntries(keys.map(k=>[k,s[k]]));
}
export function calculateOrder(o,e,settings=defaultTrendyolSettings){
 const trend=o.channel==='Trendyol',s=settings;
 const revenue=trend?o.revenueCents/(1+s.salesVat/100):o.revenueCents;
 const complete=expenseFields.every(k=>Number.isSafeInteger(e[k])&&e[k]>=0);
 if(!complete)return {revenueNet:revenue,total:null,profit:null,margin:null,actualProfit:null,actualMargin:null,handling:null,packaging:null,reserve:null,economic:null};
 const productCost=trend?e.productCost/(1+s.purchaseVat/100)*(1+s.purchaseVat/100*(1-s.purchaseRecovery/100)):e.productCost;
 const handling=trend?o.qty*s.handling:0,packaging=trend?o.qty*s.packaging:0;
 const reserve=trend&&o.qty>0?(e.opsCost+handling+packaging)*s.returnRate/(100-s.returnRate):0;
 const economic={productCost,commission:e.commission,opsCost:e.opsCost};
 const actualTotal=productCost+e.commission+e.opsCost+handling+packaging;
 const total=actualTotal+reserve,profit=revenue-total,actualProfit=revenue-actualTotal;
 return {revenueNet:revenue,total,profit,margin:revenue>0?profit/revenue:null,actualProfit,actualMargin:revenue>0?actualProfit/revenue:null,handling,packaging,reserve,economic};
}
export function buildOrders(lines,expenses={},settings=defaultTrendyolSettings){
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
    const calculation=calculateOrder(o,e,settings);
    return {...o,items:[...o.items],skus:[...o.skus],statuses:[...o.statuses],status,expense:e,missing,complete,...calculation};
  }).sort((a,b)=>b.day.localeCompare(a.day)||a.orderId.localeCompare(b.orderId));
}
export function profitSummary(orders){
  const s={orders:orders.length,complete:0,missing:0,revenue:0,coveredRevenue:0,missingRevenue:0,productCost:0,commission:0,opsCost:0,total:0,profit:0,actualProfit:0,handling:0,packaging:0,reserve:0,netRevenue:0};
  for(const o of orders){s.revenue+=o.revenueCents;s.netRevenue+=o.revenueNet;if(!o.complete){s.missing++;s.missingRevenue+=o.revenueNet;continue;}s.complete++;s.coveredRevenue+=o.revenueNet;for(const k of expenseFields)s[k]+=o.economic[k];s.total+=o.total;s.profit+=o.profit;s.actualProfit+=o.actualProfit;s.handling+=o.handling;s.packaging+=o.packaging;s.reserve+=o.reserve;}
  s.margin=s.complete&&s.coveredRevenue>0?s.profit/s.coveredRevenue:null;
  s.actualMargin=s.complete&&s.coveredRevenue>0?s.actualProfit/s.coveredRevenue:null;
  return s;
}
