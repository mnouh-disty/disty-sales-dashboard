import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign,
  Download, Filter, LayoutDashboard, ListFilter, RefreshCw, Search, Settings2,
  ShoppingCart, Tags, Users, WalletCards, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import "./styles.css";

const PURPLE = "#511DCE";
const COLORS = [PURPLE, "#8357E8", "#A989F1", "#CDBAF8", "#E9E0FF", "#301080"];
const CANCELLED = new Set(["cancelled", "canceled", "rejected", "failed", "deleted"]);
const money = new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 2 });
const integer = new Intl.NumberFormat("en-SA");
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Riyadh" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const percent = (part, whole) => `${whole ? (part / whole) * 100 : 0}`.replace(/(\.\d).*/, "$1") + "%";
const isoDate = (value) => new Date(value).toISOString().slice(0, 10);
const unique = (rows, key) => [...new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const downloadCsv = (filename, columns, rows) => {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const content = [columns.map((c) => escape(c.label)), ...rows.map((row) => columns.map((c) => escape(c.value(row))))]
    .map((line) => line.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
};

function MultiSelect({ label, options, values, onChange, searchable = false }) {
  const [query, setQuery] = useState("");
  const visible = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));
  const toggle = (option) => onChange(values.includes(option) ? values.filter((item) => item !== option) : [...values, option]);
  return <details className="multi-select">
    <summary><span>{label}</span><strong>{values.length ? `${values.length} selected` : "All"}</strong></summary>
    <div className="multi-menu">
      {searchable && <label className="mini-search"><Search size={14}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}`}/></label>}
      {values.length > 0 && <button className="clear-selection" onClick={() => onChange([])}>Clear selection</button>}
      <div className="option-list">{visible.map((option) => <label key={option} className="check-option">
        <input type="checkbox" checked={values.includes(option)} onChange={() => toggle(option)}/><span className="fake-check"><Check size={12}/></span><span>{option}</span>
      </label>)}</div>
      {!visible.length && <p className="muted small">No matches</p>}
    </div>
  </details>;
}

function KpiCard({ icon: Icon, label, value, note, tone = "purple" }) {
  return <article className="kpi-card">
    <div className={`kpi-icon ${tone}`}><Icon size={20}/></div>
    <div><p className="eyebrow">{label}</p><h3>{value}</h3><p className="kpi-note">{note}</p></div>
  </article>;
}

function Card({ title, subtitle, action, children, className = "" }) {
  return <section className={`card ${className}`}><header className="card-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>;
}

function EmptyChart({ text = "No data for the current filters." }) { return <div className="empty-chart"><BarChart3 size={30}/><span>{text}</span></div>; }

const chartTooltip = ({ active, payload, label }) => active && payload?.length ? <div className="chart-tooltip"><strong>{label ?? payload[0]?.name}</strong>{payload.map((item) => <p key={item.dataKey || item.name}><span style={{ background: item.color }}/>{item.name}: {item.dataKey?.includes("value") || item.name?.toLowerCase().includes("value") ? money.format(item.value) : integer.format(item.value)}</p>)}</div> : null;

function DonutAnalysis({ title, usedLabel, rows, predicate, amountKey }) {
  const used = rows.filter(predicate);
  const amount = used.reduce((sum, row) => sum + number(row[amountKey]), 0);
  const data = [{ name: usedLabel, value: used.length }, { name: `Orders without ${title.split(" ")[0].toLowerCase()}`, value: rows.length - used.length }];
  return <Card title={title} subtitle="Distinct orders in the filtered result">
    <div className="donut-layout">
      <div className="donut-wrap">{rows.length ? <ResponsiveContainer width="100%" height={225}><PieChart><Pie data={data} dataKey="value" innerRadius={60} outerRadius={88} paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={i ? "#E6E8EF" : PURPLE}/>)}</Pie><Tooltip content={chartTooltip}/></PieChart></ResponsiveContainer> : <EmptyChart/>}<div className="donut-center"><strong>{percent(used.length, rows.length)}</strong><span>of orders</span></div></div>
      <div className="analysis-stats"><div><span>{usedLabel}</span><strong>{integer.format(used.length)}</strong></div><div><span>Share of orders</span><strong>{percent(used.length, rows.length)}</strong></div><div><span>Total amount</span><strong>{money.format(amount)}</strong></div><div><span>Average per matching order</span><strong>{money.format(used.length ? amount / used.length : 0)}</strong></div></div>
    </div>
  </Card>;
}

function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  return <div className="pagination"><span>Showing {start}–{end} of {total}</span><div><select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}><option>10</option><option>20</option><option>50</option></select><button disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16}/></button><span>Page {page} of {pages}</span><button disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16}/></button></div></div>;
}

function DataTable({ columns, rows, sort, onSort, empty = "No rows match the current view." }) {
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key} onClick={() => column.sortable !== false && onSort?.(column.key)} className={column.sortable === false ? "" : "sortable"}>{column.label}{sort?.key === column.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.__key ?? row.order_id ?? index}>{columns.map((column) => <td key={column.key} className={column.className || ""}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}{!rows.length && <tr><td colSpan={columns.length}><div className="table-empty">{empty}</div></td></tr>}</tbody></table></div>;
}

function aggregateCustomers(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = `${row.erp_id}::${row.customer_name}`;
    const item = map.get(key) || { __key: key, customer_name: row.customer_name || "Unknown", erp_id: row.erp_id, cities: new Set(), orders: 0, subtotal: 0, total: 0, discount: 0, discounted_orders: 0, wallet: 0, wallet_orders: 0, last: row.created_at };
    item.cities.add(row.city || "Unknown"); item.orders += 1; item.subtotal += number(row.subtotal); item.total += number(row.total); item.discount += number(row.discount); item.wallet += number(row.wallet_amount_used);
    if (number(row.discount) > 0) item.discounted_orders += 1;
    if (number(row.wallet_amount_used) > 0) item.wallet_orders += 1;
    if (new Date(row.created_at) > new Date(item.last)) item.last = row.created_at;
    map.set(key, item);
  });
  return [...map.values()].map((item) => ({ ...item, city: [...item.cities].join(", "), average: item.orders ? item.total / item.orders : 0 })).sort((a, b) => b.total - a.total).map((item, index) => ({ ...item, rank: index + 1 }));
}

const groupRows = (rows, key, valueKey = null) => {
  const map = new Map();
  rows.forEach((row) => { const label = String(row[key] || "Unknown"); map.set(label, (map.get(label) || 0) + (valueKey ? number(row[valueKey]) : 1)); });
  return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

function App() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const initialFilters = { start: "", end: "", months: [], customers: [], erps: [], cities: [], sources: [], paymentMethods: [], paymentStatuses: [], orderTypes: [], orderStates: [], mada: "all", discount: "all", wallet: "all", includeExcluded: false };
  const [filters, setFilters] = useState(initialFilters);
  const [period, setPeriod] = useState("month");
  const [topN, setTopN] = useState("10");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSort, setCustomerSort] = useState({ key: "total", dir: "desc" });
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPageSize, setCustomerPageSize] = useState(10);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderSort, setOrderSort] = useState({ key: "created_at", dir: "desc" });
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState(["order_id","erp_id","customer_name","city","source","payment_method","payment_status","order_type","order_state","subtotal","total","discount","wallet_amount_used","created_at","is_mada"]);

  const load = async (manual = false) => {
    manual ? setRefreshing(true) : setStatus("loading"); setError("");
    try {
      const response = await fetch("/api/orders", { method: manual ? "POST" : "GET", headers: manual ? { "X-Manual-Refresh": "1" } : {} });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not load orders.");
      const next = Array.isArray(payload.orders) ? payload.orders : [];
      setOrders(next); setUpdatedAt(payload.updatedAt || new Date().toISOString()); setStatus(next.length ? "ready" : "empty");
    } catch (err) { setError(err.message || "Could not load orders."); setStatus("error"); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  const options = useMemo(() => ({ months: unique(orders, "year_month"), customers: unique(orders, "customer_name"), erps: unique(orders, "erp_id"), cities: unique(orders, "city"), sources: unique(orders, "source"), paymentMethods: unique(orders, "payment_method"), paymentStatuses: unique(orders, "payment_status"), orderTypes: unique(orders, "order_type"), orderStates: unique(orders, "order_state") }), [orders]);
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const filtered = useMemo(() => orders.filter((row) => {
    const created = isoDate(row.created_at); const state = String(row.order_state || "").toLowerCase();
    if (!filters.includeExcluded && CANCELLED.has(state)) return false;
    if (filters.start && created < filters.start) return false;
    if (filters.end && created > filters.end) return false;
    const selections = [["months","year_month"],["customers","customer_name"],["erps","erp_id"],["cities","city"],["sources","source"],["paymentMethods","payment_method"],["paymentStatuses","payment_status"],["orderTypes","order_type"],["orderStates","order_state"]];
    if (selections.some(([filterKey, rowKey]) => filters[filterKey].length && !filters[filterKey].includes(String(row[rowKey] ?? "")))) return false;
    if (filters.mada === "mada" && row.is_mada !== true) return false;
    if (filters.mada === "non" && row.is_mada !== false) return false;
    if (filters.mada === "unknown" && row.is_mada !== null) return false;
    if (filters.discount === "with" && number(row.discount) <= 0) return false;
    if (filters.discount === "without" && number(row.discount) > 0) return false;
    if (filters.wallet === "with" && number(row.wallet_amount_used) <= 0) return false;
    if (filters.wallet === "without" && number(row.wallet_amount_used) > 0) return false;
    return true;
  }), [orders, filters]);

  const setPreset = (preset) => {
    const dates = orders.map((o) => new Date(o.created_at)).filter((d) => !Number.isNaN(d)); const latest = dates.length ? new Date(Math.max(...dates)) : new Date();
    let start = new Date(latest); let end = new Date(latest);
    if (preset === "today") {}
    if (preset === "7") start.setDate(start.getDate() - 6);
    if (preset === "30") start.setDate(start.getDate() - 29);
    if (preset === "month") start = new Date(latest.getFullYear(), latest.getMonth(), 1);
    if (preset === "lastMonth") { start = new Date(latest.getFullYear(), latest.getMonth() - 1, 1); end = new Date(latest.getFullYear(), latest.getMonth(), 0); }
    if (preset === "year") start = new Date(latest.getFullYear(), 0, 1);
    setFilters((current) => ({ ...current, start: isoDate(start), end: isoDate(end) }));
  };

  const totals = useMemo(() => ({ total: filtered.reduce((s, r) => s + number(r.total), 0), discount: filtered.reduce((s, r) => s + number(r.discount), 0), wallet: filtered.reduce((s, r) => s + number(r.wallet_amount_used), 0), discounted: filtered.filter((r) => number(r.discount) > 0).length, walletOrders: filtered.filter((r) => number(r.wallet_amount_used) > 0).length }), [filtered]);
  const trend = useMemo(() => {
    const map = new Map();
    filtered.forEach((row) => { const date = new Date(row.created_at); let key;
      if (period === "day") key = isoDate(date);
      else if (period === "week") key = `${date.getFullYear()} · W${String(row.week_number || "?").padStart(2,"0")}`;
      else key = row.year_month || isoDate(date).slice(0,7);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map].map(([periodLabel, orders]) => ({ periodLabel, orders })).sort((a,b) => a.periodLabel.localeCompare(b.periodLabel));
  }, [filtered, period]);
  const customers = useMemo(() => aggregateCustomers(filtered), [filtered]);
  const displayedCustomers = useMemo(() => customers.filter((c) => `${c.customer_name} ${c.erp_id}`.toLowerCase().includes(customerSearch.toLowerCase())), [customers, customerSearch]);
  const customerSorted = useMemo(() => [...displayedCustomers].sort((a,b) => { const av=a[customerSort.key], bv=b[customerSort.key]; const result = typeof av === "number" ? av-bv : String(av).localeCompare(String(bv)); return customerSort.dir === "asc" ? result : -result; }), [displayedCustomers, customerSort]);
  const topCustomers = (topN === "all" ? customers : customers.slice(0, Number(topN))).slice().reverse();
  const customerPageRows = customerSorted.slice((customerPage-1)*customerPageSize, customerPage*customerPageSize);
  const sortCustomer = (key) => setCustomerSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  useEffect(() => setCustomerPage(1), [customerSearch, customerPageSize, filters]);

  const searchedOrders = useMemo(() => filtered.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(orderSearch.toLowerCase()))), [filtered, orderSearch]);
  const sortedOrders = useMemo(() => [...searchedOrders].sort((a,b) => { const av=a[orderSort.key], bv=b[orderSort.key]; const result = ["subtotal","total","discount","wallet_amount_used"].includes(orderSort.key) ? number(av)-number(bv) : String(av ?? "").localeCompare(String(bv ?? "")); return orderSort.dir === "asc" ? result : -result; }), [searchedOrders, orderSort]);
  const orderPageRows = sortedOrders.slice((orderPage-1)*orderPageSize, orderPage*orderPageSize);
  const sortOrder = (key) => setOrderSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  useEffect(() => setOrderPage(1), [orderSearch, orderPageSize, filters]);

  const customerColumns = [
    { key:"rank", label:"Rank" }, { key:"customer_name", label:"Customer" }, { key:"erp_id", label:"ERP ID" }, { key:"city", label:"City" },
    { key:"orders", label:"Orders" }, { key:"subtotal", label:"Subtotal", render:r=>money.format(r.subtotal) }, { key:"total", label:"Order value", render:r=>money.format(r.total) },
    { key:"average", label:"Avg. value", render:r=>money.format(r.average) }, { key:"discount", label:"Discount", render:r=>money.format(r.discount) }, { key:"discounted_orders", label:"Discounted" },
    { key:"wallet", label:"Wallet used", render:r=>money.format(r.wallet) }, { key:"wallet_orders", label:"Wallet orders" }, { key:"last", label:"Last order", render:r=>dateFmt.format(new Date(r.last)) },
  ];
  const allOrderColumns = [
    { key:"order_id", label:"Order ID" }, { key:"erp_id", label:"ERP ID" }, { key:"customer_name", label:"Customer" }, { key:"city", label:"City" }, { key:"source", label:"Source" },
    { key:"payment_method", label:"Payment method" }, { key:"payment_status", label:"Payment status", render:r=><span className="status-pill">{r.payment_status || "Unknown"}</span> }, { key:"order_type", label:"Order type" }, { key:"order_state", label:"Order state" },
    { key:"subtotal", label:"Subtotal", render:r=>money.format(number(r.subtotal)) }, { key:"total", label:"Total", render:r=>money.format(number(r.total)) }, { key:"discount", label:"Discount", render:r=>money.format(number(r.discount)) },
    { key:"wallet_amount_used", label:"Wallet used", render:r=>money.format(number(r.wallet_amount_used)) }, { key:"created_at", label:"Created", render:r=>dateTimeFmt.format(new Date(r.created_at)) }, { key:"is_mada", label:"Mada", render:r=>r.is_mada === true ? "Mada" : r.is_mada === false ? "Non-Mada" : "Unknown" },
  ];
  const orderColumns = allOrderColumns.filter((c) => visibleColumns.includes(c.key));
  const exportColumns = (columns) => columns.map((c) => ({ label:c.label, value:(r)=> c.key === "is_mada" ? (r.is_mada === true ? "Mada" : r.is_mada === false ? "Non-Mada" : "Unknown") : r[c.key] }));

  if (status === "loading") return <div className="state-screen"><div className="brand-mark">D</div><RefreshCw className="spin"/><h1>Loading sales analytics</h1><p>Retrieving the latest protected Redash result…</p></div>;
  if (status === "error") return <div className="state-screen"><div className="brand-mark">D</div><div className="error-icon"><X/></div><h1>We couldn’t load the dashboard</h1><p>{error}</p><button className="primary" onClick={() => load()}><RefreshCw size={16}/>Retry</button></div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="logo"><span>D</span><div><strong>disty</strong><small>Sales analytics</small></div></div><nav><a className="active"><LayoutDashboard size={18}/>Overview</a><a href="#customers"><Users size={18}/>Customers</a><a href="#orders"><ShoppingCart size={18}/>Orders</a></nav><div className="sidebar-foot"><span className="live-dot"/>Live Redash data</div></aside>
    <main className="dashboard">
      <header className="topbar"><div><p className="breadcrumb">Analytics / Sales overview</p><h1>Sales Analytics</h1><p>Monitor order performance, customer value and payment behavior.</p></div><div className="top-actions"><div className="updated"><span className="live-dot"/><div><small>Last updated</small><strong>{updatedAt ? dateTimeFmt.format(new Date(updatedAt)) : "—"}</strong></div></div><button className="refresh" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""}/>{refreshing ? "Refreshing" : "Refresh data"}</button></div></header>

      {status === "empty" ? <div className="empty-page"><ShoppingCart size={36}/><h2>No orders returned</h2><p>The Redash query completed successfully but returned no valid order rows.</p><button className="primary" onClick={() => load(true)}><RefreshCw size={16}/>Refresh data</button></div> : <>
      <section className="filter-card"><button className="filter-title" onClick={() => setFiltersOpen(!filtersOpen)}><span><ListFilter size={18}/>Global filters</span><span>{filtersOpen ? "Hide filters" : "Show filters"}</span></button>{filtersOpen && <div className="filter-body">
        <div className="preset-row"><span>Quick range</span>{[["today","Today"],["7","Last 7 days"],["30","Last 30 days"],["month","This month"],["lastMonth","Last month"],["year","This year"]].map(([key,label])=><button key={key} onClick={()=>setPreset(key)}>{label}</button>)}</div>
        <div className="filter-grid"><label className="date-field"><span>Start date</span><input type="date" value={filters.start} onChange={(e)=>setFilter("start",e.target.value)}/></label><label className="date-field"><span>End date</span><input type="date" value={filters.end} onChange={(e)=>setFilter("end",e.target.value)}/></label>
          <MultiSelect label="Month" options={options.months} values={filters.months} onChange={(v)=>setFilter("months",v)}/><MultiSelect label="Customer" searchable options={options.customers} values={filters.customers} onChange={(v)=>setFilter("customers",v)}/><MultiSelect label="ERP ID" searchable options={options.erps} values={filters.erps} onChange={(v)=>setFilter("erps",v)}/><MultiSelect label="City" options={options.cities} values={filters.cities} onChange={(v)=>setFilter("cities",v)}/><MultiSelect label="Source" options={options.sources} values={filters.sources} onChange={(v)=>setFilter("sources",v)}/><MultiSelect label="Payment method" options={options.paymentMethods} values={filters.paymentMethods} onChange={(v)=>setFilter("paymentMethods",v)}/><MultiSelect label="Payment status" options={options.paymentStatuses} values={filters.paymentStatuses} onChange={(v)=>setFilter("paymentStatuses",v)}/><MultiSelect label="Order type" options={options.orderTypes} values={filters.orderTypes} onChange={(v)=>setFilter("orderTypes",v)}/><MultiSelect label="Order state" options={options.orderStates} values={filters.orderStates} onChange={(v)=>setFilter("orderStates",v)}/>
          <label className="select-field"><span>Mada status</span><select value={filters.mada} onChange={(e)=>setFilter("mada",e.target.value)}><option value="all">All</option><option value="mada">Mada</option><option value="non">Non-Mada</option><option value="unknown">Unknown</option></select></label><label className="select-field"><span>Discount usage</span><select value={filters.discount} onChange={(e)=>setFilter("discount",e.target.value)}><option value="all">All orders</option><option value="with">With discount</option><option value="without">Without discount</option></select></label><label className="select-field"><span>Wallet usage</span><select value={filters.wallet} onChange={(e)=>setFilter("wallet",e.target.value)}><option value="all">All orders</option><option value="with">Wallet used</option><option value="without">Wallet not used</option></select></label>
        </div><div className="filter-footer"><label className="toggle"><input type="checkbox" checked={filters.includeExcluded} onChange={(e)=>setFilter("includeExcluded",e.target.checked)}/><span/>Include cancelled, rejected, failed and deleted orders</label><button className="reset" onClick={()=>setFilters(initialFilters)}><X size={15}/>Reset filters</button></div>
      </div>}</section>

      <section className="kpi-grid"><KpiCard icon={ShoppingCart} label="Total orders" value={integer.format(filtered.length)} note="Distinct order IDs"/><KpiCard icon={CircleDollarSign} label="Total order value" value={money.format(totals.total)} note="Across filtered orders" tone="blue"/><KpiCard icon={BarChart3} label="Average order value" value={money.format(filtered.length ? totals.total/filtered.length : 0)} note="Per distinct order" tone="pink"/><KpiCard icon={Tags} label="Orders with discount" value={integer.format(totals.discounted)} note={`${percent(totals.discounted,filtered.length)} · ${money.format(totals.discount)}`} tone="orange"/><KpiCard icon={WalletCards} label="Orders using wallet" value={integer.format(totals.walletOrders)} note={`${percent(totals.walletOrders,filtered.length)} · ${money.format(totals.wallet)}`} tone="green"/></section>

      <Card title="Orders by Month" subtitle="Distinct order volume over time" action={<div className="segmented">{["month","week","day"].map((v)=><button className={period===v?"active":""} onClick={()=>setPeriod(v)} key={v}>{v[0].toUpperCase()+v.slice(1)}ly</button>)}</div>}>
        <div className="main-chart">{trend.length ? <ResponsiveContainer width="100%" height={320}><BarChart data={trend} margin={{top:20,right:10,left:-12,bottom:10}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E8EE"/><XAxis dataKey="periodLabel" tick={{fontSize:11,fill:"#727586"}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fontSize:11,fill:"#727586"}} axisLine={false} tickLine={false}/><Tooltip content={chartTooltip}/><Bar dataKey="orders" name="Orders" fill={PURPLE} radius={[6,6,0,0]} maxBarSize={44}/></BarChart></ResponsiveContainer> : <EmptyChart/>}</div>
      </Card>

      <div className="two-col"><DonutAnalysis title="Discount Usage" usedLabel="Orders with discount" rows={filtered} predicate={(r)=>number(r.discount)>0} amountKey="discount"/><DonutAnalysis title="Wallet Usage" usedLabel="Orders using wallet" rows={filtered} predicate={(r)=>number(r.wallet_amount_used)>0} amountKey="wallet_amount_used"/></div>

      <Card id="customers" title="Top Customers" subtitle="Ranked by total order value using ERP ID and customer name" action={<select className="compact-select" value={topN} onChange={(e)=>setTopN(e.target.value)}><option value="10">Top 10</option><option value="20">Top 20</option><option value="50">Top 50</option><option value="all">All customers</option></select>}>
        <div className="customer-chart">{topCustomers.length ? <ResponsiveContainer width="100%" height={Math.max(320,topCustomers.length*34)}><BarChart data={topCustomers} layout="vertical" margin={{left:20,right:35}}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7E8EE"/><XAxis type="number" tickFormatter={(v)=>`${Math.round(v/1000)}k`} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="customer_name" width={160} tick={{fontSize:11}} axisLine={false} tickLine={false}/><Tooltip content={({active,payload})=>active&&payload?.length?<div className="chart-tooltip"><strong>{payload[0].payload.customer_name}</strong><p>Total value: {money.format(payload[0].payload.total)}</p><p>Orders: {payload[0].payload.orders}</p><p>Average: {money.format(payload[0].payload.average)}</p></div>:null}/><Bar dataKey="total" name="Order value" fill={PURPLE} radius={[0,6,6,0]} maxBarSize={22}/></BarChart></ResponsiveContainer> : <EmptyChart/>}</div>
      </Card>

      <Card title="Customer Details" subtitle="Complete customer performance for the current filters" action={<div className="table-actions"><label className="search-field"><Search size={15}/><input value={customerSearch} onChange={(e)=>setCustomerSearch(e.target.value)} placeholder="Search customer or ERP ID"/></label><button onClick={()=>downloadCsv("disty-customers.csv",exportColumns(customerColumns),customerSorted)}><Download size={15}/>Export CSV</button></div>}>
        <DataTable columns={customerColumns} rows={customerPageRows} sort={customerSort} onSort={sortCustomer}/><Pagination page={customerPage} pageSize={customerPageSize} total={customerSorted.length} onPage={setCustomerPage} onPageSize={(n)=>{setCustomerPageSize(n);setCustomerPage(1)}}/>
      </Card>

      <section><div className="section-heading"><div><h2>Order Breakdown</h2><p>Every chart follows the active global filters.</p></div></div><div className="breakdown-grid">{[["Orders by city","city",false],["Orders by source","source",false],["Orders by payment method","payment_method",false],["Orders by order type","order_type",false],["Orders by order state","order_state",false],["Total order value by source","source",true]].map(([title,key,isValue])=>{const data=groupRows(filtered,key,isValue?"total":null).slice(0,12);return <Card key={title} title={title}>{data.length?<ResponsiveContainer width="100%" height={250}><BarChart data={data} margin={{top:15,right:12,left:isValue?8:-15,bottom:35}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E8EE"/><XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} tick={{fontSize:10}} axisLine={false} tickLine={false}/><YAxis tickFormatter={(v)=>isValue?`${Math.round(v/1000)}k`:v} tick={{fontSize:10}} axisLine={false} tickLine={false}/><Tooltip content={chartTooltip}/><Bar dataKey="value" name={isValue?"Order value":"Orders"} fill={isValue?"#8357E8":PURPLE} radius={[5,5,0,0]} maxBarSize={34}/></BarChart></ResponsiveContainer>:<EmptyChart/>}</Card>})}</div></section>

      <Card className="orders-card" title="Order Details" subtitle="Order-level data returned by the protected endpoint" action={<div className="table-actions"><label className="search-field"><Search size={15}/><input value={orderSearch} onChange={(e)=>setOrderSearch(e.target.value)} placeholder="Search all orders"/></label><details className="column-menu"><summary><Settings2 size={15}/>Columns</summary><div>{allOrderColumns.map((c)=><label key={c.key}><input type="checkbox" checked={visibleColumns.includes(c.key)} onChange={()=>setVisibleColumns((current)=>current.includes(c.key)?current.filter((v)=>v!==c.key):[...current,c.key])}/>{c.label}</label>)}</div></details><button onClick={()=>downloadCsv("disty-orders.csv",exportColumns(orderColumns),sortedOrders)}><Download size={15}/>Export CSV</button></div>}>
        <DataTable columns={orderColumns} rows={orderPageRows} sort={orderSort} onSort={sortOrder}/><Pagination page={orderPage} pageSize={orderPageSize} total={sortedOrders.length} onPage={setOrderPage} onPageSize={(n)=>{setOrderPageSize(n);setOrderPage(1)}}/>
      </Card>
      </>}
      <footer>Disty internal analytics · Data is retrieved securely through the dashboard server.</footer>
    </main>
  </div>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
