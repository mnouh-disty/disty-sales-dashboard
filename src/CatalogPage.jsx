import React, {useEffect,useMemo,useState} from "react";
import {BarChart,Bar,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer} from "recharts";
import {Download,Search,RefreshCw} from "lucide-react";
import "./catalog.css";

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const str = v => String(v ?? "").trim();
const number = new Intl.NumberFormat("en-SA",{maximumFractionDigits:0});
const sar = new Intl.NumberFormat("en-SA",{style:"currency",currency:"SAR",maximumFractionDigits:0});
const unique = (rows,key) => [...new Set(rows.map(r=>str(r[key])).filter(Boolean))];
const date = v => { const value = str(v); const match = value.match(/^\d{4}-\d{2}-\d{2}/); return match ? match[0] : ""; };
const createdDate = r => date(r.product_created_at ?? r.created_date);
const imageCount = r => r.image_count !== null && r.image_count !== undefined ? Math.max(0,n(r.image_count)) : Array.from({length:10},(_,i)=>r["image_"+(i+1)+"_url"]).filter(Boolean).length;
const categoriesFor = r => [...new Set([r.category_en,r.subcategory_en].flatMap(v=>str(v).split(",").map(x=>x.trim()).filter(Boolean)))];
const active = r => r.product_active === true || ["true","1","yes"].includes(str(r.product_active).toLowerCase());
const skuKey = r => str(r.assr_sku_id);
const group = (rows,key) => Object.entries(rows.reduce((a,r)=>{const k=key(r)||"Unknown";(a[k]??=[]).push(r);return a;},{}));
const asCsv=(rows)=>{const keys=["assr_sku_id","product_id","sku_code","product_name_en","category_en","subcategory_en","vendor_name_en","channel_name_en","channel_price","wholesale_price","commission_rate","product_active","stock","qty_sold","ordered_amount","product_created_at","product_updated_at","image_count","sku_media_image_count","base_media_image_count","legacy_image_count"];const esc=x=>'"'+str(x).replaceAll('"','""')+'"';return [keys.join(","),...rows.map(r=>keys.map(k=>esc(k==="image_count"?imageCount(r):r[k])).join(","))].join("\r\n");};
function csvDownload(rows) {const blob=new Blob(["\ufeff"+asCsv(rows)],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="disty-catalog.csv";a.click();URL.revokeObjectURL(url);}
function rangePreset(key){if(key==="all")return {start:"",end:""};const day=new Date();const fmt=x=>x.toISOString().slice(0,10);const end=fmt(day);let start=new Date(day);if(key==="30"){start.setDate(start.getDate()-29);}else if(key==="month"){start=new Date(day.getFullYear(),day.getMonth(),1);}else if(key==="last"){start=new Date(day.getFullYear(),day.getMonth()-1,1);return {start:fmt(start),end:fmt(new Date(day.getFullYear(),day.getMonth(),0))};}return {start:fmt(start),end};}
function periodOf(v,mode){const d=date(v);if(!d)return "";if(mode==="day")return d;if(mode==="month")return d.slice(0,7);const t=new Date(d+"T00:00:00Z");const wd=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-wd);const y=t.getUTCFullYear();const start=new Date(Date.UTC(y,0,1));return y+"-W"+String(Math.ceil((((t-start)/86400000)+1)/7)).padStart(2,"0");}
const select=(label,value,onChange,options)=><label className="cat-field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(x=><option key={x} value={x}>{x==="all"?"All":x}</option>)}</select></label>;
function Metric({label,value,detail}) {return <div className="cat-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>}
function Plot({title,data,type="bar",height=260}){return <section className="card cat-chart"><div className="card-head"><div><h2>{title}</h2></div></div>{data.length?<ResponsiveContainer width="100%" height={height}>{type==="line"?<LineChart data={data} margin={{top:8,right:12,left:0,bottom:24}}><CartesianGrid stroke="#303036" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{fontSize:10}} angle={-20} textAnchor="end" height={58}/><YAxis tick={{fontSize:10}}/><Tooltip/><Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={false}/></LineChart>:<BarChart data={data.slice(0,18)} margin={{top:8,right:12,left:0,bottom:45}}><CartesianGrid stroke="#303036" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{fontSize:10}} angle={-25} textAnchor="end" height={72} interval={0}/><YAxis tick={{fontSize:10}}/><Tooltip/><Bar dataKey="value" fill="#a78bfa" radius={[4,4,0,0]}/></BarChart>}</ResponsiveContainer>:<div className="cat-no-data">No matching records</div>}</section>}
export default function CatalogPage({refreshKey=0,onUpdated=()=>{}}){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [channel,setChannel]=useState("all"),[vendor,setVendor]=useState("all"),[category,setCategory]=useState("all"),[status,setStatus]=useState("all"),[stockStatus,setStockStatus]=useState("all");
 const [dates,setDates]=useState(()=>rangePreset("30")),[applyDates,setApplyDates]=useState(false),[period,setPeriod]=useState("month"),[breakdown,setBreakdown]=useState("sku"),[query,setQuery]=useState(""),[page,setPage]=useState(1);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");fetch("/api/catalog",{signal:controller.signal,method:refreshKey?"POST":"GET",headers:refreshKey?{"X-Manual-Refresh":"1"}:{}}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error||"Catalog source unavailable.");const r=body?.query_result?.data?.rows??body?.query_result?.rows??body?.data?.rows??body?.rows??body?.catalog;if(!Array.isArray(r))throw Error("Query 266 did not return a Redash rows array.");setRows(r.filter(x=>skuKey(x)));onUpdated(new Date().toISOString());}).catch(e=>{if(e.name!=="AbortError")setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort();},[refreshKey]);
 const channels=useMemo(()=>unique(rows,"channel_name_en").sort(),[rows]),vendors=useMemo(()=>unique(rows,"vendor_name_en").sort(),[rows]),categories=useMemo(()=>[...new Set(rows.flatMap(categoriesFor))].sort(),[rows]);
 const datesMatch=r=>{const d=createdDate(r);return !!d && (!dates.start||d>=dates.start)&&(!dates.end||d<=dates.end);};
 const selected=useMemo(()=>rows.filter(r=>(channel==="all"||str(r.channel_name_en)===channel)&&(vendor==="all"||str(r.vendor_name_en)===vendor)&&(category==="all"||categoriesFor(r).includes(category))&&(status==="all"||(status==="active"?active(r):!active(r)))&&(stockStatus==="all"||(stockStatus==="in"?n(r.stock)>0:n(r.stock)<=0))&&(!applyDates||datesMatch(r))),[rows,channel,vendor,category,status,stockStatus,applyDates,dates]);
 // A SKU may be repeated per vendor/channel. Only SKU-level rows contribute stock and sales.
 const skuRows=useMemo(()=>[...new Map(selected.map(r=>[skuKey(r),r])).values()], [selected]);
 const created=useMemo(()=>[...new Map(selected.filter(datesMatch).map(r=>[skuKey(r),r])).values()],[selected,dates]);
 const listings=useMemo(()=>new Set(selected.map(r=>[skuKey(r),str(r.vendor_name_en),str(r.channel_name_en)].join("\u0001"))).size,[selected]);
 const channelData=useMemo(()=>group(selected,r=>str(r.channel_name_en)).map(([name,entries])=>{const distinctSkus=[...new Map(entries.map(r=>[skuKey(r),r])).values()];return {name,skus:distinctSkus.length,listings:new Set(entries.map(r=>skuKey(r)+"|"+str(r.vendor_name_en))).size,active:distinctSkus.filter(active).length,listedStock:distinctSkus.reduce((s,r)=>s+n(r.stock),0)};}).sort((a,b)=>b.skus-a.skus),[selected]);
 const createdGroups=useMemo(()=>{if(breakdown==="category"){const buckets=new Map();created.forEach(r=>{const cats=categoriesFor(r);for(const cat of cats.length?cats:["Uncategorized"]){if(!buckets.has(cat))buckets.set(cat,new Set());buckets.get(cat).add(skuKey(r));}});return [...buckets].map(([name,v])=>({name,value:v.size})).sort((a,b)=>b.value-a.value);}return group(created,r=>periodOf(createdDate(r),period)).map(([name,rs])=>({name,value:new Set(rs.map(skuKey)).size})).sort((a,b)=>a.name.localeCompare(b.name));},[created,breakdown,period]);
 const imageGroups=useMemo(()=>["0 images","1 image","2–4 images","5+ images"].map((name,index)=>({name,value:skuRows.filter(r=>active(r)&&([c=>c===0,c=>c===1,c=>c>=2&&c<=4,c=>c>=5][index])(imageCount(r))).length})),[skuRows]);
 const searchable=useMemo(()=>selected.filter(r=>[r.product_name_en,r.sku_code,r.assr_sku_id,r.vendor_name_en,r.channel_name_en,r.category_en,r.subcategory_en].some(v=>str(v).toLowerCase().includes(query.toLowerCase()))),[selected,query]);
 useEffect(()=>setPage(1),[query,selected]);
 const shown=searchable.slice((page-1)*25,page*25),pages=Math.max(1,Math.ceil(searchable.length/25));
 if(loading)return <div className="empty-page"><RefreshCw className="spin"/><h2>Loading Catalog</h2><p>Retrieving Redash Query 266…</p></div>;
 if(error)return <div className="empty-page error-state"><h2>Catalog data unavailable</h2><p>{error}</p><p>Check Cloudflare secret REDASH_CHANNEL_PRODUCTS_QUERY_URL and Redash Query 266.</p></div>;
 return <div className="cat-page">
  <section className="filter-card cat-filters">
   <div className="cat-presets"><strong>Created date</strong>{[["all","All time"],["30","Last 30 days"],["month","This month"],["last","Last month"]].map(([key,title])=><button key={key} onClick={()=>setDates(rangePreset(key))}>{title}</button>)}</div>
   <div className="cat-filter-grid">
    <label className="cat-field"><span>From</span><input type="date" value={dates.start} onChange={e=>setDates(d=>({...d,start:e.target.value}))}/></label>
    <label className="cat-field"><span>To</span><input type="date" value={dates.end} onChange={e=>setDates(d=>({...d,end:e.target.value}))}/></label>
    {select("Channel",channel,setChannel,["all",...channels])}
    {select("Vendor",vendor,setVendor,["all",...vendors])}
    
    {select("Category",category,setCategory,["all",...categories])}
    {select("Product status",status,setStatus,["all","active","inactive"])}
    {select("Stock status",stockStatus,setStockStatus,["all","in","out"])}
   </div>
   <p className="cat-footnote">The creation-date range filters New SKUs and the Created Products chart by default. To filter every KPI and listing by creation date, check the option below.</p>
   <label className="cat-date-toggle"><input type="checkbox" checked={applyDates} onChange={e=>setApplyDates(e.target.checked)}/> Apply creation dates to all KPIs and the product table (otherwise dates only affect New SKUs and Created Products)</label>
   <div className="cat-toggle-row"><button type="button" onClick={()=>{setChannel("all");setVendor("all");setCategory("all");setStatus("all");setStockStatus("all");setDates(rangePreset("30"));setApplyDates(false);setQuery("");}}>Reset all filters</button><span>Chart period</span>{["day","week","month"].map(x=><button className={period===x?"selected":""} onClick={()=>setPeriod(x)} key={x}>{x}</button>)}<span className="cat-spaced">Breakdown</span>{["sku","category"].map(x=><button key={x} className={breakdown===x?"selected":""} onClick={()=>setBreakdown(x)}>{x==="sku"?"By SKU / date":"By category"}</button>)}</div>
  </section>
  <div className="cat-kpis">
   <Metric label="Unique SKUs" value={number.format(skuRows.length)} detail="Distinct assr_sku_id"/>
   
   <Metric label="Channel listings" value={number.format(listings)} detail="Unique SKU × vendor × channel"/>
   <Metric label="New SKUs" value={number.format(created.length)} detail="Created in selected date range · product_created_at"/>
   <Metric label="Active SKUs" value={number.format(skuRows.filter(active).length)} detail={number.format(skuRows.filter(r=>!active(r)).length)+" inactive"}/>
   <Metric label="Available SKU stock" value={number.format(skuRows.filter(active).reduce((s,r)=>s+n(r.stock),0))} detail="Active SKU stock; counted once"/>
   <Metric label="Quantity sold" value={number.format(skuRows.reduce((s,r)=>s+n(r.qty_sold),0))} detail="SKU-wide sales, not channel attributed"/>
   <Metric label="Ordered amount" value={sar.format(skuRows.reduce((s,r)=>s+n(r.ordered_amount),0))} detail="SKU-wide, not channel attributed"/>
   <Metric label="Active · 1 image" value={number.format(skuRows.filter(r=>active(r)&&imageCount(r)===1).length)} detail="Unique active SKUs"/>
   <Metric label="Active · no images" value={number.format(skuRows.filter(r=>active(r)&&imageCount(r)===0).length)} detail="Image quality alert"/>
  </div>
  <div className="cat-two">
   <Plot title={breakdown==="category"?"Created SKUs by category":"Created SKUs over time"} data={createdGroups} type={breakdown==="sku"?"line":"bar"}/>
   <Plot title="Unique SKUs per channel" data={channelData.map(x=>({name:x.name,value:x.skus}))}/>
   <Plot title="Active SKUs per channel" data={channelData.map(x=>({name:x.name,value:x.active}))}/>
   <Plot title="Image coverage — active SKUs" data={imageGroups}/>
  </div>
  <section className="card cat-table-card"><div className="card-head"><div><h2>Channel distribution</h2><p>Stock is SKU stock associated with listed channels, not allocated channel inventory. Do not sum stock across channels.</p></div></div>
  <div className="table-wrap"><table><thead><tr><th>Channel</th><th>Unique SKUs</th><th>Listings</th><th>Active SKUs</th><th>Listed SKU stock*</th><th>Quantity sold / amount</th></tr></thead><tbody>{channelData.map(r=><tr key={r.name}><td>{r.name}</td><td>{number.format(r.skus)}</td><td>{number.format(r.listings)}</td><td>{number.format(r.active)}</td><td>{number.format(r.listedStock)}</td><td title="Query 266 has no transaction-to-channel attribution">Not available</td></tr>)}</tbody></table></div>
  <p className="cat-footnote">* A SKU listed on multiple channels contributes to each channel's listed-stock view. For actual channel inventory and sales, extend Query 266 with vendor/channel-level stock and transaction mapping.</p></section>
  <section className="card cat-table-card"><div className="card-head"><div><h2>Product explorer</h2><p>Each vendor/channel offer is shown separately. {number.format(searchable.length)} matching rows.</p></div><div className="cat-table-actions"><label className="search-field"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products"/></label><button onClick={()=>csvDownload(searchable)}><Download size={15}/> Export CSV</button></div></div>
   <div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Brand / category</th><th>Vendor</th><th>Channel</th><th>Price</th><th>Stock*</th><th>Status</th><th>Images</th></tr></thead><tbody>{shown.map((r,i)=><tr key={skuKey(r)+"|"+str(r.vendor_name_en)+"|"+str(r.channel_name_en)+"|"+i}><td>{str(r.product_name_en)||"—"}</td><td>{str(r.sku_code)||skuKey(r)}</td><td>{str(r.category_en)||"—"}<br/><small>{str(r.subcategory_en)}</small></td><td>{str(r.vendor_name_en)}</td><td>{str(r.channel_name_en)}</td><td>{sar.format(n(r.channel_price))}</td><td>{number.format(n(r.stock))}</td><td>{active(r)?"Active":"Inactive"}</td><td>{imageCount(r)}</td></tr>)}</tbody></table></div>
   <div className="cat-pages"><span>Page {page} of {pages}</span><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  </section>
  <p className="cat-footnote">Catalog scope: only non-deleted SKUs with vendor offers and channel enablement; JD.com is excluded by Query 266. SKU-level sales use the query's full historical aggregation and are not attributed to individual channels or vendors. Created date filters are independent of transaction dates.</p>
 </div>;
}
