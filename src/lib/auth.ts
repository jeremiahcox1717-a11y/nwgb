export const SESSION_COOKIE = "nwgb_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

export function getAccessPassword(): string | null {
  const password = process.env.ACCESS_PASSWORD?.trim();
  return password ? password : null;
}

export function getSessionSecret(): string {
  const explicit = process.env.SESSION_SECRET?.trim();
  if (explicit) return explicit;
  const password = getAccessPassword();
  if (password) return `nwgb:${password}`;
  return "nwgb-unconfigured-secret";
}

export function passwordsMatch(submitted: string, expected: string): boolean {
  const a = encoder.encode(submitted);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function signSession(
  now = Date.now(),
  secret = getSessionSecret(),
): Promise<string> {
  const exp = now + SESSION_TTL_MS;
  const nonce = randomHex(8);
  const payload = `v1.${exp}.${nonce}`;
  const sig = await hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifySession(
  token: string | undefined | null,
  now = Date.now(),
  secret = getSessionSecret(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [version, expRaw, nonce, sig] = parts;
  if (version !== "v1" || !expRaw || !nonce || !sig) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now) return false;

  const payload = `${version}.${expRaw}.${nonce}`;
  const expected = await hmacHex(secret, payload);
  const a = encoder.encode(sig);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function cookieSettings(maxAgeSeconds = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(new Uint8Array(signature));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
