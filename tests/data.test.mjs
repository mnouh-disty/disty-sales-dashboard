import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomers, normalizeOrders, normalizeProducts, serveDataset } from "../functions/_shared/redash.js";
import { createSession, sessionCookie, verifySession } from "../functions/_shared/auth.js";
import { onRequest as authenticationMiddleware } from "../functions/_middleware.js";

test("orders are normalized and deduplicated by order_id", () => {
  const rows = normalizeOrders([
    { order_id: "A-1", customer_id: "C-1", erp_id: "00124", entity_type_name_en: "Corporate", customer_verification_status: "Verified", created_at: "2026-01-02T10:00:00+03:00", subtotal: "1,200.50", total: "1300", discount: null, wallet_amount_used: "bad", is_mada: "yes" },
    { order_id: "A-1", created_at: "2026-01-03", total: 9 },
    { order_id: "A-2", erp_id: 42, created_at: "2026-02-01T00:00:00Z", total: 21, is_mada: 0 },
    { order_id: "", created_at: "2026-01-01" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].erp_id, "00124");
  assert.equal(rows[0].subtotal, 1200.5);
  assert.equal(rows[0].discount, 0);
  assert.equal(rows[0].wallet_amount_used, 0);
  assert.equal(rows[0].is_mada, true);
  assert.equal(rows[0].entity_type, "Corporate");
  assert.equal(rows[0].verification_status, "Verified");
  assert.equal(rows[1].erp_id, "42");
});

test("products are deduplicated by order_id and assr_sku_id", () => {
  const rows = normalizeProducts([
    { order_id: "O-1", assr_sku_id: "SKU-1", item_name_en: "Phone", entity_type_name_en: "Retail", order_date: "2026-01-01", qty_sold: "2", product_total: "2,500" },
    { order_id: "O-1", assr_sku_id: "SKU-1", qty_sold: 99 },
    { order_id: "O-1", assr_sku_id: "SKU-2", qty_sold: 1 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].qty_sold, 2);
  assert.equal(rows[0].product_total, 2500);
  assert.equal(rows[0].item_name, "Phone");
  assert.equal(rows[0].entity_type, "Retail");
});

test("customers are deduplicated by customer_id and dates are normalized", () => {
  const rows = normalizeCustomers([
    { customer_id: "C-1", erp_id: "0004", registered_at: "2026-03-10", entity_type_name_en: "Corporate", verification_status: "Verified", is_email_verified: "yes" },
    { customer_id: "C-1", erp_id: "999" },
    { customer_id: "C-2", registered_at: "invalid" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].erp_id, "0004");
  assert.match(rows[0].registered_at, /^2026-03-10/);
  assert.equal(rows[0].is_email_verified, true);
  assert.equal(rows[0].entity_type, "Corporate");
});

test("signed session verifies and contains the required secure cookie flags", async () => {
  const password = "a strong test password";
  const session = await createSession(password);
  const cookie = sessionCookie(session.token);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const verified = await verifySession(new Request("https://dashboard.example.com/api/orders", { headers: { Cookie: cookie.split(";")[0] } }), password);
  assert.equal(verified.valid, true);
  const invalid = await verifySession(new Request("https://dashboard.example.com/api/orders", { headers: { Cookie: cookie.split(";")[0] } }), "wrong password");
  assert.equal(invalid.valid, false);
});

test("dataset endpoint keeps its protected URL and API key out of the response", async () => {
  const stored = new Map();
  globalThis.caches = { default: {
    match: async (request) => stored.get(request.url)?.clone(),
    put: async (request, response) => stored.set(request.url, response.clone()),
    delete: async (request) => stored.delete(request.url),
  } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://redash.example/api/queries/263/results.json?api_key=fake-query-key");
    assert.equal(init.headers.Authorization, undefined);
    return new Response(JSON.stringify({ query_result: { data: { rows: [{ order_id: "O-1", customer_id: "C-1", created_at: "2026-08-03", total: "250" }] } } }), { status: 200 });
  };
  try {
    const response = await serveDataset({
      request: new Request("https://dashboard.example/api/orders"),
      env: { REDASH_ORDERS_QUERY_URL: "https://redash.example/api/queries/263/results.json?api_key=fake-query-key", DASHBOARD_ORIGIN: "https://dashboard.example" },
      waitUntil: (promise) => promise,
    }, { name: "orders", secret: "REDASH_ORDERS_QUERY_URL", normalize: normalizeOrders });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(body.includes("fake-query-key"), false);
    assert.equal(body.includes("redash.example"), false);
    assert.equal(JSON.parse(body).orders[0].total, 250);
  } finally { globalThis.fetch = originalFetch; }
});

test("authentication middleware blocks protected APIs without a valid cookie", async () => {
  const response = await authenticationMiddleware({
    request: new Request("https://dashboard.example/api/customers"),
    env: { DASHBOARD_PASSWORD: "test password" },
    next: () => new Response("should not run"),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
});
