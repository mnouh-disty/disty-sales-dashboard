import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOrders,profitSummary,orderKey,parseExpense,autoExpenses,recognizeCommissionCategory,defaultTrendyolSettings} from '../src/channel-profitability.js';
import {defaultCommissionCategories} from '../src/commission-category-rules.js';
const a={channel:'Amazon.sa',orderId:'1',lineId:'a',day:'2026-11-26',status:'Shipped',qty:2,revenue:200,sku:'123',product:'Phone'};
const b={...a,lineId:'b',qty:1,revenue:100};
const c={...a,orderId:'2',lineId:'a',qty:1,revenue:150};
const d={...a,channel:'Trendyol'};
test('same SKU in distinct orders remains separate, same ID across channels separate, repeated lines ignored',()=>{const o=buildOrders([a,b,a,c,d]);assert.equal(o.length,3);assert.equal(o.find(r=>r.key===orderKey(a)).revenueCents,30000);assert.equal(o.find(r=>r.key===orderKey(a)).qty,3);});
test('all expenses required, zero is valid and margin weighted',()=>{const costs={[orderKey(a)]:{productCost:20000,commission:1500,opsCost:500},[orderKey(c)]:{productCost:10000,commission:0,opsCost:0}};const o=buildOrders([a,b,c,d],costs);const s=profitSummary(o);assert.equal(s.complete,2);assert.equal(s.missing,1);assert.equal(s.profit,13000);assert.equal(s.coveredRevenue,45000);assert.equal(s.margin,13000/45000);assert.equal(o.find(r=>r.channel==='Trendyol').profit,null);});
test('cancelled order can capture incurred expense as loss without dividing by zero',()=>{const cancelled={...a,status:'Cancelled'};const [o]=buildOrders([cancelled],{[orderKey(a)]:{productCost:0,commission:0,opsCost:500}});assert.equal(o.revenueCents,0);assert.equal(o.profit,-500);assert.equal(o.margin,null);});
test('nullable expense inputs are distinct from zero',()=>{assert.equal(parseExpense(''),null);assert.equal(parseExpense(null),null);assert.equal(parseExpense('0'),0);assert.equal(parseExpense('12.34'),1234);assert.throws(()=>parseExpense('-1'));assert.throws(()=>parseExpense('1.234'));});
test('clear phone and console names use live category rates while accessories remain uncertain',()=>{
 assert.equal(recognizeCommissionCategory('Amazon.sa','Samsung Galaxy S25 Ultra 256GB'),'Mobiles and Tablets');
 assert.equal(recognizeCommissionCategory('Trendyol','PlayStation 5 Slim Console'),'Game consoles');
 assert.equal(recognizeCommissionCategory('Amazon.sa','Galaxy S25 Ultra protective case'),null);
 const auto=autoExpenses({channel:'Amazon.sa',qty:2,activeLines:[{sku:'73312',product:'Samsung Galaxy S25 Ultra 256GB',qty:1,revenueCents:100000},{sku:'73347',product:'Samsung Galaxy A27 128GB',qty:1,revenueCents:100000}]},{73312:900,73347:900},{categories:defaultCommissionCategories,assignments:[]});
 assert.equal(auto.commission,11000);assert.equal(auto.opsCost,1800);assert.equal(auto.storage,null);assert.equal(auto.categories.every(r=>r.source==='automatic'&&!r.uncertain),true);
});
test('manual category assignment overrides commission but keeps SKU operational assumptions',()=>{
 const auto=autoExpenses({channel:'Amazon.sa',qty:1,activeLines:[{sku:'73314',product:'Samsung Galaxy S25 Ultra',qty:1,revenueCents:100000}]},{73314:900},{categories:defaultCommissionCategories,assignments:[{channel:'Amazon.sa',sku:'73314',category:'Video Game Consoles'}]});
 assert.equal(auto.commission,6000);assert.equal(auto.storage!==null,true);assert.equal(auto.categories[0].source,'manual');
});
test('unknown Amazon storage is visible but does not create a false missing-expense status',()=>{
 const line={channel:'Amazon.sa',orderId:'phone',lineId:'1',day:'2026-11-28',status:'Shipped',qty:1,revenue:3049,sku:'73312',product:'Samsung Galaxy S25 Ultra AI Phone'};
 const [order]=buildOrders([line],{[orderKey(line)]:{productCost:281000}},defaultTrendyolSettings,{73312:900},{categories:defaultCommissionCategories,assignments:[]});
 assert.equal(order.expense.commission,16769.5);assert.equal(order.inbound,400);assert.equal(order.storage,null);assert.deepEqual(order.provisionalCosts,['storage']);assert.equal(order.complete,true);assert.equal(order.profit!==null,true);
});
