import { json, verifySession } from "./_shared/auth.js";

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (!path.startsWith("/api/") || path === "/api/auth/login" || path === "/api/auth/session") return context.next();
  const session = await verifySession(context.request, context.env.DASHBOARD_PASSWORD);
  if (!session.valid) return json({ error: "Authentication required." }, 401);
  return context.next();
}
