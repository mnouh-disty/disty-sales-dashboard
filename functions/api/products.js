import { normalizeProducts, serveDataset } from "../_shared/redash.js";

export function onRequest(context) {
  return serveDataset(context, { name: "products", secret: "REDASH_PRODUCTS_QUERY_URL", normalize: normalizeProducts });
}
