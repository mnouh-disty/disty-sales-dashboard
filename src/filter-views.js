export const initialFilters = { start:'', end:'', customers:[], erps:[], cities:[], sources:[], platforms:[], platformPresence:'all', entities:[], verification:'all', paymentMethods:[], paymentStatuses:[], orderTypes:[], orderStates:[], mada:'all', discount:'all', wallet:'all', includeExcluded:false };
export const VIEWS_KEY='disty.filter-views.v1';
export const CURRENT_KEY='disty.current-filters.v1';
export function browserStorage() {try{return window.localStorage;}catch{return null;}}
export function normalizeFilters(value={}) {
  const result={};
  for(const [key,defaultValue] of Object.entries(initialFilters)) {
    const input=value?.[key];
    if(Array.isArray(defaultValue)) result[key]=Array.isArray(input)?[...new Set(input.filter(v=>typeof v==='string').map(v=>v.trim()).filter(Boolean))].sort():[];
    else if(typeof defaultValue==='boolean') result[key]=typeof input==='boolean'?input:defaultValue;
    else result[key]=typeof input==='string'?input:defaultValue;
  }
  for(const key of ['start','end']) if(result[key]&&!/^\d{4}-\d{2}-\d{2}$/.test(result[key])) result[key]='';
  for(const [key,allowed] of Object.entries({verification:['all','Verified','Pending','Unverified'],mada:['all','mada','non','unknown'],discount:['all','with','without'],wallet:['all','with','without'],platformPresence:['all','set','empty']})) if(!allowed.includes(result[key]))result[key]='all';
  return result;
}
export function snapshot(filters,period) {return {filters:normalizeFilters(filters),period:['day','week','month'].includes(period)?period:'month'};}
export function sameSnapshot(left,right) {return JSON.stringify(snapshot(left.filters,left.period))===JSON.stringify(snapshot(right.filters,right.period));}
export function readCurrent(storage) {try{return snapshot(...(()=>{const r=JSON.parse(storage.getItem(CURRENT_KEY)||'{}');return [r.filters,r.period];})());}catch{return snapshot();}}
export function readViews(storage) {
  try {
    const value=JSON.parse(storage.getItem(VIEWS_KEY)||'[]');
    if(!Array.isArray(value))return [];
    const ids=new Set();return value.filter(v=>v&&typeof v.id==='string'&&typeof v.name==='string'&&v.name.trim()&&!ids.has(v.id)&&(ids.add(v.id),true)).map(v=>({id:v.id,name:v.name.trim().slice(0,80),...snapshot(v.filters,v.period)}));
  }catch{return [];}
}
export function saveView(views,{id,name,filters,period}) {
  name=String(name||'').trim();
  if(!name)throw new Error('Enter a name for this view.');
  if(name.length>80)throw new Error('Use a name of 80 characters or fewer.');
  if(views.some(v=>v.id!==id&&v.name.toLowerCase()===name.toLowerCase()))throw new Error('A view with this name already exists. Choose another name.');
  const view={id,name,...snapshot(filters,period)};
  return views.some(v=>v.id===id)?views.map(v=>v.id===id?view:v):[...views,view];
}
export function matchesPlatform(row,filters) {
  const platform=String(row.platform??'').trim();
  if(filters.platformPresence==='set'&&!platform)return false;
  if(filters.platformPresence==='empty'&&platform)return false;
  return !filters.platforms.length||filters.platforms.includes(platform);
}
