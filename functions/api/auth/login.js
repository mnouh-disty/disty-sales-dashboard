import { createSession, json, safeEqual, sessionCookie } from "../../_shared/auth.js";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;
const encoder = new TextEncoder();
const keyFor = async (request) => {
  const identity = `${request.headers.get("CF-Connecting-IP") || "unknown"}:${request.headers.get("User-Agent") || "unknown"}`;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(identity));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request(`${new URL(request.url).origin}/__auth/attempts/${hash}`);
};

export async function onRequestPost(context) {
  const expected = String(context.env.DASHBOARD_PASSWORD || "");
  if (!expected) return json({ error: "Dashboard authentication is not configured." }, 503);
  const cache = caches.default;
  const limitKey = await keyFor(context.request);
  const saved = await cache.match(limitKey);
  const state = saved ? await saved.json().catch(() => ({ attempts: 0 })) : { attempts: 0 };
  if ((state.attempts || 0) >= MAX_ATTEMPTS) return json({ error: "Too many failed attempts. Please try again in 15 minutes." }, 429, { "retry-after": String(WINDOW_SECONDS) });
  const body = await context.request.json().catch(() => ({}));
  const supplied = typeof body.password === "string" ? body.password : "";
  if (!safeEqual(supplied, expected)) {
    const attempts = (state.attempts || 0) + 1;
    await cache.put(limitKey, json({ attempts }, 200, { "cache-control": `public, max-age=${WINDOW_SECONDS}` }));
    const remaining = Math.max(0, MAX_ATTEMPTS - attempts);
    return json({ error: remaining ? `Incorrect password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many failed attempts. Please try again in 15 minutes." }, remaining ? 401 : 429, remaining ? {} : { "retry-after": String(WINDOW_SECONDS) });
  }
  await cache.delete(limitKey);
  const session = await createSession(expected);
  return json({ authenticated: true, expiresAt: session.expiresAt }, 200, { "set-cookie": sessionCookie(session.token) });
}

export function onRequest() { return json({ error: "Method not allowed." }, 405, { Allow: "POST" }); }
