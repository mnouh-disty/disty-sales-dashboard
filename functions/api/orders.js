import { normalizeOrders, serveDataset } from "../_shared/redash.js";

export const normalizeRows = normalizeOrders;
export function onRequest(context) {
  return serveDataset(context, { name: "orders", secret: "REDASH_ORDERS_QUERY_URL", normalize: normalizeOrders });
}
