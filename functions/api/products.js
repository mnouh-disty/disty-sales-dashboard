// Stream Redash query 262 directly to the authenticated browser without buffering its 84k+ rows in a Worker.
// Authentication is enforced by functions/_middleware.js before this handler executes.
const clean = (value) => value == null ? "" : String(value).trim();

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin");
  const ownOrigin = new URL(request.url).origin;
  const allowedOrigin = clean(env.DASHBOARD_ORIGIN) || ownOrigin;
  if (origin && origin !== ownOrigin && origin !== allowedOrigin) return Response.json({ error: "Origin not allowed." }, { status: 403 });
  if (!["GET", "POST"].includes(request.method) || (request.method === "POST" && request.headers.get("X-Manual-Refresh") !== "1")) {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, POST" } });
  }
  const configured = clean(env.REDASH_PRODUCTS_QUERY_URL);
  if (!configured) return Response.json({ error: "Products source is not configured." }, { status: 502 });
  let url;
  try { url = new URL(configured); if (url.protocol !== "https:") throw new Error("invalid_url"); }
  catch { return Response.json({ error: "Products source configuration is invalid." }, { status: 502 }); }
  const headers = { Accept: "application/json" };
  if (clean(env.REDASH_QUERY_API_KEY) && !url.searchParams.has("api_key")) headers.Authorization = `Key ${clean(env.REDASH_QUERY_API_KEY)}`;
  try {
    const upstream = await fetch(url.toString(), { headers, cf: { cacheTtl: 0, cacheEverything: false } });
    if (!upstream.ok || !upstream.body) return Response.json({ error: "Products source is temporarily unavailable.", upstreamStatus: upstream.status }, { status: 502 });
    // Do not use upstream.json(), JSON.stringify(), or cache.put(): all buffer the huge dataset.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
        "x-disty-products-format": "redash-stream",
      },
    });
  } catch {
    return Response.json({ error: "Products source could not be reached. Please retry shortly." }, { status: 502 });
  }
}
