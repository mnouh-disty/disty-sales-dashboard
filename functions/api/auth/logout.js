import { clearSessionCookie, json } from "../../_shared/auth.js";

export function onRequestPost() {
  return json({ authenticated: false }, 200, { "set-cookie": clearSessionCookie() });
}

export function onRequest() { return json({ error: "Method not allowed." }, 405, { Allow: "POST" }); }
