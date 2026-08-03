# Disty Sales Analytics

Deployment-ready React dashboard for Cloudflare Pages. The browser calls only the same-origin `/api/orders` route. The Pages Function calls Redash server-to-server and never returns credentials or authentication headers.

## Architecture

- **Frontend:** React + Vite, built to `dist/` and hosted on Cloudflare Pages.
- **Server:** Cloudflare Pages Function at `functions/api/orders.js`.
- **Data source:** latest cached result for Redash query `219` at `https://bi.disty.app`.
- **Secret:** `REDASH_QUERY_API_KEY`, stored as an encrypted Cloudflare secret.
- **Caching:** successful normalized responses are cached at the edge for five minutes.
- **Manual refresh:** the frontend sends a same-origin `POST /api/orders` request with `X-Manual-Refresh: 1`. Refreshes have a short server-side cooldown to avoid repeated Redash calls.
- **CORS:** same-origin requests are accepted. Cross-origin requests are accepted only when their origin matches `DASHBOARD_ORIGIN`.

## Local setup

Requirements: Node.js 20 or newer.

1. Install dependencies with `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars`.
3. Put the real Query API Key only in `.dev.vars`. This file is ignored by Git.
4. Run `npm run pages:dev` to build and run the frontend together with the Pages Function.

Do not use a `VITE_` prefix for the Redash key. Vite-prefixed variables are included in browser code.

## Cloudflare Pages deployment

### Option A: connect a Git repository

1. Create a new Cloudflare Pages project and connect the repository containing this folder.
2. Use **Framework preset: Vite**.
3. Set **Build command** to `npm run build`.
4. Set **Build output directory** to `dist`.
5. Deploy once so Cloudflare assigns the final `*.pages.dev` URL or connect the custom domain first.

### Option B: Wrangler

After authenticating Wrangler, run:

```bash
npm install
npm run build
npx wrangler pages deploy dist --project-name disty-sales-dashboard
```

The `functions/` directory is deployed with the Pages project when using the Pages workflow.

## Environment variables and secrets

In Cloudflare: **Workers & Pages → disty-sales-dashboard → Settings → Variables and Secrets**.

Add these values to both **Production** and **Preview** if preview deployments should use live data:

| Name | Type | Value |
| --- | --- | --- |
| `REDASH_BASE_URL` | Text | `https://bi.disty.app` |
| `REDASH_QUERY_ID` | Text | `219` |
| `REDASH_QUERY_API_KEY` | **Secret / encrypted** | Your Redash Query API Key |
| `DASHBOARD_ORIGIN` | Text | Exact deployed origin, e.g. `https://dashboard.example.com` |

Important:

- Paste the Redash key only into Cloudflare’s encrypted secret field.
- Do not put the key in `wrangler.toml`, GitHub variables visible to the build, frontend code, browser storage, URLs, or any variable starting with `VITE_`.
- `DASHBOARD_ORIGIN` must contain only the origin: scheme + hostname + optional port, with no path and no trailing slash.
- After changing variables or secrets, deploy again so the Pages Function receives them.

## Redash behavior

The server requests:

```text
https://bi.disty.app/api/queries/219/results
```

Authentication is sent in the server-only `Authorization: Key …` header. The function extracts Redash rows, removes invalid or duplicate `order_id` values, normalizes the dashboard fields, and returns only:

`order_id`, `erp_id`, `customer_name`, `city`, `source`, `payment_method`, `payment_status`, `order_type`, `order_state`, `subtotal`, `total`, `discount`, `wallet_amount_used`, `created_at`, `year_month`, `time`, `month`, `week_number`, `day`, and `is_mada`.

Rows with an invalid `created_at` are excluded because dashboard time grouping depends on a valid timestamp. `erp_id` remains text. Invalid numeric values become zero. `is_mada` becomes `true`, `false`, or `null`.

## Verification checklist

1. Run `npm test`.
2. Run `npm run build`.
3. Start `npm run pages:dev` with a valid local `.dev.vars` file.
4. Open the dashboard and verify loading, empty, error/retry, and manual-refresh states.
5. In browser DevTools → Network, confirm the browser calls only `/api/orders` and does not call `bi.disty.app`.
6. Search the built files for the real API key. There should be no match.
7. Confirm `/api/orders` responses contain normalized rows and timestamps only—never secrets, Redash headers, or internal configuration.

## Security notes

This project protects the Redash credential from browser exposure. For a private internal dashboard, also enable Cloudflare Access in front of the Pages project so only authorized Disty users can open the dashboard or call its same-origin API.
