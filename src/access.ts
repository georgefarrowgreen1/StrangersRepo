import { User, sessionUser } from "./auth";
import { ApiError, Env, safeEqual } from "./http";

/** Who is making a request. */
export type Caller =
  | { kind: "sync" } // Will's Claude, holding the sync token
  | { kind: "user"; user: User } // a signed-in member of staff
  | { kind: "anon" }; // not signed in

/**
 * The one place access is decided. Every request passes through here before routing.
 *
 * /api/sync/* needs the sync token. Everything else identifies the person from their session cookie
 * (name + PIN sign-in, see auth.ts); index.ts then decides what an anonymous caller may reach (only the
 * sign-in page and its assets) and what each role may do (see canWrite and canOpenTab below).
 */
export async function authorize(req: Request, env: Env, url: URL): Promise<Caller | Response> {
  if (url.pathname.startsWith("/api/sync/")) {
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!env.SYNC_TOKEN || !token || !(await safeEqual(token, env.SYNC_TOKEN))) {
      return new Response(JSON.stringify({ code: "unauthenticated", message: "Missing or wrong sync token." }), {
        status: 401,
        headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
      });
    }
    return { kind: "sync" };
  }
  const user = await sessionUser(req, env);
  return user ? { kind: "user", user } : { kind: "anon" };
}

/** Pages and files anyone may load: the sign-in screen and what it needs. */
export function isPublicAsset(path: string): boolean {
  return (
    path === "/signin" || path === "/signin.html" || path === "/signin.js" || path === "/theme.css" ||
    path === "/robots.txt" || path === "/manifest.webmanifest" || /^\/icon-\d+\.png$/.test(path)
  );
}

export function requireUser(caller: Caller): User {
  if (caller.kind !== "user") throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  return caller.user;
}

/** The id written into records ("by" fields): web:<name>, as before accounts existed. */
export const recordId = (u: User) => "web:" + u.name;

/* ---------- roles ---------- */

// Sections and data only managers and admins may change. Staff can still read them (the "Needs attention"
// summary counts overdue reviews and plans), but the page hides these sections from them.
const MANAGER_TABS = new Set(["eho", "plans", "suppliers", "contacts", "staff", "onboarding", "review", "setup"]);
const MANAGER_COLLECTIONS = new Set(["settings", "plans", "inspections", "suppliers", "contacts", "staff", "onboarding", "reviews"]);

export const canOpenTab = (u: User, tab: string) => u.role !== "staff" || !MANAGER_TABS.has(tab);

export function canWrite(u: User, path: string): boolean {
  if (u.role !== "staff") return true;
  if (path === "config/shared") return false;
  const parts = path.split("/");
  return !MANAGER_COLLECTIONS.has(parts[parts.length - 2]);
}

export function requireWrite(u: User, path: unknown): void {
  if (typeof path === "string" && !canWrite(u, path)) {
    // Not invalid_argument: the page treats that as "read-only for everything".
    throw new ApiError(403, "permission_denied", "Only managers can change this.");
  }
}

const WINDOW_MS = 15 * 60 * 1000;

/** Counts a write against the caller's IP; throws rate_limited once over the limit for this 15-minute window. */
export async function limitWrites(req: Request, env: Env, ctx: ExecutionContext): Promise<void> {
  const limit = Number(env.WRITE_LIMIT_PER_15_MIN) || 600;
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const window = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits (ip, window, n) VALUES (?, ?, 1) ON CONFLICT (ip, window) DO UPDATE SET n = n + 1 RETURNING n",
  ).bind(ip, window).first<{ n: number }>();
  if (Math.random() < 0.02) {
    ctx.waitUntil(env.DB.prepare("DELETE FROM rate_limits WHERE window < ?").bind(window - WINDOW_MS).run());
  }
  if (row && row.n > limit) {
    throw new ApiError(429, "rate_limited", "Too many changes from this connection. Wait a few minutes and try again.");
  }
}
