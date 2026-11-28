import {active,statusGroup} from './channels-data.js';
import {pricingRules} from './channel-pricing-rules.js';
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
export function autoExpenses(o,delivery={}){
 const amazon=o.channel==='Amazon.sa';let commission=0,opsCost=0,inbound=0,storage=0,missingRate=false,missingDelivery=false;
 for(const l of o.activeLines||[]){
  const rule=(amazon?pricingRules.amazon:pricingRules.trendyol)[l.sku],unit=l.qty>0?l.revenueCents/l.qty:0;
  if(!l.qty)continue;
  if(!rule)missingRate=true;
  else if(amazon){const threshold=rule.threshold*100;let fee=rule.method==='Progressive'?Math.min(unit,threshold)*rule.lower+Math.max(0,unit-threshold)*rule.upper:unit*(rule.method==='Step'&&unit>threshold?rule.upper:rule.lower);commission+=Math.max(rule.minimum*100,fee)*l.qty;inbound+=rule.inbound*100*l.qty;storage+=rule.storage*100*l.qty;}
  else {let rate=rule.lower,min=rule.minimum;for(const tier of rule.tiers)if(unit>=tier[0]*100){rate=tier[1];min=tier[2];}commission+=Math.max(unit*rate,min*100)*l.qty;}
  if(amazon){const fee=delivery[l.sku];if(!Number.isSafeInteger(fee)||fee<0)missingDelivery=true;else opsCost+=fee*l.qty;}
 }
 return {commission:missingRate?null:commission,opsCost:amazon?(missingDelivery?null:opsCost):1500*o.qty,inbound:missingRate?null:inbound,storage:missingRate?null:storage};
}
export function calculateOrder(o,e,settings=defaultTrendyolSettings){
 const trend=o.channel==='Trendyol',s=settings,automatic=Array.isArray(o.activeLines),amazon=o.channel==='Amazon.sa'&&automatic;
 const revenue=trend?o.revenueCents/(1+s.salesVat/100):amazon?o.revenueCents/1.15:o.revenueCents;
 const complete=expenseFields.every(k=>Number.isFinite(e[k])&&e[k]>=0);
 if(!complete)return {revenueNet:revenue,total:null,profit:null,margin:null,actualProfit:null,actualMargin:null,handling:null,packaging:null,reserve:null,economic:null};
 const productCost=trend?e.productCost/(1+s.purchaseVat/100)*(1+s.purchaseVat/100*(1-s.purchaseRecovery/100)):amazon?e.productCost/1.15:e.productCost;
 const handling=trend?o.qty*s.handling:amazon?o.qty*125:0,packaging=trend?o.qty*s.packaging:0;
 const reserve=trend&&o.qty>0?(e.opsCost+handling+packaging)*s.returnRate/(100-s.returnRate):0;
 const economic={productCost,commission:e.commission,opsCost:e.opsCost};
 const inbound=amazon?(o.auto?.inbound||0):0,storage=amazon?(o.auto?.storage||0):0;
 const actualTotal=productCost+e.commission+e.opsCost+handling+packaging+inbound+storage;
 const total=actualTotal+reserve,profit=revenue-total,actualProfit=revenue-actualTotal;
 return {revenueNet:revenue,total,profit,margin:revenue>0?profit/revenue:null,actualProfit,actualMargin:revenue>0?actualProfit/revenue:null,handling,packaging,reserve,economic,inbound,storage};
}
export function buildOrders(lines,expenses={},settings=defaultTrendyolSettings,delivery=null){
  const map=new Map(),seen=new Set();
  for(const r of lines){
    const lineKey=JSON.stringify([r.channel,r.orderId,r.lineId]);if(seen.has(lineKey))continue;seen.add(lineKey);
    const key=orderKey(r);let o=map.get(key);
    if(!o){o={key,channel:r.channel,orderId:r.orderId,day:r.day,qty:0,revenueCents:0,reportedCents:0,items:new Set(),statuses:new Set(),skus:new Set(),activeLines:[]};map.set(key,o);}
    if(r.day<o.day)o.day=r.day;
    o.items.add(r.product||r.sku||'Unknown item');if(r.sku)o.skus.add(r.sku);
    o.statuses.add(statusGroup(r.status));o.reportedCents+=Math.round(r.revenue*100);
    if(active(r)){o.qty+=r.qty;o.revenueCents+=Math.round(r.revenue*100);o.activeLines.push({sku:r.sku,qty:r.qty,revenueCents:Math.round(r.revenue*100)});}
  }
  return [...map.values()].map(o=>{
    const saved=expenses[o.key]||{},auto=delivery===null?null:autoExpenses(o,delivery),e=auto?{...saved,commission:o.qty===0?(saved.commission??0):auto.commission,opsCost:o.qty===0?(saved.opsCost??0):auto.opsCost}:saved;if(!auto)delete o.activeLines;o.auto=auto;const status=o.statuses.size===1?[...o.statuses][0]:'Mixed';
    const missing=expenseFields.filter(k=>!Number.isFinite(e[k])||e[k]<0);
    const complete=missing.length===0;
    const calculation=calculateOrder(o,e,settings);
    return {...o,items:[...o.items],skus:[...o.skus],statuses:[...o.statuses],status,expense:e,savedExpense:saved,missing,complete,...calculation};
  }).sort((a,b)=>b.day.localeCompare(a.day)||a.orderId.localeCompare(b.orderId));
}
export function profitSummary(orders){
  const s={orders:orders.length,complete:0,missing:0,revenue:0,coveredRevenue:0,missingRevenue:0,productCost:0,commission:0,opsCost:0,total:0,profit:0,actualProfit:0,handling:0,packaging:0,reserve:0,netRevenue:0,inbound:0,storage:0};
  for(const o of orders){s.revenue+=o.revenueCents;s.netRevenue+=o.revenueNet;if(!o.complete){s.missing++;s.missingRevenue+=o.revenueNet;continue;}s.complete++;s.coveredRevenue+=o.revenueNet;for(const k of expenseFields)s[k]+=o.economic[k];s.total+=o.total;s.profit+=o.profit;s.actualProfit+=o.actualProfit;s.handling+=o.handling;s.packaging+=o.packaging;s.reserve+=o.reserve;s.inbound+=o.inbound||0;s.storage+=o.storage||0;}
  s.margin=s.complete&&s.coveredRevenue>0?s.profit/s.coveredRevenue:null;
  s.actualMargin=s.complete&&s.coveredRevenue>0?s.actualProfit/s.coveredRevenue:null;
  return s;
}
