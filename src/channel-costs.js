import {active} from './channels-data.js';
export const costKey = r => JSON.stringify([r.channel,r.sku]);
export const hasCost = (r,costs) => !!r.sku && Object.hasOwn(costs,costKey(r)) && Number.isInteger(costs[costKey(r)]) && costs[costKey(r)]>=0;
export function parseCost(value){
  if(typeof value!=='string'||!/^\d{1,9}(\.\d{1,2})?$/.test(value.trim()))throw Error('Enter a non-negative SAR amount with up to 2 decimal places.');
  return Math.round(Number(value)*100);
}
export function costSummary(rows,costs){
  let knownCost=0,knownRevenue=0,missingRevenue=0,missingUnits=0;const missing=new Set();
  for(const r of rows){
    if(!hasCost(r,costs))missing.add(costKey(r));
    if(!active(r))continue;
    if(hasCost(r,costs)){knownCost+=costs[costKey(r)]*r.qty/100;knownRevenue+=r.revenue;}
    else {missingRevenue+=r.revenue;missingUnits+=r.qty;}
  }
  return {knownCost,knownRevenue,missingRevenue,missingUnits,missingItems:missing.size,grossProfit:knownRevenue-knownCost,margin:knownRevenue?(knownRevenue-knownCost)/knownRevenue:null};
}
export function productCosts(rows,costs){
  const groups=new Map();
  for(const r of rows){const key=costKey(r);let g=groups.get(key);if(!g){g={key,channel:r.channel,sku:r.sku,product:r.product,rows:[]};groups.set(key,g);}g.rows.push(r);}
  return [...groups.values()].map(g=>({key:g.key,channel:g.channel,sku:g.sku,product:g.product,unitCost:hasCost(g,costs)?costs[g.key]/100:null,qty:g.rows.filter(active).reduce((s,r)=>s+r.qty,0),revenue:g.rows.filter(active).reduce((s,r)=>s+r.revenue,0),...costSummary(g.rows,costs)})).sort((a,b)=>Number(a.unitCost!==null)-Number(b.unitCost!==null)||b.revenue-a.revenue);
}
