# Disty Sales Analytics

Deployment-ready React dashboard for Cloudflare Pages with four working views: Overview, Customers, Orders and Products. The frontend calls only same-origin Pages Functions. Redash configuration and the shared dashboard password remain server-only.

## Included architecture

- React + Vite frontend built to `dist/`
- Cloudflare Pages Functions at `/api/orders`, `/api/products` and `/api/customers`
- Login, logout and session endpoints under `/api/auth/`
- Root Pages middleware that protects all non-authentication API routes
- Signed 12-hour `HttpOnly; Secure; SameSite=Strict` session cookie
- Best-effort edge rate limiting: five failed login attempts trigger a 15-minute cooldown
- Five-minute edge caching for successful normalized Redash responses
- Controlled manual refresh with a 20-second cooldown
- Loading, partial-error, retry and empty-data states
- Search, sorting, pagination and CSV exports

## Local setup

Requires Node.js 20 or newer.

1. Run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars`.
3. Replace the placeholders in `.dev.vars` with local development values. Never commit this file.
4. Run `npm run pages:dev`.

The three Redash query variables must contain the complete working protected JSON URLs. The server fetches each stored value exactly as configured and does not rebuild, rewrite or append to it.

## Cloudflare Pages deployment

1. Create a Cloudflare Pages project and connect the repository containing this folder.
2. Choose the Vite framework preset.
3. Set the build command to `npm run build`.
4. Set the build output directory to `dist`.
5. Deploy the project manually when ready. This package does not deploy itself.

After the Pages project exists, go to:

**Cloudflare → Workers & Pages → your project → Settings → Variables and Secrets**

Add these as encrypted **Secrets** in Production (and Preview only if preview deployments should use live data):

| Secret | Purpose |
| --- | --- |
| `REDASH_ORDERS_QUERY_URL` | Protected Redash source for query 263 |
| `REDASH_PRODUCTS_QUERY_URL` | Protected Redash source for query 262 |
| `REDASH_CUSTOMERS_QUERY_URL` | Protected Redash source for query 264 |
| `DASHBOARD_PASSWORD` | Shared password used only by Pages Functions |

If the three URLs do not already contain their server-side authentication, also add `REDASH_QUERY_API_KEY` as an encrypted secret. Never put any of these values in `wrangler.toml`, Git, frontend source, browser storage, a URL shared with users, or a variable whose name starts with `VITE_`.

Add `DASHBOARD_ORIGIN` as a normal encrypted secret or server variable containing the exact deployed origin, with no trailing slash. Example format: `https://dashboard.example.com`.

Changing `DASHBOARD_PASSWORD` immediately invalidates existing signed sessions. A successful login creates a new 12-hour cookie. The browser never stores or reads the password or session token.

## Data rules

- Orders are deduplicated by `order_id`; invalid IDs or dates are removed.
- Products are deduplicated by `order_id + assr_sku_id`; quantity and product totals remain numeric.
- Customers are deduplicated by `customer_id`; new-customer metrics use `registered_at`.
- Cancelled, canceled, rejected, failed and deleted orders are excluded by default and can be included with the dashboard toggle.
- `total` drives order sales and average order value.
- `customer_id` drives distinct active-customer counts.
- `verification_status` drives verified, pending and unverified customer metrics.
- Entity types accept the updated `entity_type_name_en` Redash column and retain `entity_type` as a backwards-compatible alias.
- Product names accept `item_name_en` from Query 262, preventing valid items from being grouped as “Unknown”.
- The customer-verification filter applies to Overview, Customers, Orders and Products; order and product rows inherit customer verification by `customer_id` when needed.

## Verification

Run:

```bash
npm test
npm run build
```

Before production use, verify each endpoint with the real secrets, confirm the dashboard pages and filters, and inspect the browser Network and Storage panels. The browser should call only same-origin `/api/*` routes; Redash URLs, query keys, API keys and `DASHBOARD_PASSWORD` must not appear in frontend bundles, page source, browser storage, request URLs, logs or JSON responses.
