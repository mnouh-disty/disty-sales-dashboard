import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRows, onRequest } from "../functions/api/orders.js";

test("normalizes fields, preserves ERP text, and deduplicates by order_id", () => {
  const rows = normalizeRows([
    { order_id: "A-1", erp_id: "00124", created_at: "2026-01-02T10:00:00+03:00", subtotal: "1,200.50", total: "1300", discount: null, wallet_amount_used: "bad", is_mada: "yes" },
    { order_id: "A-1", erp_id: "999", created_at: "2026-01-03", total: 9 },
    { order_id: "A-2", erp_id: 42, created_at: "2026-02-01T00:00:00Z", subtotal: 20, total: 21, discount: "1", wallet_amount_used: 5, is_mada: 0 },
    { order_id: "", created_at: "2026-01-01" },
    { order_id: "A-3", created_at: "not-a-date" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].erp_id, "00124");
  assert.equal(rows[0].subtotal, 1200.5);
  assert.equal(rows[0].discount, 0);
  assert.equal(rows[0].wallet_amount_used, 0);
  assert.equal(rows[0].is_mada, true);
  assert.equal(rows[1].erp_id, "42");
  assert.equal(rows[1].is_mada, false);
});

test("derives chronological year_month from valid created_at", () => {
  const rows = normalizeRows([
    { order_id: "3", created_at: "2026-12-10T10:00:00Z" },
    { order_id: "1", created_at: "2026-01-10T10:00:00Z" },
    { order_id: "2", created_at: "2026-03-10T10:00:00Z" },
  ]);
  assert.deepEqual(rows.map((r) => r.year_month).sort(), ["2026-01", "2026-03", "2026-12"]);
});

test("rejects a non-array Redash rows payload", () => {
  assert.throws(() => normalizeRows({}), /invalid_rows/);
});

test("endpoint returns normalized data without exposing its secret", async () => {
  const originalCaches = globalThis.caches;
  const stored = new Map();
  globalThis.caches = { default: {
    match: async (request) => stored.get(request.url)?.clone(),
    put: async (request, response) => stored.set(request.url, response.clone()),
  } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers.Authorization, "Key super-secret-value");
    return new Response(JSON.stringify({ query_result: { data: { rows: [
      { order_id: "ORDER-1", erp_id: "0007", created_at: "2026-08-03T10:00:00Z", total: "25.5" },
    ] } } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequest({
      request: new Request("https://dashboard.example.com/api/orders"),
      env: { REDASH_ORDERS_QUERY_URL: "https://bi.disty.app/api/queries/263/results.json", REDASH_QUERY_API_KEY: "super-secret-value", DASHBOARD_ORIGIN: "https://dashboard.example.com" },
      waitUntil: (promise) => promise,
    });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(text.includes("super-secret-value"), false);
    const payload = JSON.parse(text);
    assert.equal(payload.orders[0].erp_id, "0007");
    assert.equal(payload.orders[0].total, 25.5);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

