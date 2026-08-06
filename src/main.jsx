import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3, Boxes, Check, ChevronLeft, ChevronRight, CircleDollarSign, Download,
  LayoutDashboard, ListFilter, LockKeyhole, LogOut, PackageSearch, RefreshCw,
  Search, ShoppingCart, Tags, Users, WalletCards, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import "./styles.css";
import { buildMonthlyRetention } from "./retention.js";

const PURPLE = "#511DCE";
const COLORS = [PURPLE, "#7B48E6", "#A07BEF", "#C0A6F6", "#DDD0FB", "#301080", "#2476E8", "#1AA36F"];
const CANCELLED = new Set(["cancelled", "canceled", "rejected", "failed", "deleted"]);
const money = new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 2 });
const integer = new Intl.NumberFormat("en-SA", { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Riyadh" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const pct = (value, total) => `${(total ? value / total * 100 : 0).toFixed(1)}%`;
const text = (value) => String(value ?? "").trim();
const validDate = (value) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; };
const dateOnly = (value) => validDate(value)?.toISOString().slice(0, 10) || "";
const distinct = (rows, key) => [...new Set(rows.map((row) => text(row[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const distinctCount = (rows, key) => new Set(rows.map((row) => text(row[key])).filter(Boolean)).size;
const sum = (rows, key) => rows.reduce((total, row) => total + num(row[key]), 0);
const yes = (value) => value === true || ["yes", "true", "1", "verified", "complete", "completed", "eligible"].includes(text(value).toLowerCase());
const statusBucket = (value) => {
  const status = text(value).toLowerCase();
  if (status.includes("pending")) return "Pending";
  if (status.includes("unverified") || status.includes("not verified") || !status) return "Unverified";
  if (status.includes("verified")) return "Verified";
  return text(value) || "Unverified";
};

const periodKey = (value, period) => {
  const date = validDate(value); if (!date) return "";
  if (period === "day") return date.toISOString().slice(0, 10);
  if (period === "month") return date.toISOString().slice(0, 7);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7; utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const groupMetric = (rows, dateKey, period, valueKey = null, distinctKey = null) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = periodKey(row[dateKey], period); if (!key) return;
    if (!map.has(key)) map.set(key, distinctKey ? new Set() : 0);
    if (distinctKey) map.get(key).add(text(row[distinctKey]));
    else map.set(key, map.get(key) + (valueKey ? num(row[valueKey]) : 1));
  });
  return [...map].map(([periodLabel, raw]) => ({ periodLabel, value: raw instanceof Set ? [...raw].filter(Boolean).length : raw })).sort((a, b) => a.periodLabel.localeCompare(b.periodLabel));
};

const groupCategory = (rows, key, valueKey = null, distinctKey = null) => {
  const map = new Map();
  rows.forEach((row) => {
    const label = text(row[key]) || "Unknown";
    if (!map.has(label)) map.set(label, distinctKey ? new Set() : 0);
    if (distinctKey) map.get(label).add(text(row[distinctKey]));
    else map.set(label, map.get(label) + (valueKey ? num(row[valueKey]) : 1));
  });
  return [...map].map(([name, raw]) => ({ name, value: raw instanceof Set ? [...raw].filter(Boolean).length : raw })).sort((a, b) => b.value - a.value);
};

const downloadCsv = (filename, columns, rows) => {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [columns.map((column) => escape(column.label)), ...rows.map((row) => columns.map((column) => escape(column.csv ? column.csv(row) : row[column.key])))];
  const url = URL.createObjectURL(new Blob([lines.map((line) => line.join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
};

function MultiSelect({ label, options, values, onChange, searchable = false }) {
  const [query, setQuery] = useState("");
  const visible = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));
  const toggle = (option) => onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
  return <details className="multi-select"><summary><span>{label}</span><strong>{values.length ? `${values.length} selected` : "All"}</strong></summary><div className="multi-menu">
    {searchable && <label className="mini-search"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`}/></label>}
    {!!values.length && <button className="clear-selection" onClick={() => onChange([])}>Clear selection</button>}
    <div className="option-list">{visible.map((option) => <label key={option} className="check-option"><input type="checkbox" checked={values.includes(option)} onChange={() => toggle(option)}/><span className="fake-check"><Check size={12}/></span><span>{option}</span></label>)}</div>
    {!visible.length && <p className="muted small">No matches</p>}
  </div></details>;
}

function ToggleFilter({ label, options, values, onChange }) {
  const toggle = (option) => onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
  return <div className="toggle-filter"><span>{label}</span><div role="group" aria-label={label}>
    <button type="button" className={!values.length ? "active" : ""} onClick={() => onChange([])}>All</button>
    {options.map((option) => <button type="button" key={option} className={values.includes(option) ? "active" : ""} aria-pressed={values.includes(option)} onClick={() => toggle(option)}>{option}</button>)}
  </div></div>;
}

function Card({ title, subtitle, action, children, className = "" }) {
  return <section className={`card ${className}`}><header className="card-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>;
}
function Kpi({ icon: Icon, label, value, note, tone = "purple" }) {
  return <article className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon size={20}/></div><div><p className="eyebrow">{label}</p><h3 title={value}>{value}</h3><p className="kpi-note">{note}</p></div></article>;
}
function EmptyChart({ text: message = "No data for the current filters." }) { return <div className="empty-chart"><BarChart3 size={30}/><span>{message}</span></div>; }
const chartTooltip = ({ active, payload, label }) => active && payload?.length ? <div className="chart-tooltip"><strong>{label ?? payload[0]?.payload?.name}</strong>{payload.map((item) => <p key={item.dataKey || item.name}>{item.name}: {item.name?.toLowerCase().includes("sales") || item.name?.toLowerCase().includes("value") ? money.format(item.value) : integer.format(item.value)}</p>)}</div> : null;

function TrendChart({ data, name, moneyValue = false }) {
  return data.length ? <ResponsiveContainer width="100%" height={285}><LineChart data={data} margin={{ top: 12, right: 14, left: moneyValue ? 8 : -18, bottom: 6 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E8EE"/><XAxis dataKey="periodLabel" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={(value) => moneyValue ? `${Math.round(value / 1000)}k` : value} allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip content={chartTooltip}/><Line type="monotone" dataKey="value" name={name} stroke={PURPLE} strokeWidth={2.5} dot={{ r: 3, fill: PURPLE }} activeDot={{ r: 5 }}/></LineChart></ResponsiveContainer> : <EmptyChart/>;
}

function CategoryChart({ data, name = "Orders", moneyValue = false, limit = 12 }) {
  const shown = data.slice(0, limit);
  return shown.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={shown} margin={{ top: 12, right: 10, left: moneyValue ? 6 : -18, bottom: 42 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E8EE"/><XAxis dataKey="name" angle={-24} textAnchor="end" interval={0} tick={{ fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={(value) => moneyValue ? `${Math.round(value / 1000)}k` : value} allowDecimals={false} tick={{ fontSize: 9 }} axisLine={false} tickLine={false}/><Tooltip content={chartTooltip}/><Bar dataKey="value" name={name} fill={PURPLE} radius={[5, 5, 0, 0]} maxBarSize={36}/></BarChart></ResponsiveContainer> : <EmptyChart/>;
}

function Donut({ title, data }) {
  const total = data.reduce((value, item) => value + item.value, 0);
  return <Card title={title} subtitle="Distinct orders in the filtered result"><div className="donut-layout"><div className="donut-wrap">{total ? <ResponsiveContainer width="100%" height={225}><PieChart><Pie data={data} dataKey="value" innerRadius={58} outerRadius={86} paddingAngle={2}>{data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]}/>)}</Pie><Tooltip content={chartTooltip}/><Legend verticalAlign="bottom" height={28}/></PieChart></ResponsiveContainer> : <EmptyChart/>}<div className="donut-center"><strong>{integer.format(total)}</strong><span>orders</span></div></div><div className="analysis-stats">{data.map((item) => <div key={item.name}><span>{item.name}</span><strong>{integer.format(item.value)} · {pct(item.value, total)}</strong></div>)}</div></div></Card>;
}

function DataTable({ title, subtitle, rows, columns, filename, initialSort, pageSizeDefault = 10 }) {
  const [query, setQuery] = useState(""); const [sort, setSort] = useState(initialSort || { key: columns[0].key, dir: "asc" });
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(pageSizeDefault);
  const searched = useMemo(() => rows.filter((row) => Object.values(row).some((value) => text(value).toLowerCase().includes(query.toLowerCase()))), [rows, query]);
  const sorted = useMemo(() => [...searched].sort((left, right) => { const a = left[sort.key], b = right[sort.key]; const result = typeof a === "number" || typeof b === "number" ? num(a) - num(b) : text(a).localeCompare(text(b)); return sort.dir === "asc" ? result : -result; }), [searched, sort]);
  useEffect(() => setPage(1), [query, pageSize, rows]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize)); const safePage = Math.min(page, pages); const shown = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const changeSort = (key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }));
  return <Card className="table-card" title={title} subtitle={subtitle} action={<div className="table-actions"><label className="search-field"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search table"/></label><button onClick={() => downloadCsv(filename, columns, sorted)}><Download size={15}/>Export CSV</button></div>}>
    <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key} className="sortable" onClick={() => changeSort(column.key)}>{column.label}{sort.key === column.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</th>)}</tr></thead><tbody>{shown.map((row, index) => <tr key={row.__key || row.order_id || row.customer_id || `${row.assr_sku_id}-${index}`}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : text(row[column.key]) || "—"}</td>)}</tr>)}{!shown.length && <tr><td colSpan={columns.length}><div className="table-empty">No rows match this view.</div></td></tr>}</tbody></table></div>
    <div className="pagination"><span>Showing {sorted.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}</span><div><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option>10</option><option>20</option><option>50</option></select><button disabled={safePage === 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={16}/></button><span>Page {safePage} of {pages}</span><button disabled={safePage === pages} onClick={() => setPage(safePage + 1)}><ChevronRight size={16}/></button></div></div>
  </Card>;
}

const initialFilters = { start: "", end: "", customers: [], erps: [], cities: [], sources: [], entities: [], verification: "all", paymentMethods: [], paymentStatuses: [], orderTypes: [], orderStates: [], mada: "all", discount: "all", wallet: "all", includeExcluded: false };

const riyadhParts = () => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
const calendarDate = (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const datePresetRange = (preset) => {
  if (preset === "all") return { start: "", end: "" };
  const today = riyadhParts();
  const currentStart = new Date(Date.UTC(today.year, today.month - 1, 1));
  const startOffset = preset === "last-month" ? -1 : preset === "last-3-months" ? -2 : 0;
  const start = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() + startOffset, 1));
  const end = preset === "last-month" ? new Date(Date.UTC(today.year, today.month - 1, 0)) : new Date(Date.UTC(today.year, today.month - 1, today.day));
  return { start: calendarDate(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()), end: calendarDate(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()) };
};

function GlobalFilters({ page, period, setPeriod, filters, setFilters, orders, customers, products }) {
  const [open, setOpen] = useState(true); const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const orderMode = page === "overview" || page === "orders"; const customerMode = page === "customers"; const productMode = page === "products";
  const sourceRows = customerMode ? customers : orderMode ? orders : products;
  const opts = useMemo(() => ({ customers: distinct(customerMode ? customers : orders, "customer_name"), erps: distinct(customerMode ? customers : orders, "erp_id"), cities: distinct(orders, "city"), sources: distinct(sourceRows, productMode ? "order_source" : "source"), entities: distinct(customerMode ? customers : productMode ? [...products, ...customers] : orders, "entity_type"), paymentMethods: distinct(orders, "payment_method"), paymentStatuses: distinct(orders, "payment_status"), orderTypes: distinct(orders, "order_type"), orderStates: distinct(orders, "order_state") }), [orders, customers, products, sourceRows, customerMode, productMode]);
  const applyPreset = (preset) => setFilters((current) => ({ ...current, ...datePresetRange(preset) }));
  const presetActive = (preset) => { const range = datePresetRange(preset); return filters.start === range.start && filters.end === range.end; };
  return <section className="filter-card"><button className="filter-title" onClick={() => setOpen(!open)}><span><ListFilter size={18}/>Global filters</span><span>{open ? "Hide filters" : "Show filters"}</span></button>{open && <div className="filter-body">
    <div className="preset-row"><span>Quick date:</span>{[["current-month", "Current month"], ["last-month", "Last month"], ["last-3-months", "Last 3 months"], ["all", "All time"]].map(([key, label]) => <button type="button" key={key} className={presetActive(key) ? "active" : ""} onClick={() => applyPreset(key)}>{label}</button>)}</div>
    <div className="filter-grid"><label className="date-field"><span>Start date</span><input type="date" value={filters.start} onChange={(event) => set("start", event.target.value)}/></label><label className="date-field"><span>End date</span><input type="date" value={filters.end} onChange={(event) => set("end", event.target.value)}/></label>{page !== "overview" && <label className="select-field"><span>Time view</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label>}
      {!productMode && <MultiSelect label="Customer" searchable options={opts.customers} values={filters.customers} onChange={(value) => set("customers", value)}/>} {!productMode && <MultiSelect label="ERP ID" searchable options={opts.erps} values={filters.erps} onChange={(value) => set("erps", value)}/>} {orderMode && <MultiSelect label="City" options={opts.cities} values={filters.cities} onChange={(value) => set("cities", value)}/>} {!customerMode && <MultiSelect label="Source" options={opts.sources} values={filters.sources} onChange={(value) => set("sources", value)}/>} <label className="select-field"><span>Customer verification</span><select value={filters.verification} onChange={(event) => set("verification", event.target.value)}><option value="all">All customers</option><option value="Verified">Verified</option><option value="Pending">Pending verification</option><option value="Unverified">Unverified</option></select></label> {productMode && <MultiSelect label="Order state" options={opts.orderStates} values={filters.orderStates} onChange={(value) => set("orderStates", value)}/>} {orderMode && <><MultiSelect label="Payment method" options={opts.paymentMethods} values={filters.paymentMethods} onChange={(value) => set("paymentMethods", value)}/><MultiSelect label="Payment status" options={opts.paymentStatuses} values={filters.paymentStatuses} onChange={(value) => set("paymentStatuses", value)}/><MultiSelect label="Order type" options={opts.orderTypes} values={filters.orderTypes} onChange={(value) => set("orderTypes", value)}/><MultiSelect label="Order state" options={opts.orderStates} values={filters.orderStates} onChange={(value) => set("orderStates", value)}/><label className="select-field"><span>Mada status</span><select value={filters.mada} onChange={(event) => set("mada", event.target.value)}><option value="all">All</option><option value="mada">Mada</option><option value="non">Non-Mada</option><option value="unknown">Unknown</option></select></label><label className="select-field"><span>Discount usage</span><select value={filters.discount} onChange={(event) => set("discount", event.target.value)}><option value="all">All orders</option><option value="with">With discount</option><option value="without">Without discount</option></select></label><label className="select-field"><span>Wallet usage</span><select value={filters.wallet} onChange={(event) => set("wallet", event.target.value)}><option value="all">All orders</option><option value="with">Wallet used</option><option value="without">Wallet not used</option></select></label></>}
    </div><ToggleFilter label="Customer entity" options={opts.entities} values={filters.entities} onChange={(value) => set("entities", value)}/><div className="filter-footer">{orderMode ? <label className="toggle"><input type="checkbox" checked={filters.includeExcluded} onChange={(event) => set("includeExcluded", event.target.checked)}/><span/>Include cancelled, rejected, failed and deleted orders</label> : <span/>}<button className="reset" onClick={() => setFilters(initialFilters)}><X size={15}/>Reset filters</button></div>
  </div>}</section>;
}

function useFilteredData(orders, customers, products, filters) {
  const customerById = useMemo(() => new Map(customers.map((row) => [text(row.customer_id), row])), [customers]);
  const enrichedOrders = useMemo(() => orders.map((row) => { const customer = customerById.get(text(row.customer_id)); return { ...row, entity_type: text(row.entity_type) || text(customer?.entity_type), verification_status: text(row.verification_status) || text(customer?.verification_status) }; }), [orders, customerById]);
  const orderById = useMemo(() => new Map(enrichedOrders.map((row) => [text(row.order_id), row])), [enrichedOrders]);
  const enrichedProducts = useMemo(() => products.map((row) => { const order = orderById.get(text(row.order_id)); const customer = customerById.get(text(row.customer_id || order?.customer_id)); return { ...row, customer_id: text(row.customer_id) || text(order?.customer_id), order_state: text(row.order_state) || text(order?.order_state), entity_type: text(row.entity_type) || text(order?.entity_type) || text(customer?.entity_type), verification_status: text(row.verification_status) || text(order?.verification_status) || text(customer?.verification_status) }; }), [products, orderById, customerById]);
  const ordersFiltered = useMemo(() => enrichedOrders.filter((row) => {
    const state = text(row.order_state).toLowerCase(); const date = dateOnly(row.created_at);
    if (!filters.includeExcluded && CANCELLED.has(state)) return false;
    if (filters.start && date < filters.start) return false; if (filters.end && date > filters.end) return false;
    const list = [["customers", "customer_name"], ["erps", "erp_id"], ["cities", "city"], ["sources", "source"], ["entities", "entity_type"], ["paymentMethods", "payment_method"], ["paymentStatuses", "payment_status"], ["orderTypes", "order_type"], ["orderStates", "order_state"]];
    if (list.some(([filterKey, rowKey]) => filters[filterKey].length && !filters[filterKey].includes(text(row[rowKey])))) return false;
    if (filters.verification !== "all" && statusBucket(row.verification_status) !== filters.verification) return false;
    if (filters.mada === "mada" && row.is_mada !== true) return false; if (filters.mada === "non" && row.is_mada !== false) return false; if (filters.mada === "unknown" && row.is_mada !== null) return false;
    if (filters.discount === "with" && num(row.discount) <= 0) return false; if (filters.discount === "without" && num(row.discount) > 0) return false;
    if (filters.wallet === "with" && num(row.wallet_amount_used) <= 0) return false; if (filters.wallet === "without" && num(row.wallet_amount_used) > 0) return false;
    return true;
  }), [enrichedOrders, filters]);
  const customersFiltered = useMemo(() => customers.filter((row) => { const date = dateOnly(row.registered_at); if (filters.start && date < filters.start) return false; if (filters.end && date > filters.end) return false; if (filters.customers.length && !filters.customers.includes(text(row.customer_name))) return false; if (filters.erps.length && !filters.erps.includes(text(row.erp_id))) return false; if (filters.entities.length && !filters.entities.includes(text(row.entity_type))) return false; if (filters.verification !== "all" && statusBucket(row.verification_status) !== filters.verification) return false; return true; }), [customers, filters]);
  const productsFiltered = useMemo(() => enrichedProducts.filter((row) => { const date = dateOnly(row.order_date); if (filters.start && date < filters.start) return false; if (filters.end && date > filters.end) return false; if (filters.sources.length && !filters.sources.includes(text(row.order_source))) return false; if (filters.orderStates.length && !filters.orderStates.includes(text(row.order_state))) return false; if (filters.entities.length && !filters.entities.includes(text(row.entity_type))) return false; if (filters.verification !== "all" && statusBucket(row.verification_status) !== filters.verification) return false; return true; }), [enrichedProducts, filters]);
  return { ordersFiltered, customersFiltered, productsFiltered };
}

const orderColumns = [
  ["order_id", "Order ID"], ["customer_id", "Customer ID"], ["erp_id", "ERP ID"], ["customer_name", "Customer name"], ["entity_type", "Entity type"], ["city", "City"], ["source", "Source"], ["payment_method", "Payment method"], ["payment_status", "Payment status"], ["order_type", "Order type"], ["order_state", "Order state"],
].map(([key, label]) => ({ key, label })).concat([
  { key: "subtotal", label: "Subtotal", render: (row) => money.format(num(row.subtotal)) }, { key: "total", label: "Total", render: (row) => money.format(num(row.total)) }, { key: "discount", label: "Discount", render: (row) => money.format(num(row.discount)) }, { key: "wallet_amount_used", label: "Wallet amount used", render: (row) => money.format(num(row.wallet_amount_used)) }, { key: "created_at", label: "Order date", render: (row) => validDate(row.created_at) ? dateTimeFmt.format(validDate(row.created_at)) : "—" }, { key: "is_mada", label: "Mada status", render: (row) => row.is_mada === true ? "Mada" : row.is_mada === false ? "Non-Mada" : "Unknown" },
]);
const productColumns = [
  ["item_name", "Item name"], ["product_id", "Product ID"], ["assr_sku_id", "Assr SKU ID"], ["order_id", "Order ID"], ["order_date", "Order date"], ["customer_id", "Customer ID"], ["order_source", "Order source"], ["stock", "Stock"], ["status", "Status"], ["price", "Price"], ["qty_sold", "Quantity sold"], ["product_total", "Product total"],
].map(([key, label]) => ({ key, label, render: ["price", "product_total"].includes(key) ? (row) => money.format(num(row[key])) : key === "order_date" ? (row) => validDate(row.order_date) ? dateFmt.format(validDate(row.order_date)) : "—" : undefined }));
const customerColumns = [
  ["customer_id", "Customer ID"], ["customer_name", "Customer name"], ["legal_name_en", "Legal name EN"], ["legal_name_ar", "Legal name AR"], ["erp_id", "ERP ID"], ["registered_at", "Registration date"], ["entity_type", "Entity type"], ["verification_status", "Verification status"], ["customer_status", "Customer status"], ["customer_state", "Customer state"], ["is_registered", "Registered"], ["is_eligible", "Eligible"], ["is_business_info_completed", "Business information completed"], ["is_email_verified", "Email verified"], ["business_size", "Business size"], ["employees_number", "Employees number"], ["customer_type", "Customer type"], ["payment_type", "Payment type"], ["account_manager_id", "Account manager ID"], ["acquisition_channel", "Acquisition channel"], ["verified_at", "Verified date"], ["updated_at", "Updated date"],
].map(([key, label]) => ({ key, label, render: ["registered_at", "verified_at", "updated_at"].includes(key) ? (row) => validDate(row[key]) ? dateFmt.format(validDate(row[key])) : "—" : ["is_registered", "is_eligible", "is_business_info_completed", "is_email_verified"].includes(key) ? (row) => row[key] === true ? "Yes" : row[key] === false ? "No" : "Unknown" : undefined }));

function Overview({ orders, customers, products, period, setPeriod }) {
  const sales = sum(orders, "total"); const active = distinctCount(orders, "customer_id");
  const topCustomers = groupCategory(orders, "customer_name", "total").slice(0, 10);
  const topItems = groupCategory(products, "item_name", "qty_sold").slice(0, 10);
  const periodLabel = { day: "day", week: "week", month: "month" }[period];
  return <><section className="kpi-grid overview-kpis"><Kpi icon={CircleDollarSign} label="Total sales" value={money.format(sales)} note="Filtered order total"/><Kpi icon={ShoppingCart} label="Total orders" value={integer.format(orders.length)} note="Distinct order IDs" tone="blue"/><Kpi icon={BarChart3} label="Average order value" value={money.format(orders.length ? sales / orders.length : 0)} note="Sales per order" tone="pink"/><Kpi icon={Users} label="Active customers" value={integer.format(active)} note="Distinct ordering customers" tone="green"/><Kpi icon={Users} label="New customers" value={integer.format(customers.length)} note="Registered in range"/><Kpi icon={Tags} label="Orders with discount" value={integer.format(orders.filter((row) => num(row.discount) > 0).length)} note="Distinct discounted orders" tone="orange"/><Kpi icon={WalletCards} label="Orders using wallet" value={integer.format(orders.filter((row) => num(row.wallet_amount_used) > 0).length)} note="Distinct wallet orders" tone="green"/></section>
    <section className="overview-performance"><div className="section-heading"><div><h2>Performance overview</h2><p>Switch every trend between daily, weekly and monthly grouping.</p></div><div className="segmented" aria-label="Overview time grouping">{[["day", "Day"], ["week", "Week"], ["month", "Month"]].map(([key, label]) => <button key={key} className={period === key ? "active" : ""} onClick={() => setPeriod(key)}>{label}</button>)}</div></div>
      <div className="breakdown-grid"><Card title={`Sales by ${periodLabel}`}><TrendChart data={groupMetric(orders, "created_at", period, "total")} name="Sales" moneyValue/></Card><Card title={`Orders by ${periodLabel}`}><TrendChart data={groupMetric(orders, "created_at", period, null, "order_id")} name="Orders"/></Card><Card title={`Active customers by ${periodLabel}`}><TrendChart data={groupMetric(orders, "created_at", period, null, "customer_id")} name="Active customers"/></Card><Card title={`New customers by ${periodLabel}`}><TrendChart data={groupMetric(customers, "registered_at", period, null, "customer_id")} name="New customers"/></Card></div>
      <div className="two-col"><Card title="Top customers" subtitle="By total order value"><CategoryChart data={topCustomers} name="Sales value" moneyValue/></Card><Card title="Top sold items" subtitle="By quantity sold"><CategoryChart data={topItems} name="Quantity sold"/></Card></div>
    </section><RetentionHeatmap orders={orders}/></>;
}

function RetentionHeatmap({ orders }) {
  const { rows, maxOffset } = useMemo(() => buildMonthlyRetention(orders), [orders]);
  const monthLabel = (key) => { const [year, month] = key.split("-").map(Number); return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1))); };
  const heatColor = (percentage) => percentage === 0 ? "#f4f1fc" : `rgba(81,29,206,${Math.min(.88, .16 + percentage / 125)})`;
  return <Card title="Monthly customer retention" subtitle="Customers grouped by their first order month; Month 1 shows how many ordered again the following month.">
    {rows.length ? <div className="retention-wrap"><table className="retention-table"><thead><tr><th>Customer cohort</th>{Array.from({ length: maxOffset + 1 }, (_, offset) => <th key={offset}>Month {offset}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.cohortMonth}><th><strong>{monthLabel(row.cohortMonth)}</strong><span>{integer.format(row.size)} customers</span></th>{Array.from({ length: maxOffset + 1 }, (_, offset) => { const cell = row.retention[offset]; return <td key={offset} className={!cell ? "not-available" : ""} style={cell ? { background: heatColor(cell.percentage), color: cell.percentage >= 55 ? "white" : "#301080" } : undefined} title={cell ? `${cell.retained} of ${row.size} customers` : "Not available"}>{cell ? `${cell.percentage.toFixed(1)}%` : "—"}</td>; })}</tr>)}</tbody></table></div> : <EmptyChart text="Retention needs customers with valid order dates."/>}
  </Card>;
}

function CustomersPage({ rows, period }) {
  const status = rows.map((row) => ({ ...row, __verification: statusBucket(row.verification_status) }));
  const verified = status.filter((row) => row.__verification === "Verified").length; const pending = status.filter((row) => row.__verification === "Pending").length; const unverified = status.filter((row) => row.__verification === "Unverified").length;
  return <><section className="kpi-grid"><Kpi icon={Users} label="Total registered customers" value={integer.format(rows.length)} note="Distinct customer IDs"/><Kpi icon={Users} label="New customers" value={integer.format(rows.length)} note={`Registrations in ${period} view`} tone="blue"/><Kpi icon={Check} label="Verified customers" value={integer.format(verified)} note={pct(verified, rows.length)} tone="green"/><Kpi icon={RefreshCw} label="Pending verification" value={integer.format(pending)} note={pct(pending, rows.length)} tone="orange"/><Kpi icon={X} label="Unverified customers" value={integer.format(unverified)} note={pct(unverified, rows.length)} tone="pink"/></section>
    <div className="breakdown-grid"><Card title="Customers by entity type"><CategoryChart data={groupCategory(rows, "entity_type", null, "customer_id")} name="Customers"/></Card><Card title="Customers by business size"><CategoryChart data={groupCategory(rows, "business_size", null, "customer_id")} name="Customers"/></Card><Card title="Customers by customer type"><CategoryChart data={groupCategory(rows, "customer_type", null, "customer_id")} name="Customers"/></Card><Card title="Customers by acquisition channel"><CategoryChart data={groupCategory(rows, "acquisition_channel", null, "customer_id")} name="Customers"/></Card></div>
    <Card title="Customer registration trend" subtitle={`New customers by ${period}`}><TrendChart data={groupMetric(rows, "registered_at", period, null, "customer_id")} name="New customers"/></Card>
    <DataTable title="Customer Details" subtitle="Search, sort, paginate or export registered customers" rows={rows} columns={customerColumns} filename="disty-customers.csv" initialSort={{ key: "registered_at", dir: "desc" }}/></>;
}

function OrdersPage({ rows, period }) {
  const sales = sum(rows, "total"); const discounted = rows.filter((row) => num(row.discount) > 0).length; const wallet = rows.filter((row) => num(row.wallet_amount_used) > 0).length;
  const topCustomers = groupCategory(rows, "customer_name", "total").slice(0, 10);
  const charts = [["Sales by source", "source", "total", true], ["Orders by source", "source", null, false], ["Orders by city", "city", null, false], ["Orders by entity type", "entity_type", null, false], ["Orders by payment method", "payment_method", null, false], ["Orders by payment status", "payment_status", null, false], ["Orders by order state", "order_state", null, false], ["Orders by order type", "order_type", null, false]];
  return <><section className="kpi-grid"><Kpi icon={CircleDollarSign} label="Total sales" value={money.format(sales)} note="Using total"/><Kpi icon={ShoppingCart} label="Total orders" value={integer.format(rows.length)} note="Distinct order IDs" tone="blue"/><Kpi icon={BarChart3} label="Average order value" value={money.format(rows.length ? sales / rows.length : 0)} note="Sales per order" tone="pink"/><Kpi icon={Users} label="Active customers" value={integer.format(distinctCount(rows, "customer_id"))} note="Distinct customer IDs" tone="green"/></section>
    <div className="two-col"><Card title={`Sales by ${period}`}><TrendChart data={groupMetric(rows, "created_at", period, "total")} name="Sales" moneyValue/></Card><Card title={`Orders by ${period}`}><TrendChart data={groupMetric(rows, "created_at", period)} name="Orders"/></Card></div>
    <div className="breakdown-grid">{charts.map(([title, key, valueKey, moneyValue]) => <Card key={title} title={title}><CategoryChart data={groupCategory(rows, key, valueKey, valueKey ? null : "order_id")} name={moneyValue ? "Sales value" : "Orders"} moneyValue={moneyValue}/></Card>)}</div>
    <div className="two-col"><Donut title="Discount usage" data={[{ name: "With discount", value: discounted }, { name: "Without discount", value: rows.length - discounted }]}/><Donut title="Wallet usage" data={[{ name: "Wallet used", value: wallet }, { name: "Wallet not used", value: rows.length - wallet }]}/></div>
    <Card title="Top customers" subtitle="Ranked by total order value"><CategoryChart data={topCustomers} name="Sales value" moneyValue/></Card>
    <DataTable title="Order Details" subtitle="Distinct order-level records" rows={rows} columns={orderColumns} filename="disty-orders.csv" initialSort={{ key: "created_at", dir: "desc" }}/></>;
}

function ProductsPage({ rows, period }) {
  const qty = sum(rows, "qty_sold"); const sales = sum(rows, "product_total"); const orders = distinctCount(rows, "order_id");
  return <><section className="kpi-grid"><Kpi icon={Boxes} label="Total quantity sold" value={integer.format(qty)} note="Sum of quantity sold"/><Kpi icon={CircleDollarSign} label="Total product sales" value={money.format(sales)} note="Sum of product total" tone="blue"/><Kpi icon={BarChart3} label="Average items per order" value={integer.format(orders ? qty / orders : 0)} note="Quantity per distinct order" tone="pink"/><Kpi icon={PackageSearch} label="Distinct products sold" value={integer.format(distinctCount(rows, "assr_sku_id"))} note="Distinct Assr SKU IDs" tone="green"/></section>
    <div className="two-col"><Card title="Top sold items by quantity"><CategoryChart data={groupCategory(rows, "item_name", "qty_sold")} name="Quantity sold"/></Card><Card title="Top items by sales value"><CategoryChart data={groupCategory(rows, "item_name", "product_total")} name="Sales value" moneyValue/></Card></div>
    <div className="two-col"><Card title={`Product sales by ${period}`}><TrendChart data={groupMetric(rows, "order_date", period, "product_total")} name="Product sales" moneyValue/></Card><Card title={`Quantity sold by ${period}`}><TrendChart data={groupMetric(rows, "order_date", period, "qty_sold")} name="Quantity sold"/></Card></div>
    <div className="two-col"><Card title="Products by order source"><CategoryChart data={groupCategory(rows, "order_source", "qty_sold")} name="Quantity sold"/></Card><Card title="Products by status"><CategoryChart data={groupCategory(rows, "status", null, "assr_sku_id")} name="Products"/></Card></div>
    <DataTable title="Product Details" subtitle="Deduplicated by order ID and Assr SKU ID" rows={rows} columns={productColumns} filename="disty-products.csv" initialSort={{ key: "order_date", dir: "desc" }}/></>;
}

function Login({ onAuthenticated }) {
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async (event) => { event.preventDefault(); setLoading(true); setError(""); try { const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Sign in failed."); setPassword(""); onAuthenticated(payload.expiresAt); } catch (failure) { setError(failure.message); } finally { setLoading(false); } };
  return <main className="login-screen"><section className="login-card"><div className="login-brand"><span>D</span><div><strong>disty</strong><small>Internal analytics</small></div></div><div className="login-icon"><LockKeyhole size={24}/></div><h1>Welcome back</h1><p>Enter the shared dashboard password to continue.</p><form onSubmit={submit}><label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" required autoFocus/></label>{error && <div className="login-error">{error}</div>}<button className="primary" disabled={loading}>{loading ? <RefreshCw size={16} className="spin"/> : <LockKeyhole size={16}/>} {loading ? "Signing in…" : "Sign in"}</button></form><small className="secure-note">Protected Disty dashboard · 12-hour secure session</small></section></main>;
}

function App() {
  const [auth, setAuth] = useState("checking"); const [page, setPage] = useState("overview"); const [period, setPeriod] = useState("month"); const [filters, setFilters] = useState(initialFilters);
  const [datasets, setDatasets] = useState({ orders: [], customers: [], products: [] }); const [status, setStatus] = useState("idle"); const [errors, setErrors] = useState({}); const [updatedAt, setUpdatedAt] = useState(null); const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { fetch("/api/auth/session").then((response) => setAuth(response.ok ? "authenticated" : "anonymous")).catch(() => setAuth("anonymous")); }, []);
  const load = async (manual = false) => {
    manual ? setRefreshing(true) : setStatus("loading"); setErrors({});
    const names = ["orders", "products", "customers"];
    const results = await Promise.all(names.map(async (name) => { try { const response = await fetch(`/api/${name}`, { method: manual ? "POST" : "GET", headers: manual ? { "X-Manual-Refresh": "1" } : {} }); const payload = await response.json().catch(() => ({})); if (response.status === 401) { setAuth("anonymous"); throw new Error("Your session has expired."); } if (!response.ok) throw new Error(payload.message || payload.error || `Could not load ${name}.`); return { name, rows: Array.isArray(payload[name]) ? payload[name] : [], updatedAt: payload.updatedAt }; } catch (error) { return { name, error: error.message }; } }));
    const nextErrors = {}; const nextData = { ...datasets }; let latest = null;
    results.forEach((result) => { if (result.error) nextErrors[result.name] = result.error; else { nextData[result.name] = result.rows; if (!latest || result.updatedAt > latest) latest = result.updatedAt; } });
    setDatasets(nextData); setErrors(nextErrors); if (latest) setUpdatedAt(latest); setStatus(Object.keys(nextErrors).length === names.length ? "error" : "ready"); setRefreshing(false);
  };
  useEffect(() => { if (auth === "authenticated") load(); }, [auth]);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); setDatasets({ orders: [], customers: [], products: [] }); setAuth("anonymous"); };
  const filtered = useFilteredData(datasets.orders, datasets.customers, datasets.products, filters);
  if (auth === "checking") return <div className="state-screen"><div className="brand-mark">D</div><RefreshCw className="spin"/><h1>Securing your dashboard</h1></div>;
  if (auth !== "authenticated") return <Login onAuthenticated={() => setAuth("authenticated")}/>;
  const currentRows = page === "orders" ? filtered.ordersFiltered : page === "customers" ? filtered.customersFiltered : page === "products" ? filtered.productsFiltered : filtered.ordersFiltered;
  const pageError = page === "overview" ? Object.values(errors).join(" ") : errors[page];
  const title = { overview: "Sales Analytics", customers: "Customer Analytics", orders: "Order Analytics", products: "Product Analytics" }[page];
  const subtitles = { overview: "Monitor sales, customer growth and product performance.", customers: "Understand registrations, verification and customer profiles.", orders: "Analyze commercial performance and order behavior.", products: "Track item sales, quantities and product-level performance." };
  const nav = [["overview", LayoutDashboard, "Overview"], ["customers", Users, "Customers"], ["orders", ShoppingCart, "Orders"], ["products", Boxes, "Products"]];
  return <div className="app-shell"><aside className="sidebar"><div className="logo"><span>D</span><div><strong>disty</strong><small>Sales analytics</small></div></div><nav>{nav.map(([key, Icon, label]) => <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}><Icon size={18}/>{label}</button>)}</nav><div className="sidebar-foot"><span className="live-dot"/>Protected live data</div></aside><main className="dashboard">
    <header className="topbar"><div><p className="breadcrumb">Analytics / {page}</p><h1>{title}</h1><p>{subtitles[page]}</p></div><div className="top-actions"><div className="updated"><span className="live-dot"/><div><small>Last updated</small><strong>{updatedAt ? dateTimeFmt.format(validDate(updatedAt)) : "—"}</strong></div></div><button className="refresh" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""}/>{refreshing ? "Refreshing" : "Refresh data"}</button><button className="logout" onClick={logout}><LogOut size={16}/>Logout</button></div></header>
    <GlobalFilters page={page} period={period} setPeriod={setPeriod} filters={filters} setFilters={setFilters} orders={datasets.orders} customers={datasets.customers} products={datasets.products}/>
    {status === "loading" ? <div className="empty-page"><RefreshCw size={32} className="spin"/><h2>Loading live analytics</h2><p>Retrieving protected dashboard data…</p></div> : status === "error" ? <div className="empty-page error-state"><X size={34}/><h2>We couldn’t load the dashboard</h2><p>{pageError}</p><button className="primary" onClick={() => load()}><RefreshCw size={16}/>Retry</button></div> : pageError ? <div className="inline-error"><div><strong>Some {page} data could not be loaded.</strong><span>{pageError}</span></div><button onClick={() => load()}><RefreshCw size={15}/>Retry</button></div> : !currentRows.length ? <div className="empty-page"><PackageSearch size={34}/><h2>No data found</h2><p>The endpoint returned no valid rows for this page or the current filters.</p><button className="primary" onClick={() => setFilters(initialFilters)}><X size={16}/>Reset filters</button></div> : <>
      {page === "overview" && <Overview orders={filtered.ordersFiltered} customers={filtered.customersFiltered} products={filtered.productsFiltered} period={period} setPeriod={setPeriod}/>} {page === "customers" && <CustomersPage rows={filtered.customersFiltered} period={period}/>} {page === "orders" && <OrdersPage rows={filtered.ordersFiltered} period={period}/>} {page === "products" && <ProductsPage rows={filtered.productsFiltered} period={period}/>} </>}
    <footer>Disty internal analytics · Protected server-side data · Asia/Riyadh</footer>
  </main></div>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
