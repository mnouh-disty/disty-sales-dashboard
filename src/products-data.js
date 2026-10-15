// Product normalization runs in the browser to avoid Cloudflare Worker memory/CPU limits.
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

