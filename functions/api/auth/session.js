import { json, verifySession } from "../../_shared/auth.js";

export async function onRequestGet(context) {
  const session = await verifySession(context.request, context.env.DASHBOARD_PASSWORD);
  return session.valid ? json({ authenticated: true, expiresAt: session.expiresAt }) : json({ authenticated: false }, 401);
}

export function onRequest() { return json({ error: "Method not allowed." }, 405, { Allow: "GET" }); }
