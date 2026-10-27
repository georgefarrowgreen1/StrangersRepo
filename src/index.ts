// Strangers Coffee Kitchen Diary staff site.
// Serves the diary page unchanged (plus claude-shim.js) and the API the shim and Will's sync use.
import { authorize, limitWrites, requireName } from "./access";
import { deleteAsset, serveBlob, uploadAsset } from "./assets";
import { WRITE_OPS, handleDb } from "./docs";
import { ApiError, Env, errorResponse, json } from "./http";
import { handleSync } from "./sync";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "http:" && !local) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    let res: Response;
    try {
      res = await route(req, env, ctx, url);
    } catch (e) {
      if (e instanceof ApiError) res = errorResponse(e);
      else {
        console.error(e);
        const msg = String((e as Error)?.message || e);
        // D1 reports a full database as SQLITE_FULL; the page shows a specific message for quota_exceeded.
        res = /SQLITE_FULL|database or disk is full/i.test(msg)
          ? json({ code: "quota_exceeded", message: "The database is full." }, 507)
          : json({ code: "internal", message: "Something went wrong." }, 500);
      }
    }
    return withSecurityHeaders(res, local);
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const caller = await authorize(req, env, url);
  if (caller instanceof Response) return caller;
  const p = url.pathname;

  if (p.startsWith("/api/sync/")) return handleSync(req, env, p.slice("/api/sync/".length), url);

  const db = p.match(/^\/api\/db\/([a-z]+)$/);
  if (db) {
    if (WRITE_OPS.has(db[1])) {
      requireName(caller);
      await limitWrites(req, env, ctx);
    }
    return handleDb(req, env, db[1], () => requireName(caller));
  }

  if (p === "/api/assets" && req.method === "POST") {
    const by = requireName(caller);
    await limitWrites(req, env, ctx);
    return uploadAsset(req, env, by);
  }
  const asset = p.match(/^\/api\/assets\/([^/]+)$/);
  if (asset && req.method === "DELETE") {
    requireName(caller);
    await limitWrites(req, env, ctx);
    return deleteAsset(env, asset[1]);
  }

  const blob = p.match(/^\/_blob\/([^/]+)$/);
  if (blob && (req.method === "GET" || req.method === "HEAD")) return serveBlob(env, blob[1]);

  if (p.startsWith("/api/")) throw new ApiError(404, "not_found", "Unknown API route.");
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  return env.ASSETS.fetch(req);
}

function withSecurityHeaders(res: Response, local: boolean): Response {
  const out = new Response(res.body, res);
  const h = out.headers;
  h.set("x-robots-tag", "noindex, nofollow");
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "same-origin");
  h.set("content-security-policy", "frame-ancestors 'none'");
  if (!local) h.set("strict-transport-security", "max-age=31536000");
  return out;
}
