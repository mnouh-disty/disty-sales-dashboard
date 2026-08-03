const CACHE_TTL_SECONDS = 300;
const REFRESH_COOLDOWN_SECONDS = 20;

const FIELDS = [
  "order_id",
  "erp_id",
  "customer_name",
  "city",
  "source",
  "payment_method",
  "payment_status",
  "order_type",
  "order_state",
  "subtotal",
  "total",
  "discount",
  "wallet_amount_used",
  "created_at",
  "year_month",
  "time",
  "month",
  "week_number",
  "day",
  "is_mada",
];

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });

const cleanText = (value) => (value == null ? "" : String(value).trim());

const finiteNumber = (value) => {
  if (value == null || value === "") return 0;

  const normalized =
    typeof value === "string" ? value.replace(/,/g, "") : value;

  const number = Number(normalized);

  return Number.isFinite(number) ? number : 0;
};

const madaValue = (value) => {
  if (value == null || value === "") return null;

  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "t", "1", "yes", "y", "mada"].includes(normalized)) {
    return true;
  }

  if (
    ["false", "f", "0", "no", "n", "non-mada", "non_mada"].includes(
      normalized
    )
  ) {
    return false;
  }

  return null;
};

export function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Redash returned an invalid rows payload.");
  }

  const unique = new Map();

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;

    const orderId = cleanText(raw.order_id);

    if (!orderId || unique.has(orderId)) continue;

    const parsedDate = new Date(raw.created_at);

    if (Number.isNaN(parsedDate.getTime())) continue;

    const order = Object.fromEntries(
      FIELDS.map((field) => [field, raw[field] ?? null])
    );

    order.order_id = orderId;
    order.erp_id = cleanText(raw.erp_id);
    order.customer_name = cleanText(raw.customer_name);
    order.city = cleanText(raw.city);
    order.source = cleanText(raw.source);
    order.payment_method = cleanText(raw.payment_method);
    order.payment_status = cleanText(raw.payment_status);
    order.order_type = cleanText(raw.order_type);
    order.order_state = cleanText(raw.order_state);

    order.subtotal = finiteNumber(raw.subtotal);
    order.total = finiteNumber(raw.total);
    order.discount = finiteNumber(raw.discount);
    order.wallet_amount_used = finiteNumber(raw.wallet_amount_used);

    order.created_at = parsedDate.toISOString();

    order.year_month = /^\d{4}-\d{2}$/.test(cleanText(raw.year_month))
      ? cleanText(raw.year_month)
      : order.created_at.slice(0, 7);

    order.time = cleanText(raw.time);
    order.month = cleanText(raw.month);
    order.week_number = cleanText(raw.week_number);
    order.day = cleanText(raw.day);
    order.is_mada = madaValue(raw.is_mada);

    unique.set(orderId, order);
  }

  return [...unique.values()];
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");

  if (!origin) return {};

  const requestOrigin = new URL(request.url).origin;
  const allowed = cleanText(env.DASHBOARD_ORIGIN) || requestOrigin;

  if (origin !== allowed && origin !== requestOrigin) {
    return null;
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers":
      "Content-Type, X-Manual-Refresh",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function validateEnv(env) {
  const baseUrl = cleanText(env.REDASH_BASE_URL).replace(/\/$/, "");
  const queryId = cleanText(env.REDASH_QUERY_ID);
  const apiKey = cleanText(env.REDASH_QUERY_API_KEY);

  if (!baseUrl || !queryId || !apiKey) {
    throw new Error("Server configuration is incomplete.");
  }

  let parsed;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("REDASH_BASE_URL is invalid.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("REDASH_BASE_URL must use HTTPS.");
  }

  if (!/^\d+$/.test(queryId)) {
    throw new Error("REDASH_QUERY_ID must be numeric.");
  }

  return { baseUrl, queryId, apiKey };
}

function extractRows(payload) {
  return (
    payload?.query_result?.data?.rows ??
    payload?.query_result?.rows ??
    payload?.data?.rows ??
    payload?.rows
  );
}

async function fetchRedash(env) {
  const { baseUrl, queryId, apiKey } = validateEnv(env);

  const url = new URL(
    `${baseUrl}/api/queries/${encodeURIComponent(
      queryId
    )}/results.json`
  );

  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    const responseText = await response.text();

    console.error(
      "Redash response:",
      response.status,
      responseText.slice(0, 500)
    );

    throw new Error(
      `Redash request failed with status ${response.status}.`
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Redash returned invalid JSON.");
  }

  const rows = extractRows(payload);

  if (!Array.isArray(rows)) {
    console.error(
      "Unexpected Redash payload structure:",
      JSON.stringify(payload).slice(0, 1000)
    );

    throw new Error("Redash response did not contain a rows array.");
  }

  const orders = normalizeRows(rows);

  return {
    orders,
    count: orders.length,
    updatedAt: new Date().toISOString(),
    sourceUpdatedAt:
      payload?.query_result?.retrieved_at ??
      payload?.query_result?.updated_at ??
      null,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  const cors = corsHeaders(request, env);

  if (!cors) {
    return json({ error: "Origin not allowed." }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors,
    });
  }

  const manualRefresh =
    request.method === "POST" &&
    request.headers.get("X-Manual-Refresh") === "1";

  if (
    !["GET", "POST"].includes(request.method) ||
    (request.method === "POST" && !manualRefresh)
  ) {
    return json(
      { error: "Method not allowed." },
      405,
      {
        ...cors,
        allow: "GET, POST, OPTIONS",
      }
    );
  }

  const cache = caches.default;

  const cacheUrl = new URL(request.url);
  cacheUrl.search = "";

  const cacheKey = new Request(cacheUrl.toString(), {
    method: "GET",
  });

  if (!manualRefresh) {
    const cached = await cache.match(cacheKey);

    if (cached) {
      const response = new Response(cached.body, cached);

      Object.entries(cors).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      response.headers.set("x-disty-cache", "HIT");

      return response;
    }
  } else {
    const cooldownKey = new Request(
      `${cacheUrl.origin}/api/orders-refresh-cooldown`,
      {
        method: "GET",
      }
    );

    if (await cache.match(cooldownKey)) {
      const cached = await cache.match(cacheKey);

      if (cached) {
        const response = new Response(cached.body, cached);

        Object.entries(cors).forEach(([key, value]) => {
          response.headers.set(key, value);
        });

        response.headers.set(
          "x-disty-cache",
          "REFRESH-COOLDOWN"
        );

        return response;
      }
    }

    context.waitUntil(
      cache.put(
        cooldownKey,
        new Response("1", {
          headers: {
            "cache-control": `public, max-age=${REFRESH_COOLDOWN_SECONDS}`,
          },
        })
      )
    );
  }

  try {
    const result = await fetchRedash(env);

    const response = json(result, 200, {
      ...cors,
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      "x-disty-cache": manualRefresh ? "REFRESH" : "MISS",
    });

    context.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  } catch (error) {
    console.error(
      "Orders endpoint failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return json(
      {
        error: "Orders are temporarily unavailable.",
        message:
          "The dashboard could not retrieve a valid result from Redash. Please retry shortly.",
      },
      502,
      cors
    );
  }
}
