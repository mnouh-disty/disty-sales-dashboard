import test from 'node:test';
import assert from 'node:assert/strict';
import {costKey,hasCost,parseCost,costSummary,productCosts} from '../src/channel-costs.js';
const a={channel:'Amazon.sa',sku:'123',product:'Phone',status:'Shipped',qty:2,revenue:400},b={...a,channel:'Trendyol',qty:1,revenue:150};
test('costs are independent across channels, zero is valid, missing is not zero',()=>{const costs={[costKey(a)]:0};assert.equal(hasCost(a,costs),true);assert.equal(hasCost(b,costs),false);assert.equal(costSummary([a,b],costs).grossProfit,400);assert.equal(costSummary([a,b],costs).missingRevenue,150);});
test('costs apply to quantity, cancelled lines excluded, group by channel SKU',()=>{const costs={[costKey(a)]:10000};const result=costSummary([a,b,{...a,status:'Cancelled'}],costs);assert.equal(result.knownCost,200);assert.equal(result.grossProfit,200);assert.equal(result.missingItems,1);assert.equal(productCosts([a,b],costs).length,2);});
test('validates monetary inputs',()=>{assert.equal(parseCost('12.34'),1234);assert.equal(parseCost('0'),0);for(const v of ['', '-1','1.234','NaN','1e3'])assert.throws(()=>parseCost(v));});
