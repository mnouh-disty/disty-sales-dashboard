const COOKIE_NAME = "__Host-disty_session";
const SESSION_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();
const bytesToBase64Url = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const safeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
};

async function signingKey(password) {
  const seed = await crypto.subtle.digest("SHA-256", encoder.encode(`disty-dashboard-session:v1:${password}`));
  return crypto.subtle.importKey("raw", seed, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function signature(payload, password) {
  const result = await crypto.subtle.sign("HMAC", await signingKey(password), encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(result));
}

export function getCookie(request, name = COOKIE_NAME) {
  const cookies = request.headers.get("Cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

export async function createSession(password) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = `v1.${expiresAt}.${nonce}`;
  return { token: `${payload}.${await signature(payload, password)}`, expiresAt };
}

export async function verifySession(request, password) {
  if (!password) return { valid: false, expiresAt: null };
  const token = getCookie(request);
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return { valid: false, expiresAt: null };
  const expiresAt = Number(parts[1]);
  if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return { valid: false, expiresAt: null };
  const payload = parts.slice(0, 3).join(".");
  const expected = await signature(payload, password);
  return { valid: safeEqual(expected, parts[3]), expiresAt };
}

export function sessionCookie(token, maxAge = SESSION_SECONDS) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...headers,
    },
  });
}

export { COOKIE_NAME, SESSION_SECONDS, safeEqual };
