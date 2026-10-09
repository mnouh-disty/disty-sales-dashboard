import test from 'node:test';
import assert from 'node:assert/strict';
import {initialFilters,VIEWS_KEY,CURRENT_KEY,normalizeFilters,snapshot,readViews,readCurrent,saveView,sameSnapshot,matchesPlatform} from '../src/filter-views.js';
import {normalizeOrders} from '../functions/_shared/redash.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
test('named snapshots survive storage reload and replace rather than merge current filters',()=>{
 const storage=memory();const saved=saveView([],{id:'one',name:' Customer orders ',filters:{sources:['marketplace'],platforms:['ios','android'],platformPresence:'set',orderStates:['fulfilled'],includeExcluded:true,start:'2026-10-01',end:'2026-10-31'},period:'week'});
 storage.setItem(VIEWS_KEY,JSON.stringify(saved));const loaded=readViews(storage);assert.equal(loaded[0].name,'Customer orders');assert.equal(loaded[0].period,'week');
 const previous={...initialFilters,cities:['Riyadh'],wallet:'with',verification:'Verified'};
 const restored=snapshot(loaded[0].filters,loaded[0].period);assert.deepEqual(restored.filters.cities,[]);assert.equal(restored.filters.wallet,'all');assert.equal(restored.filters.verification,'all');assert.notDeepEqual(restored.filters,previous);assert.deepEqual(restored.filters.platforms,['android','ios']);
 restored.filters.sources.push('other');assert.deepEqual(loaded[0].filters.sources,['marketplace']);
});
test('save multiple views, update and rename one without changing the others',()=>{
 let views=saveView([],{id:'a',name:'A',filters:{cities:['Riyadh']},period:'day'});views=saveView(views,{id:'b',name:'B',filters:{cities:['Jeddah']},period:'month'});
 views=saveView(views,{id:'a',name:'A renamed',filters:{cities:['Dammam']},period:'week'});assert.equal(views.length,2);assert.deepEqual(views[1].filters.cities,['Jeddah']);assert.equal(views[0].name,'A renamed');
 assert.throws(()=>saveView(views,{id:'c',name:'b'}),/already exists/);assert.throws(()=>saveView(views,{id:'c',name:' '}),/Enter a name/);
});
test('current filters and period restore on reopening and malformed storage is safe',()=>{
 const storage=memory();storage.setItem(CURRENT_KEY,JSON.stringify(snapshot({platforms:['ios'],includeExcluded:true},'day')));assert.equal(readCurrent(storage).period,'day');assert.equal(readCurrent(storage).filters.includeExcluded,true);
 storage.setItem(VIEWS_KEY,'broken');assert.deepEqual(readViews(storage),[]);storage.setItem(CURRENT_KEY,'broken');assert.deepEqual(readCurrent(storage),snapshot());assert.deepEqual(readViews(null),[]);assert.deepEqual(readCurrent(null),snapshot());
 assert.deepEqual(normalizeFilters({platforms:'oops',includeExcluded:'yes',mada:'bad'}),normalizeFilters());
});
test('snapshot comparison detects changes but treats multi-select order as equivalent',()=>{
 assert.equal(sameSnapshot({filters:{sources:['a','b']},period:'day'},{filters:{sources:['b','a']},period:'day'}),true);
 assert.equal(sameSnapshot({filters:{sources:['a']},period:'day'},{filters:{sources:['b']},period:'day'}),false);
});
test('platform survives Redash normalization and filters distinguish missing and present values',()=>{
 const rows=normalizeOrders([{order_id:'1',created_at:'2026-10-09',platform:' ios '},{order_id:'2',created_at:'2026-10-09',platform:null},{order_id:'3',created_at:'2026-10-09',platform:'admin'}]);
 assert.equal(rows[0].platform,'ios');assert.equal(rows[1].platform,'');
 const filter=normalizeFilters({platforms:['ios'],platformPresence:'set'});assert.deepEqual(rows.filter(r=>matchesPlatform(r,filter)).map(r=>r.order_id),['1']);
 assert.deepEqual(rows.filter(r=>matchesPlatform(r,normalizeFilters({platformPresence:'empty'}))).map(r=>r.order_id),['2']);assert.equal(rows.filter(r=>matchesPlatform(r,normalizeFilters())).length,3);
});
