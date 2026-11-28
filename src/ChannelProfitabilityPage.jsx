import React,{useEffect,useMemo,useState} from 'react';
import {ChevronDown,ChevronRight,ArrowUpDown,ArrowUp,ArrowDown,Check} from 'lucide-react';
import {ResponsiveContainer,BarChart,Bar,CartesianGrid,XAxis,YAxis,Tooltip,Legend} from 'recharts';
import {buildOrders,profitSummary,orderKey,expenseFields,parseExpense} from './channel-profitability.js';
import {localDay,periodOf} from './channels-data.js';
const money=n=>n===null||n===undefined?'—':'SAR '+(n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const percent=n=>n===null||n===undefined?'—':(n*100).toFixed(2)+'%';
const initial={from:'',to:'',channel:'',status:'',completion:'',result:'',query:''};
const labels={productCost:'Product cost',commission:'Commission / fees',opsCost:'Ops / fulfillment'};
const draftOf=o=>Object.fromEntries(expenseFields.map(k=>[k,o.expense[k]==null?'':String(o.expense[k]/100)]));
function Section({title,note,children}){return <section className="card"><div className="card-head"><div><h2>{title}</h2>{note&&<p>{note}</p>}</div></div>{children}</section>;}
const cellStyle={width:'100%',minWidth:64,maxWidth:100,padding:'7px 8px',background:'#18181b',border:'1px solid #303036',borderRadius:5,color:'inherit',fontSize:12};
const profitColor=n=>n==null?'#a1a1aa':n<0?'#f0a6a6':n>0?'#86efac':'inherit';
async function request(url,opts,onSessionExpired){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),25000);
 try{const response=await fetch(url,{...opts,signal:c.signal,cache:'no-store'});if(response.status===401){onSessionExpired();throw Error('Session expired. Sign in again.');}const b=await response.json().catch(()=>null);if(!response.ok||!b)throw Error(b?.error||'Request failed (HTTP '+response.status+').');return b;}catch(e){if(e.name==='AbortError')throw Error('Request timed out. Refresh before retrying if a save was in progress.');throw e;}finally{clearTimeout(timer);}
}
export default function ChannelProfitabilityPage({canEdit,onSessionExpired}){
 const [lines,setLines]=useState([]),[expenses,setExpenses]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[ready,setReady]=useState(false);
 const [sort,setSort]=useState({key:'day',dir:'desc'}),[expanded,setExpanded]=useState({});
 const [filters,setFilters]=useState(initial),[drafts,setDrafts]=useState({}),[saving,setSaving]=useState(''),[page,setPage]=useState(0),[period,setPeriod]=useState('day');
 async function load(){
  setLoading(true);setError('');setReady(false);
  try{
   let after='',all=[];do{const b=await request('/api/channels-sales?after='+encodeURIComponent(after),{},onSessionExpired);if(!Array.isArray(b.rows))throw Error('Invalid sales response.');all.push(...b.rows);if(b.next&&b.next===after)throw Error('Invalid sales pagination.');after=b.next;}while(after);
   let cursor=null,costs={};do{const params=new URLSearchParams(cursor||{});const b=await request('/api/channel-profitability?'+params,{},onSessionExpired);if(!Array.isArray(b.rows))throw Error('Invalid expenses response.');for(const r of b.rows)costs[orderKey(r)]=r;if(b.next&&JSON.stringify(b.next)===JSON.stringify(cursor))throw Error('Invalid expenses pagination.');cursor=b.next;}while(cursor);
   setLines(all);setExpenses(costs);setReady(true);
  }catch(e){setError(e.message);}finally{setLoading(false);}
 }
 useEffect(()=>{load();},[]);
 async function save(o){
  if(saving||!ready||!drafts[o.key])return;
  setSaving(o.key);setError('');setNotice('');
  try{const b=await request('/api/channel-profitability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:o.channel,orderId:o.orderId,...drafts[o.key]})},onSessionExpired);
   setExpenses(old=>({...old,[o.key]:b.row}));setDrafts(old=>{const next={...old};delete next[o.key];return next;});setNotice('Saved expenses for order '+o.orderId+'.');
  }catch(e){setError(e.message);}finally{setSaving('');}
 }
 const orders=useMemo(()=>buildOrders(lines,expenses),[lines,expenses]);
 const filtered=useMemo(()=>orders.filter(o=>(!filters.from||o.day>=filters.from)&&(!filters.to||o.day<=filters.to)&&(!filters.channel||o.channel===filters.channel)&&(!filters.status||o.status===filters.status||o.statuses.includes(filters.status))&&(!filters.completion||(filters.completion==='complete'?o.complete:filters.completion==='missing'?!o.complete:o.missing.includes(filters.completion)))&&(!filters.result||(o.complete&&(filters.result==='profit'?o.profit>0:filters.result==='loss'?o.profit<0:o.profit===0)))&&(!filters.query||[o.orderId,...o.skus,...o.items].some(v=>v.toLowerCase().includes(filters.query.toLowerCase())))),[orders,filters]);
 const sorted=useMemo(()=>{
  const get=o=>sort.key==='item'?o.items.join(' · '):sort.key==='sku'?o.skus.join(', '):expenseFields.includes(sort.key)?o.expense[sort.key]:o[sort.key];
  return [...filtered].sort((a,b)=>{const x=get(a),y=get(b);if(x==null||y==null)return x==null?(y==null?0:1):-1;const cmp=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'en',{numeric:true,sensitivity:'base'});return (sort.dir==='asc'?cmp:-cmp)||a.key.localeCompare(b.key);});
 },[filtered,sort]);
 const sortBy=key=>{setSort(s=>({key,dir:s.key===key&&s.dir==='asc'?'desc':'asc'}));setPage(0);};
 const columns=[['item','Item'],['sku','SKU'],['revenueCents','Sales'],['productCost','Cost'],['commission','Fees'],['opsCost','Ops'],['profit','Profit'],['margin','Margin']];
 const summary=profitSummary(filtered);
 const groups=[...new Set(filtered.map(o=>o.channel))].map(channel=>({channel,...profitSummary(filtered.filter(o=>o.channel===channel))}));
 const trendMap=new Map();for(const o of filtered){const p=periodOf(o.day,period);if(!trendMap.has(p))trendMap.set(p,[]);trendMap.get(p).push(o);}
 const trend=[...trendMap].sort(([a],[b])=>a.localeCompare(b)).map(([day,rows])=>{const s=profitSummary(rows);return {day,profit:s.complete?s.profit/100:null,revenue:s.coveredRevenue/100};});
 const set=(k,v)=>{setFilters(f=>({...f,[k]:v}));setPage(0);};
 const preset=n=>{const now=new Date();setFilters(f=>({...f,from:localDay(new Date(now.getTime()-(n-1)*86400000)),to:localDay(now)}));setPage(0);};
 const select=(k,label,opts)=><label className="select-field"><span>{label}</span><select value={filters[k]} onChange={e=>set(k,e.target.value)}><option value="">All</option>{opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
 useEffect(()=>{setPage(p=>Math.min(p,Math.max(0,Math.ceil(filtered.length/25)-1)));},[filtered.length]);
 const kpis=[['Total orders',summary.orders],['Sales revenue',money(summary.revenue)],['Orders fully costed',summary.complete],['Orders missing expenses',summary.missing],['Sales missing expenses',money(summary.missingRevenue)],['Product cost · complete',summary.complete?money(summary.productCost):'—'],['Commission · complete',summary.complete?money(summary.commission):'—'],['Ops / fulfillment · complete',summary.complete?money(summary.opsCost):'—'],['Contribution profit',summary.complete?money(summary.profit):'—'],['Contribution margin',percent(summary.margin)]];
 return <>
  <Section title="Order-level profitability" note="Each marketplace order is separate. Multiple lines of the same order are shown together; no orders are combined by SKU. Enter TOTAL expenses for each order, not unit costs. Existing Channels Sales unit costs are independent.">
   <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><button className="logout" disabled={loading||!!saving} onClick={load}>Refresh data</button><span>{orders.length} orders · {Object.keys(drafts).length} unsaved edits</span>{!canEdit&&<small>Only admins can edit expenses.</small>}</div>
   <p style={{fontSize:12,color:'#a1a1aa'}}>Contribution profit = sales revenue − product cost − marketplace fees − ops/fulfillment. Sales use the same merchandise value as Channels Sales (including pending sales, excluding cancelled, returned and unpaid lines). Enter actual incurred costs, including any nonrecoverable costs on cancelled/returned orders. Enter 0 when an expense does not apply; blank means unknown. All amounts in SAR. Pending sales are provisional. This is not accounting net profit or settlement reconciliation; use a consistent VAT basis.</p>
   {error&&<p role="alert" style={{color:'#f0a6a6'}}>{error}</p>}{notice&&<p role="status" style={{color:'#86efac'}}>{notice}</p>}
  </Section>
  {!ready?<Section title={loading?'Loading orders and expenses…':'Data unavailable'} note="Refresh data to retry. Missing data is not shown as zero profit."/>:<>
  <Section title="Filters"><div className="preset-row"><button onClick={()=>preset(7)}>Last 7 days</button><button onClick={()=>preset(30)}>Last 30 days</button><button onClick={()=>{const d=localDay(new Date());setFilters(f=>({...f,from:d.slice(0,7)+'-01',to:d}));setPage(0);}}>Current month</button><button onClick={()=>{setFilters(initial);setPage(0);}}>Reset filters</button><button onClick={()=>set('completion','missing')}>Missing expenses</button></div>
   <div className="filter-grid">{['from','to'].map(k=><label className="date-field" key={k}><span>{k==='from'?'From':'To'}</span><input type="date" value={filters[k]} onChange={e=>set(k,e.target.value)}/></label>)}
   {select('channel','Channel',[...new Set(orders.map(o=>o.channel))].sort().map(v=>[v,v]))}
   {select('status','Order status',[...new Set(orders.flatMap(o=>[o.status,...o.statuses]))].sort().map(v=>[v,v]))}
   {select('completion','Expense status',[['missing','Missing expenses'],['complete','Complete'],...expenseFields.map(k=>[k,'Missing '+labels[k].toLowerCase()])])}
   {select('result','Profitability',[['profit','Profitable'],['loss','Loss-making'],['even','Break-even']])}
   <label className="select-field"><span>Search order, SKU or item</span><input className="social-search" value={filters.query} onChange={e=>set('query',e.target.value)}/></label></div>
  </Section>
  <div className="kpi-grid">{kpis.map(([label,value])=><div className="kpi-card" key={label}><div><div className="eyebrow">{label}</div><h3>{value}</h3></div></div>)}</div>
  <Section title="Individual orders" note="SAR · Total expenses per order. Select a header to sort. Expand an item for order details.">
   <div className="table-wrap"><table className="profit-edit-table" style={{tableLayout:'fixed',minWidth:canEdit?850:760,width:'100%'}}><colgroup><col style={{width:'28%'}}/><col style={{width:'9%'}}/><col style={{width:'10%'}}/><col style={{width:'10%'}}/><col style={{width:'10%'}}/><col style={{width:'10%'}}/><col style={{width:'10%'}}/><col style={{width:'8%'}}/>{canEdit&&<col style={{width:'5%'}}/>}</colgroup><thead><tr>{columns.map(([key,label])=>{const Icon=sort.key!==key?ArrowUpDown:sort.dir==='asc'?ArrowUp:ArrowDown;return <th key={key} aria-sort={sort.key===key?(sort.dir==='asc'?'ascending':'descending'):'none'} style={{padding:'8px 7px'}}><button onClick={()=>sortBy(key)} title={'Sort by '+label} style={{display:'inline-flex',gap:4,alignItems:'center',border:0,background:'transparent',color:'inherit',font:'inherit',cursor:'pointer',padding:0}}>{label}<Icon size={12}/></button></th>;})}{canEdit&&<th aria-label="Save" style={{padding:'8px 4px'}}/>}</tr></thead>
   <tbody>{sorted.slice(page*25,page*25+25).map(o=>{const d=drafts[o.key]||draftOf(o),open=!!expanded[o.key],dirty=!!drafts[o.key];let preview=null;
     if(dirty){try{const v=expenseFields.map(k=>parseExpense(d[k]));if(v.every(n=>n!==null))preview=o.revenueCents-v.reduce((a,b)=>a+b,0);}catch{}}
     const shownProfit=dirty?preview:o.profit,shownMargin=shownProfit!==null&&o.revenueCents>0?shownProfit/o.revenueCents:null;
     const amount=n=>n==null?'—':(n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
     return <React.Fragment key={o.key}><tr>
    <td style={{padding:'9px 7px',whiteSpace:'normal'}}><button aria-expanded={open} aria-label={(open?'Collapse':'Expand')+' order '+o.orderId} onClick={()=>setExpanded(e=>({...e,[o.key]:!open}))} style={{display:'flex',alignItems:'flex-start',gap:5,textAlign:'left',background:'transparent',border:0,padding:0,color:'inherit',width:'100%',cursor:'pointer'}}>{open?<ChevronDown size={15} style={{flexShrink:0}}/>:<ChevronRight size={15} style={{flexShrink:0}}/>}<span style={{minWidth:0}}><span title={o.items.join(' · ')} style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',fontWeight:550,lineHeight:1.35}}>{o.items.join(' · ')}</span><span style={{display:'block',color:'#a1a1aa',fontSize:10,marginTop:3}}>{o.channel} · Qty {o.qty} · {o.status}</span>{!o.complete&&<span style={{color:'#fbbf24',fontSize:10}}>Missing expenses</span>}{dirty&&<span style={{color:'#c7b6ef',fontSize:10}}> {o.complete?'Unsaved edits':'· Unsaved edits'}</span>}</span></button></td>
    <td style={{padding:'9px 7px',overflow:'hidden',textOverflow:'ellipsis'}} title={o.skus.join(', ')}>{o.skus.join(', ')||'—'}</td><td style={{padding:'9px 7px',fontVariantNumeric:'tabular-nums'}}>{amount(o.revenueCents)}</td>
    {expenseFields.map(k=><td key={k} style={{padding:'6px 5px'}}>{canEdit?<input style={{...cellStyle,boxSizing:'border-box',borderColor:d[k]===''?'#7c6129':'#303036'}} aria-label={labels[k]+' for '+o.orderId} type="number" min="0" step="0.01" placeholder="—" value={d[k]} disabled={!!saving} onChange={e=>setDrafts(old=>({...old,[o.key]:{...(old[o.key]||draftOf(o)),[k]:e.target.value}}))} onKeyDown={e=>{if(e.key==='Enter'&&dirty){e.preventDefault();save(o);}}}/>:amount(o.expense[k])}</td>)}
    <td style={{padding:'9px 7px',fontWeight:600,color:profitColor(shownProfit),fontVariantNumeric:'tabular-nums'}} title={dirty?'Unsaved preview':'Saved profit'}>{amount(shownProfit)}{dirty&&shownProfit!==null&&<small> *</small>}</td><td style={{padding:'9px 7px',fontWeight:600,color:profitColor(shownProfit)}}>{percent(shownMargin)}</td>
    {canEdit&&<td style={{padding:'6px 4px'}}><button className="logout" style={{padding:5,minHeight:28}} disabled={!!saving||!dirty} title="Save order expenses" aria-label={'Save order '+o.orderId} onClick={()=>save(o)}>{saving===o.key?'…':<Check size={14}/>}</button></td>}
   </tr>{open&&<tr><td colSpan={canEdit?9:8} style={{whiteSpace:'normal',padding:'12px 20px',background:'#18181b'}}><div style={{display:'flex',gap:18,flexWrap:'wrap',alignItems:'center',fontSize:12}}><span><strong>Order ID:</strong> {o.orderId}</span><span><strong>Date:</strong> {o.day}</span><span><strong>Status:</strong> {o.statuses.join(', ')}</span><span><strong>Saved total expenses:</strong> {money(o.total)}</span>{!o.complete&&<span style={{color:'#fbbf24'}}>Missing: {o.missing.map(k=>labels[k]).join(', ')}</span>}{canEdit&&dirty&&<button className="logout" disabled={!!saving} onClick={()=>setDrafts(old=>{const next={...old};delete next[o.key];return next;})}>Undo edits</button>}</div><div style={{marginTop:6,color:'#a1a1aa'}}>{o.items.join(' · ')}</div></td></tr>}</React.Fragment>;})}</tbody></table>{!filtered.length&&<p style={{padding:12}}>No matching orders. Upload reports in Channels Sales first.</p>}</div>
   <div className="pagination"><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} of {Math.max(1,Math.ceil(filtered.length/25))} · {filtered.length} orders · * unsaved profit preview</span><button disabled={(page+1)*25>=filtered.length} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  </Section>
  <Section title="Profitability by channel" note="Expense and margin totals include only fully costed orders. Margin = total contribution profit / corresponding sales revenue.">
   <div className="table-wrap"><table><thead><tr>{['Channel','Orders','Complete','Missing','Sales','Costed sales','Product cost','Commission','Ops / fulfillment','Contribution profit','Margin'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{groups.map(g=><tr key={g.channel}><td>{g.channel}</td><td>{g.orders}</td><td>{g.complete}</td><td>{g.missing}</td><td>{money(g.revenue)}</td><td>{money(g.coveredRevenue)}</td>{expenseFields.map(k=><td key={k}>{g.complete?money(g[k]):'—'}</td>)}<td style={{color:profitColor(g.complete?g.profit:null)}}>{g.complete?money(g.profit):'—'}</td><td>{percent(g.margin)}</td></tr>)}</tbody></table></div>
  </Section>
  <Section title="Profit trend" note="Only fully costed orders; pending sales remain provisional."><div className="segmented" style={{width:'fit-content',marginBottom:12}}>{['day','week','month'].map(p=><button key={p} className={period===p?'active':''} onClick={()=>setPeriod(p)}>{p}</button>)}</div><ResponsiveContainer width="100%" height={260}><BarChart data={trend}><CartesianGrid stroke="#303036" vertical={false}/><XAxis dataKey="day" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={n=>money(n*100)} contentStyle={{background:'#18181b'}}/><Legend/><Bar dataKey="revenue" name="Costed sales" fill="#a78bfa"/><Bar dataKey="profit" name="Contribution profit" fill="#86efac"/></BarChart></ResponsiveContainer></Section>
  </>}
 </>;
}
