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
const categoryKey=(channel,category)=>JSON.stringify([channel,category]);
const skuKey=(channel,sku)=>JSON.stringify([channel,sku]);
export function recognizeCommissionCategory(channel,product=''){
 const value=String(product).toLowerCase();
 const accessory=/\b(case|cover|screen protector|cable|charger|adapter|controller|gamepad|headset|stand|mount|skin|replacement|accessor)/.test(value);
 const phone=!accessory&&(/\b(iphone|smartphone|mobile phone|google pixel)\b/.test(value)||/\b(samsung\s+)?galaxy\s+(s|a|m|f|z)\d{1,3}\b/.test(value));
 if(phone)return channel==='Amazon.sa'?'Mobiles and Tablets':'Mobile phones';
 const console=!accessory&&(/\b(playstation\s*[345]?|ps[345]|xbox\s+(one|series\s*[sx])|nintendo\s+switch|steam\s+deck)\b/.test(value));
 if(console)return channel==='Amazon.sa'?'Video Game Consoles':'Game consoles';
 return null;
}
export function prepareCommissionConfig(config={}){
 return {
  categories:new Map((config.categories||[]).map(r=>[categoryKey(r.channel,r.category),r])),
  assignments:new Map((config.assignments||[]).map(r=>[skuKey(r.channel,r.sku),r.category]))
 };
}
function commissionFee(rule,unit,qty){
 if(rule.method==='Tiered'){let rate=rule.lower,min=rule.minimum;for(const tier of rule.tiers||[])if(unit>=tier[0]*100){rate=tier[1];min=tier[2];}return Math.max(unit*rate,min*100)*qty;}
 const threshold=rule.threshold*100;
 const fee=rule.method==='Progressive'?Math.min(unit,threshold)*rule.lower+Math.max(0,unit-threshold)*rule.upper:unit*(rule.method==='Step'&&unit>threshold?rule.upper:rule.lower);
 return Math.max(rule.minimum*100,fee)*qty;
}
function resolveRule(channel,line,config){
 const exact=(channel==='Amazon.sa'?pricingRules.amazon:pricingRules.trendyol)[line.sku];
 const assigned=config.assignments.get(skuKey(channel,line.sku));
 if(assigned){const rule=config.categories.get(categoryKey(channel,assigned));return {rule,category:assigned,source:'manual',exact};}
 if(exact)return {rule:exact,category:null,source:'sku',exact};
 const category=recognizeCommissionCategory(channel,line.product);
 return {rule:category?config.categories.get(categoryKey(channel,category)):null,category,source:category?'automatic':'uncertain',exact};
}
export function autoExpenses(o,delivery={},commissionConfig={}){
 const amazon=o.channel==='Amazon.sa',config=commissionConfig.categories instanceof Map?commissionConfig:prepareCommissionConfig(commissionConfig);let commission=0,opsCost=0,inbound=0,storage=0,missingRate=false,missingDelivery=false,inboundKnown=true,storageKnown=true;const categories=[];
 for(const l of o.activeLines||[]){
  const resolved=resolveRule(o.channel,l,config),rule=resolved.rule,unit=l.qty>0?l.revenueCents/l.qty:0;
  if(!l.qty)continue;
  if(!rule)missingRate=true;
  else commission+=commissionFee(rule,unit,l.qty);
  if(amazon){const operational=resolved.exact;if(Number.isFinite(operational?.inbound))inbound+=operational.inbound*100*l.qty;else inboundKnown=false;if(Number.isFinite(operational?.storage))storage+=operational.storage*100*l.qty;else storageKnown=false;}
  categories.push({sku:l.sku,category:resolved.category,source:resolved.source,uncertain:!rule});
  if(amazon){const fee=delivery[l.sku];if(!Number.isSafeInteger(fee)||fee<0)missingDelivery=true;else opsCost+=fee*l.qty;}
 }
 return {commission:missingRate?null:commission,opsCost:amazon?(missingDelivery?null:opsCost):1500*o.qty,inbound:amazon?(inboundKnown?inbound:null):0,storage:amazon?(storageKnown?storage:null):0,categories};
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
 const inbound=amazon?(o.auto?.inbound??null):0,storage=amazon?(o.auto?.storage??null):0,operationsKnown=!amazon||(inbound!==null&&storage!==null);
 const actualTotal=operationsKnown?productCost+e.commission+e.opsCost+handling+packaging+inbound+storage:null;
 if(actualTotal===null)return {revenueNet:revenue,total:null,profit:null,margin:null,actualProfit:null,actualMargin:null,handling,packaging,reserve,economic,inbound,storage};
 const total=actualTotal+reserve,profit=revenue-total,actualProfit=revenue-actualTotal;
 return {revenueNet:revenue,total,profit,margin:revenue>0?profit/revenue:null,actualProfit,actualMargin:revenue>0?actualProfit/revenue:null,handling,packaging,reserve,economic,inbound,storage};
}
export function buildOrders(lines,expenses={},settings=defaultTrendyolSettings,delivery=null,commissionConfig={}){
  const map=new Map(),seen=new Set();
  for(const r of lines){
    const lineKey=JSON.stringify([r.channel,r.orderId,r.lineId]);if(seen.has(lineKey))continue;seen.add(lineKey);
    const key=orderKey(r);let o=map.get(key);
    if(!o){o={key,channel:r.channel,orderId:r.orderId,day:r.day,qty:0,revenueCents:0,reportedCents:0,items:new Set(),statuses:new Set(),skus:new Set(),activeLines:[]};map.set(key,o);}
    if(r.day<o.day)o.day=r.day;
    o.items.add(r.product||r.sku||'Unknown item');if(r.sku)o.skus.add(r.sku);
    o.statuses.add(statusGroup(r.status));o.reportedCents+=Math.round(r.revenue*100);
    if(active(r)){o.qty+=r.qty;o.revenueCents+=Math.round(r.revenue*100);o.activeLines.push({sku:r.sku,product:r.product,qty:r.qty,revenueCents:Math.round(r.revenue*100)});}
  }
  const prepared=prepareCommissionConfig(commissionConfig);
  return [...map.values()].map(o=>{
    const saved=expenses[o.key]||{},auto=delivery===null?null:autoExpenses(o,delivery,prepared),e=auto?{...saved,commission:o.qty===0?(saved.commission??0):auto.commission,opsCost:o.qty===0?(saved.opsCost??0):auto.opsCost}:saved;if(!auto)delete o.activeLines;o.auto=auto;const status=o.statuses.size===1?[...o.statuses][0]:'Mixed';
    const missing=expenseFields.filter(k=>!Number.isFinite(e[k])||e[k]<0);if(auto&&o.channel==='Amazon.sa'&&o.qty>0){if(auto.inbound===null)missing.push('inbound');if(auto.storage===null)missing.push('storage');}
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
