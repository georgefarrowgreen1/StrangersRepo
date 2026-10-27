// Accounts: sign in with name + PIN, signed session cookies, and the first-admin setup.
import { ApiError, Env, SQL_NOW_MS, invalid, json, readJson, safeEqual } from "./http";

export type Role = "admin" | "manager" | "staff";
export const ROLES: Role[] = ["admin", "manager", "staff"];

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface UserRow extends User {
  name_key: string;
  pin_hash: string;
  pin_salt: string;
  active: number;
  session_ver: number;
  failed: number;
  locked_until: number;
  created_at: number;
  created_by: string | null;
  updated_at: number;
  last_login_at: number | null;
}

const COOKIE = "sfbb_session";
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_FAILS = 5; // wrong PINs in a row before the account locks
const LOCK_MS = 10 * 60 * 1000;
const IP_FAILS = 30; // failed sign-ins per IP per 15 minutes
const WINDOW_MS = 15 * 60 * 1000;
// PBKDF2 rounds. Kept modest so a sign-in fits the Workers CPU budget; a PIN's real protection is the
// lockout and the per-IP limit, since any short PIN is quick to brute-force offline whatever the rounds.
const PIN_ROUNDS = 3000;

/* ---------- helpers ---------- */

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function newId(bytes = 12): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function cleanName(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const name = s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return name && name.length <= 60 ? name : null;
}

export const nameKey = (name: string) => name.toLowerCase();

export function checkPin(pin: unknown): string {
  if (typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) throw invalid("The PIN must be 4 to 6 digits.");
  return pin;
}

export function randomPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

export async function hashPin(pin: string, salt = newId(16)): Promise<{ hash: string; salt: string }> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PIN_ROUNDS }, key, 256);
  return { hash: `p${PIN_ROUNDS}:${hex(bits)}`, salt };
}

async function pinMatches(pin: string, row: { pin_hash: string; pin_salt: string }): Promise<boolean> {
  const { hash } = await hashPin(pin, row.pin_salt);
  return safeEqual(hash, row.pin_hash);
}

/* ---------- sessions ---------- */

let keyPromise: Promise<CryptoKey> | null = null;

/** HMAC key for session cookies, generated on first use and kept in the secrets table. */
function sessionKey(env: Env): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      await env.DB.prepare("INSERT OR IGNORE INTO secrets (k, v) VALUES ('session_key', ?)").bind(newId(32)).run();
      const row = await env.DB.prepare("SELECT v FROM secrets WHERE k = 'session_key'").first<{ v: string }>();
      return crypto.subtle.importKey("raw", enc.encode(row!.v), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    })().catch((e) => {
      keyPromise = null;
      throw e;
    });
  }
  return keyPromise;
}

async function sessionCookie(env: Env, user: { id: string; session_ver: number }): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ u: user.id, v: user.session_ver, e: Date.now() + SESSION_MS })));
  const sig = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await sessionKey(env), enc.encode(payload))));
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
}

const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** The signed-in person, or null. Checks the signature, expiry, and that the account is still active and
 * hasn't been signed out everywhere since (session_ver). */
export async function sessionUser(req: Request, env: Env): Promise<User | null> {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)`));
  if (!m) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await sessionKey(env), unb64url(m[2]), enc.encode(m[1]));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(unb64url(m[1])));
    if (typeof s.e !== "number" || s.e < Date.now()) return null;
    const row = await env.DB.prepare("SELECT id, name, role, active, session_ver FROM users WHERE id = ?")
      .bind(s.u).first<{ id: string; name: string; role: Role; active: number; session_ver: number }>();
    if (!row || !row.active || row.session_ver !== s.v) return null;
    return { id: row.id, name: row.name, role: row.role };
  } catch {
    return null;
  }
}

/* ---------- sign-in rate limits ---------- */

async function ipFailures(env: Env, ip: string): Promise<number> {
  const window = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const row = await env.DB.prepare("SELECT n FROM rate_limits WHERE ip = ? AND window = ?").bind("login:" + ip, window).first<{ n: number }>();
  return row?.n ?? 0;
}

async function recordIpFailure(env: Env, ip: string): Promise<void> {
  const window = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  await env.DB.prepare("INSERT INTO rate_limits (ip, window, n) VALUES (?, ?, 1) ON CONFLICT (ip, window) DO UPDATE SET n = n + 1")
    .bind("login:" + ip, window).run();
}

/** Why setup can't start, naming the text settings the Worker can see (names only, never values) so a
 * secret saved under a slightly different name, or in the wrong place, is easy to spot. Only reachable
 * before the first admin exists. */
function missingTokenMessage(env: Env): string {
  const seen = Object.entries(env as unknown as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string")
    .map(([k]) => JSON.stringify(k));
  return "The site can't see a SYNC_TOKEN secret, so there's no setup code yet. Add it in Cloudflare under " +
    "Workers & Pages → strangers-kitchen-diary → Settings → Variables and Secrets (not the Build section). " +
    `Settings the site can see: ${seen.length ? seen.join(", ") : "none"}.`;
}

/* ---------- routes: /api/auth/* ---------- */

const publicUser = (u: User) => ({ id: u.id, name: u.name, role: u.role, recordId: "web:" + u.name });

async function userCount(env: Env): Promise<number> {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n ?? 0;
}

export async function handleAuth(req: Request, env: Env, route: string, current: User | null): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") || "local";

  if (route === "me" && req.method === "GET") {
    return json({ user: current ? publicUser(current) : null, setupNeeded: (await userCount(env)) === 0 });
  }

  if (route === "logout" && req.method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": clearCookie });
  }

  if (route === "setup" && req.method === "POST") {
    // The very first account becomes an admin. Guarded by the sync token, which only the host has.
    const body = await readJson<any>(req, 4096);
    if ((await userCount(env)) > 0) throw new ApiError(409, "already_set_up", "An admin already exists. Sign in instead.");
    if (!env.SYNC_TOKEN) throw new ApiError(503, "no_setup_code", missingTokenMessage(env));
    if ((await ipFailures(env, ip)) >= IP_FAILS) throw new ApiError(429, "rate_limited", "Too many attempts. Wait 15 minutes.");
    if (typeof body.code !== "string" || !(await safeEqual(body.code.trim(), env.SYNC_TOKEN))) {
      await recordIpFailure(env, ip);
      throw new ApiError(403, "wrong_setup_code", "That setup code isn't right. It's the sync token you set in Cloudflare.");
    }
    const name = cleanName(body.name);
    if (!name) throw invalid("Enter your name (up to 60 characters).");
    const { hash, salt } = await hashPin(checkPin(body.pin));
    const id = newId();
    const res = await env.DB.prepare(
      `INSERT INTO users (id, name, name_key, role, pin_hash, pin_salt, created_at, created_by, updated_at, last_login_at)
       SELECT ?, ?, ?, 'admin', ?, ?, ${SQL_NOW_MS}, 'setup', ${SQL_NOW_MS}, ${SQL_NOW_MS} WHERE NOT EXISTS (SELECT 1 FROM users)`,
    ).bind(id, name, nameKey(name), hash, salt).run();
    if (!res.meta.changes) throw new ApiError(409, "already_set_up", "An admin already exists. Sign in instead.");
    const user: User = { id, name, role: "admin" };
    return json({ user: publicUser(user) }, 200, { "set-cookie": await sessionCookie(env, { id, session_ver: 1 }) });
  }

  if (route === "recover" && req.method === "POST") {
    // An admin who has forgotten their PIN sets a new one with the setup code (the sync token).
    const body = await readJson<any>(req, 4096);
    if (!env.SYNC_TOKEN) throw new ApiError(503, "no_setup_code", "Set the SYNC_TOKEN secret in Cloudflare first; it's the setup code.");
    if ((await ipFailures(env, ip)) >= IP_FAILS) throw new ApiError(429, "rate_limited", "Too many attempts. Wait 15 minutes.");
    if (typeof body.code !== "string" || !(await safeEqual(body.code.trim(), env.SYNC_TOKEN))) {
      await recordIpFailure(env, ip);
      throw new ApiError(403, "wrong_setup_code", "That setup code isn't right. It's the sync token you set in Cloudflare.");
    }
    const name = cleanName(body.name);
    const row = name ? await env.DB.prepare("SELECT * FROM users WHERE name_key = ? AND role = 'admin' AND active = 1").bind(nameKey(name)).first<UserRow>() : null;
    if (!row) throw new ApiError(404, "not_admin", "There's no active admin with that name.");
    const { hash, salt } = await hashPin(checkPin(body.pin));
    await env.DB.prepare(
      `UPDATE users SET pin_hash = ?, pin_salt = ?, failed = 0, locked_until = 0, session_ver = session_ver + 1,
         updated_at = ${SQL_NOW_MS}, last_login_at = ${SQL_NOW_MS} WHERE id = ?`,
    ).bind(hash, salt, row.id).run();
    return json({ user: publicUser(row) }, 200, { "set-cookie": await sessionCookie(env, { id: row.id, session_ver: row.session_ver + 1 }) });
  }

  if (route === "login" && req.method === "POST") {
    const body = await readJson<any>(req, 4096);
    if ((await ipFailures(env, ip)) >= IP_FAILS) {
      throw new ApiError(429, "rate_limited", "Too many wrong attempts from this connection. Wait 15 minutes.");
    }
    const name = cleanName(body.name);
    const pin = typeof body.pin === "string" ? body.pin : "";
    const row = name ? await env.DB.prepare("SELECT * FROM users WHERE name_key = ?").bind(nameKey(name)).first<UserRow>() : null;
    const wrong = new ApiError(401, "wrong_pin", "That name and PIN don't match. Check both and try again.");
    if (!row || !row.active) {
      await hashPin(pin || "0000"); // same work as a real check, so timing doesn't reveal which names exist
      await recordIpFailure(env, ip);
      throw wrong;
    }
    const now = Date.now();
    if (row.locked_until > now) {
      const mins = Math.ceil((row.locked_until - now) / 60000);
      throw new ApiError(423, "locked", `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask an admin to reset your PIN.`);
    }
    if (!(await pinMatches(pin, row))) {
      const failed = row.failed + 1;
      const lock = failed >= MAX_FAILS;
      await env.DB.prepare("UPDATE users SET failed = ?, locked_until = ? WHERE id = ?")
        .bind(lock ? 0 : failed, lock ? now + LOCK_MS : row.locked_until, row.id).run();
      await recordIpFailure(env, ip);
      if (lock) throw new ApiError(423, "locked", "Too many wrong PINs. Try again in 10 minutes, or ask an admin to reset your PIN.");
      throw wrong;
    }
    await env.DB.prepare(`UPDATE users SET failed = 0, locked_until = 0, last_login_at = ${SQL_NOW_MS} WHERE id = ?`).bind(row.id).run();
    return json({ user: publicUser(row) }, 200, { "set-cookie": await sessionCookie(env, row) });
  }

  throw new ApiError(404, "not_found", "Unknown route.");
}
