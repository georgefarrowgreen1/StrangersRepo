import { ApiError, Env, safeEqual } from "./http";

/** Who is making a request. */
export type Caller =
  | { kind: "sync" } // Will's Claude, holding the sync token
  | { kind: "person"; name: string | null }; // anyone on the website; name is what they typed

/**
 * The one place access is decided. Every request passes through here before routing.
 *
 * For now the site is public: pages and the db/assets API are open, and the person is identified only
 * by the name they typed (sent by claude-shim.js). Only /api/sync/* needs the sync token.
 *
 * When logins are added (a shared password with a signed session cookie, or Cloudflare Access reading
 * Cf-Access-Authenticated-User-Email), this function is where they go: return a redirect/401 for
 * requests without a session, and take the name from the session instead of the header.
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
  return { kind: "person", name: personName(req) };
}

/** The name sent by the shim (URI-encoded header), falling back to the name cookie. */
function personName(req: Request): string | null {
  let raw = req.headers.get("x-diary-name");
  if (raw == null) {
    const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)sfbb_name=([^;]*)/);
    raw = m ? m[1] : null;
  }
  if (raw == null) return null;
  try {
    return cleanName(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export function cleanName(s: string): string | null {
  const name = s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return name && name.length <= 60 ? name : null;
}

/** The user id written into records: web:<name>. Writes need a name so records show who did them. */
export function requireName(caller: Caller): string {
  if (caller.kind === "sync") return "sync";
  if (!caller.name) throw new ApiError(401, "name_required", "Enter your name before recording entries.");
  return "web:" + caller.name;
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
