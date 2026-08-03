import { normalizeCustomers, serveDataset } from "../_shared/redash.js";

export function onRequest(context) {
  return serveDataset(context, { name: "customers", secret: "REDASH_CUSTOMERS_QUERY_URL", normalize: normalizeCustomers });
}
