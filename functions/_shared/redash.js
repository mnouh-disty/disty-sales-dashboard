import { json } from "./auth.js";

const CACHE_TTL_SECONDS = 300;
const REFRESH_COOLDOWN_SECONDS = 20;
const clean = (value) => value == null ? "" : String(value).trim();
const pick = (row, ...keys) => keys.find((key) => row[key] != null) ? row[keys.find((key) => row[key] != null)] : null;
const numeric = (value) => {
  if (value == null || value === "") return 0;
  const parsed = Number(typeof value === "string" ? value.replaceAll(",", "") : value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const booleanOrNull = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  const normalized = clean(value).toLowerCase();
  if (["1", "true", "t", "yes", "y", "mada", "verified", "complete", "completed"].includes(normalized)) return true;
  if (["0", "false", "f", "no", "n", "non-mada", "non_mada", "unverified", "incomplete"].includes(normalized)) return false;
  return null;
};
const timestamp = (value, required = false) => {
  if (value == null || value === "") return required ? null : "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? (required ? null : "") : parsed.toISOString();
};
const entityType = (row) => clean(pick(row, "entity_type_name_en", "entity_type", "entity_name_en", "entity_type_name_ar"));
const verificationStatus = (row) => {
  const explicit = clean(pick(row, "verification_status", "customer_verification_status", "verified_status"));
  if (explicit) return explicit;
  const verified = booleanOrNull(pick(row, "is_verified", "verified"));
  return verified === true ? "Verified" : verified === false ? "Unverified" : "";
};

export function normalizeOrders(rows) {
  if (!Array.isArray(rows)) throw new Error("invalid_rows");
  const unique = new Map();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const orderId = clean(raw.order_id);
    const createdAt = timestamp(raw.created_at, true);
    if (!orderId || !createdAt || unique.has(orderId)) continue;
    unique.set(orderId, {
      order_id: orderId,
      customer_id: clean(raw.customer_id),
      erp_id: clean(raw.erp_id),
      customer_name: clean(raw.customer_name),
      entity_type_id: clean(raw.entity_type_id),
      entity_type: entityType(raw),
      entity_type_name_en: clean(pick(raw, "entity_type_name_en", "entity_type")),
      entity_type_name_ar: clean(raw.entity_type_name_ar),
      verification_status: verificationStatus(raw),
      city: clean(raw.city),
      source: clean(raw.source),
      platform: clean(raw.platform),
      payment_method: clean(raw.payment_method),
      payment_status: clean(raw.payment_status),
      order_type: clean(raw.order_type),
      order_state: clean(raw.order_state),
      subtotal: numeric(raw.subtotal), total: numeric(raw.total), discount: numeric(raw.discount),
      wallet_amount_used: numeric(raw.wallet_amount_used), created_at: createdAt,
      year_month: /^\d{4}-\d{2}$/.test(clean(raw.year_month)) ? clean(raw.year_month) : createdAt.slice(0, 7),
      order_day: clean(raw.order_day), year_week: clean(raw.year_week), month_start: clean(raw.month_start),
      time: clean(raw.time), month: clean(raw.month), week_number: clean(raw.week_number), day: clean(raw.day),
      is_mada: booleanOrNull(raw.is_mada),
    });
  }
  return [...unique.values()];
}

export function normalizeProducts(rows) {
  if (!Array.isArray(rows)) throw new Error("invalid_rows");
  const unique = new Map();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const orderId = clean(raw.order_id);
    const skuId = clean(pick(raw, "assr_sku_id", "sku_id"));
    if (!orderId || !skuId) continue;
    const key = `${orderId}::${skuId}`;
    if (unique.has(key)) continue;
    const orderDate = timestamp(pick(raw, "order_date", "created_at"), true);
    unique.set(key, {
      item_name: clean(pick(raw, "item_name_en", "item_name", "name_en", "product_name_en", "product_name")),
      item_name_en: clean(pick(raw, "item_name_en", "item_name", "name_en", "product_name_en", "product_name")),
      product_id: clean(raw.product_id), assr_sku_id: skuId, order_id: orderId,
      order_date: orderDate || "", customer_id: clean(raw.customer_id),
      customer_name: clean(raw.customer_name), erp_id: clean(raw.erp_id), city: clean(raw.city),
      entity_type: entityType(raw), verification_status: verificationStatus(raw),
      order_source: clean(pick(raw, "order_source", "source")), stock: numeric(raw.stock),
      status: clean(raw.status), price: numeric(raw.price), qty_sold: numeric(pick(raw, "qty_sold", "quantity")),
      product_total: numeric(raw.product_total),
    });
  }
  return [...unique.values()];
}

export function normalizeCustomers(rows) {
  if (!Array.isArray(rows)) throw new Error("invalid_rows");
  const unique = new Map();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const customerId = clean(raw.customer_id);
    if (!customerId || unique.has(customerId)) continue;
    unique.set(customerId, {
      customer_id: customerId, customer_name: clean(pick(raw, "customer_name", "store_name", "legal_name_en")),
      legal_name_en: clean(raw.legal_name_en), legal_name_ar: clean(raw.legal_name_ar), erp_id: clean(raw.erp_id),
      registered_at: timestamp(pick(raw, "registered_at", "created_at")), registration_day: clean(raw.registration_day),
      registration_year_week: clean(raw.registration_year_week), registration_month_start: clean(raw.registration_month_start),
      registration_year_month: clean(raw.registration_year_month), entity_type_id: clean(raw.entity_type_id),
      entity_type: entityType(raw), entity_type_name_en: clean(pick(raw, "entity_type_name_en", "entity_type")),
      entity_type_name_ar: clean(raw.entity_type_name_ar), verification_status: verificationStatus(raw),
      customer_status: clean(pick(raw, "customer_status", "status")), customer_state: clean(raw.customer_state),
      is_registered: booleanOrNull(raw.is_registered), is_eligible: booleanOrNull(pick(raw, "is_eligible", "eligibility")),
      eligibility: clean(pick(raw, "eligibility", "is_eligible")),
      is_business_info_completed: booleanOrNull(pick(raw, "is_business_info_completed", "business_information_completed")),
      business_information_completed: booleanOrNull(pick(raw, "is_business_info_completed", "business_information_completed")),
      is_email_verified: booleanOrNull(pick(raw, "is_email_verified", "email_verified")),
      email_verified: booleanOrNull(pick(raw, "is_email_verified", "email_verified")), business_size: clean(raw.business_size),
      employees_number: clean(raw.employees_number), customer_type: clean(raw.customer_type),
      payment_type: clean(raw.payment_type), account_manager_id: clean(raw.account_manager_id),
      acquisition_channel_id: clean(raw.acquisition_channel_id), acquisition_channel: clean(pick(raw, "acquisition_channel", "acquisition_channel_name", "other_acquisition_channel")),
      other_acquisition_channel: clean(raw.other_acquisition_channel), captured_by_vendor_id: clean(raw.captured_by_vendor_id),
      is_external_channel_partner: booleanOrNull(raw.is_external_channel_partner), verification_requested_date: timestamp(raw.verification_requested_date),
      verified_at: timestamp(raw.verified_at), updated_at: timestamp(raw.updated_at),
    });
  }
  return [...unique.values()];
}

function requestConfig(secretUrl, apiKey) {
  const configured = clean(secretUrl);
  if (!configured) throw new Error("missing_configuration");
  let url;
  try { url = new URL(configured); } catch { throw new Error("invalid_configuration"); }
  if (url.protocol !== "https:") throw new Error("invalid_configuration");
  const headers = { Accept: "application/json" };
  if (clean(apiKey) && !url.searchParams.has("api_key")) headers.Authorization = `Key ${clean(apiKey)}`;
  return { url: url.toString(), headers };
}

function rowsFrom(payload) {
  return payload?.query_result?.data?.rows ?? payload?.query_result?.rows ?? payload?.data?.rows ?? payload?.rows;
}

function sameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const allowed = clean(env.DASHBOARD_ORIGIN) || new URL(request.url).origin;
  return origin === allowed || origin === new URL(request.url).origin;
}

export async function serveDataset(context, { name, secret, normalize }) {
  const { request, env } = context;
  if (!sameOrigin(request, env)) return json({ error: "Origin not allowed." }, 403);
  const manual = request.method === "POST" && request.headers.get("X-Manual-Refresh") === "1";
  if (!(["GET", "POST"].includes(request.method)) || (request.method === "POST" && !manual)) return json({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
  const cache = caches.default;
  const cleanUrl = new URL(request.url); cleanUrl.search = "";
  const cacheKey = new Request(cleanUrl.toString(), { method: "GET" });
  if (!manual) {
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(cached.body, cached);
  } else {
    const cooldownKey = new Request(`${cleanUrl.origin}/__cache/${name}-refresh`, { method: "GET" });
    if (await cache.match(cooldownKey)) {
      const cached = await cache.match(cacheKey);
      if (cached) return new Response(cached.body, cached);
    }
    context.waitUntil(cache.put(cooldownKey, new Response("1", { headers: { "cache-control": `public, max-age=${REFRESH_COOLDOWN_SECONDS}` } })));
  }
  try {
    const { url, headers } = requestConfig(env[secret], env.REDASH_QUERY_API_KEY);
    const response = await fetch(url, { headers, cf: { cacheTtl: 0, cacheEverything: false } });
    if (!response.ok) throw new Error("upstream_unavailable");
    const payload = await response.json().catch(() => { throw new Error("invalid_json"); });
    const records = normalize(rowsFrom(payload));
    const body = { [name]: records, count: records.length, updatedAt: new Date().toISOString(), sourceUpdatedAt: payload?.query_result?.retrieved_at ?? null };
    const result = json(body, 200, { "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`, "x-disty-cache": manual ? "REFRESH" : "MISS" });
    context.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  } catch {
    return json({ error: `${name[0].toUpperCase()}${name.slice(1)} are temporarily unavailable.`, message: `The dashboard could not retrieve valid ${name} data. Please retry shortly.` }, 502);
  }
}

export { numeric, booleanOrNull };
