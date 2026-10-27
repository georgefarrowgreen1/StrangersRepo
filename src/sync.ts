// Sync API for Will's Claude (docs/sync.md). Every route here is behind the sync token (see access.ts).
import { ApiError, Env, SQL_NOW_MS, invalid, json, readJson } from "./http";
import { SYNCED_COLLECTIONS, canonical, encodeDoc, isSynced, parseDocPath } from "./paths";

const BUMP_SEQ = "UPDATE meta SET v = v + 1 WHERE k = 'seq'";
const CUR_SEQ = "(SELECT v FROM meta WHERE k = 'seq')";
const MAX_APPLY = 500;

function parseSyncPath(path: unknown) {
  const p = parseDocPath(path);
  if (!isSynced(p.path)) throw invalid(`Not a synced path: ${p.path}`);
  return p;
}

function num(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw invalid(`${name} must be a number (ms since epoch).`);
  return v;
}

/** GET /api/sync/changes?since=<ms>: website edits since the watermark, tombstones included. */
async function changes(env: Env, url: URL): Promise<Response> {
  const since = Number(url.searchParams.get("since") ?? "0");
  if (!Number.isFinite(since)) throw invalid("since must be a number.");
  // `now` comes from the database clock in the same batch as the read, so a write that lands after this
  // read always has updated_at > now and is picked up by the next run.
  const [nowRes, rowsRes] = await env.DB.batch<any>([
    env.DB.prepare(`SELECT ${SQL_NOW_MS} AS now`),
    env.DB.prepare(
      "SELECT path, data, deleted, updated_at, claude_data FROM docs WHERE source = 'web' AND updated_at > ? ORDER BY updated_at",
    ).bind(since),
  ]);
  const now = nowRes.results[0].now as number;
  const out = (rowsRes.results as any[])
    .filter((r) => isSynced(r.path))
    .map((r) => ({
      path: r.path,
      data: r.deleted || r.data == null ? null : JSON.parse(r.data),
      deleted: !!r.deleted,
      updated_at: r.updated_at,
      base: r.claude_data == null ? null : JSON.parse(r.claude_data),
    }));
  return json({ now, changes: out });
}

interface Existing {
  path: string;
  data: string | null;
  deleted: number;
  source: string;
  updated_at: number;
  claude_data: string | null;
}

async function loadExisting(env: Env, paths: string[]): Promise<Map<string, Existing>> {
  const { results } = await env.DB.prepare(
    "SELECT path, data, deleted, source, updated_at, claude_data FROM docs WHERE path IN (SELECT value FROM json_each(?))",
  ).bind(JSON.stringify(paths)).all<Existing>();
  return new Map(results.map((r) => [r.path, r]));
}

/** Splits rows into JSON arrays of at most ~1 MB each, for one-statement bulk writes via json_each. */
function jsonChunks(rows: unknown[]): string[] {
  const out: string[] = [];
  let cur: string[] = [], size = 0;
  for (const r of rows) {
    const t = JSON.stringify(r);
    if (cur.length && size + t.length > 1_000_000) {
      out.push("[" + cur.join(",") + "]");
      cur = [];
      size = 0;
    }
    cur.push(t);
    size += t.length;
  }
  if (cur.length) out.push("[" + cur.join(",") + "]");
  return out;
}

/** POST /api/sync/apply: write Claude's documents, unless the website changed them after Claude pulled. */
async function apply(req: Request, env: Env): Promise<Response> {
  const body = await readJson<any>(req, 64 * 1024 * 1024);
  const pulledAt = num(body.pulledAt, "pulledAt");
  if (!Array.isArray(body.docs)) throw invalid("docs must be an array.");
  if (body.docs.length > MAX_APPLY) throw invalid(`At most ${MAX_APPLY} docs per request.`);

  const rejected: { path: string; reason: string }[] = [];
  const items: { path: string; collection: string; id: string; text: string | null }[] = [];
  const seen = new Set<string>();
  for (const d of body.docs) {
    try {
      const p = parseSyncPath(d?.path);
      if (seen.has(p.path)) throw invalid(`Duplicate path: ${p.path}`);
      seen.add(p.path);
      items.push({ ...p, text: d.deleted ? null : encodeDoc(d.data) });
    } catch (e) {
      rejected.push({ path: String(d?.path), reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const existing = await loadExisting(env, items.map((i) => i.path));
  const skipped: string[] = [];
  const upserts: { p: string; c: string; i: string; t: string }[] = [];
  const deletes: string[] = [];
  const quiet: { p: string; t: string | null }[] = [];
  let applied = 0;

  for (const it of items) {
    const ex = existing.get(it.path);
    if (ex && ex.source === "web" && ex.updated_at > pulledAt) {
      skipped.push(it.path);
      continue;
    }
    applied++;
    const exLive = !!ex && !ex.deleted && ex.data != null;
    const same = it.text == null ? !exLive : exLive && canonical(JSON.parse(ex!.data!)) === canonical(JSON.parse(it.text));
    if (same) {
      // Identical content: record what Claude has (for conflict detection) without triggering page refreshes.
      if (ex && (ex.source !== "claude" || ex.claude_data !== it.text)) quiet.push({ p: it.path, t: it.text });
    } else if (it.text == null) {
      deletes.push(it.path);
    } else {
      upserts.push({ p: it.path, c: it.collection, i: it.id, t: it.text });
    }
  }

  // Each statement repeats the skip rule, so a website edit landing between our read and write is still protected.
  const guard = (t: string) => `NOT (${t}source = 'web' AND ${t}updated_at > ?)`;
  const stmts: D1PreparedStatement[] = [];
  for (const chunk of jsonChunks(upserts)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO docs (path, collection, doc_id, data, updated_at, source, deleted, claude_data, seq, updated_by)
         SELECT json_extract(value, '$.p'), json_extract(value, '$.c'), json_extract(value, '$.i'), json_extract(value, '$.t'),
           ${SQL_NOW_MS}, 'claude', 0, json_extract(value, '$.t'), ${CUR_SEQ}, 'sync'
         FROM json_each(?) WHERE true
         ON CONFLICT (path) DO UPDATE SET data = excluded.data, deleted = 0, claude_data = excluded.claude_data,
           source = 'claude', updated_at = excluded.updated_at, seq = excluded.seq, updated_by = 'sync'
         WHERE ${guard("docs.")}`,
      ).bind(chunk, pulledAt),
    );
  }
  if (deletes.length) {
    stmts.push(
      env.DB.prepare(
        `UPDATE docs SET data = NULL, deleted = 1, claude_data = NULL, source = 'claude', updated_at = ${SQL_NOW_MS},
           seq = ${CUR_SEQ}, updated_by = 'sync'
         WHERE path IN (SELECT value FROM json_each(?)) AND deleted = 0 AND ${guard("")}`,
      ).bind(JSON.stringify(deletes), pulledAt),
    );
  }
  if (stmts.length) stmts.unshift(env.DB.prepare(BUMP_SEQ));
  for (const chunk of jsonChunks(quiet)) {
    stmts.push(
      env.DB.prepare(
        `UPDATE docs SET source = 'claude',
           claude_data = (SELECT json_extract(value, '$.t') FROM json_each(?) WHERE json_extract(value, '$.p') = docs.path)
         WHERE path IN (SELECT json_extract(value, '$.p') FROM json_each(?)) AND ${guard("")}`,
      ).bind(chunk, chunk, pulledAt),
    );
  }
  stmts.push(env.DB.prepare(`UPDATE meta SET v = ${SQL_NOW_MS} WHERE k = 'lastApplyAt'`));
  await env.DB.batch(stmts); // one transaction
  return json({ applied, skipped, ...(rejected.length ? { rejected } : {}) });
}

/** POST /api/sync/manifest: tombstone docs in the listed collections that Claude no longer has. */
async function manifest(req: Request, env: Env): Promise<Response> {
  const body = await readJson<any>(req, 16 * 1024 * 1024);
  const pulledAt = num(body.pulledAt, "pulledAt");
  if (!Array.isArray(body.collections) || !Array.isArray(body.paths)) throw invalid("collections and paths must be arrays.");
  const allowed = new Set(SYNCED_COLLECTIONS);
  const collections = [...new Set(body.collections as unknown[])];
  for (const c of collections) if (typeof c !== "string" || !allowed.has(c)) throw invalid(`Not a synced collection: ${String(c)}`);
  const keep = new Set((body.paths as unknown[]).filter((p): p is string => typeof p === "string"));

  const { results } = await env.DB.prepare(
    `SELECT path FROM docs WHERE deleted = 0 AND collection IN (SELECT value FROM json_each(?))
     AND NOT (source = 'web' AND updated_at > ?)`,
  ).bind(JSON.stringify(collections), pulledAt).all<{ path: string }>();
  const doomed = results.map((r) => r.path).filter((p) => !keep.has(p));
  if (doomed.length) {
    await env.DB.batch([
      env.DB.prepare(BUMP_SEQ),
      env.DB.prepare(
        `UPDATE docs SET data = NULL, deleted = 1, claude_data = NULL, source = 'claude', updated_at = ${SQL_NOW_MS},
           seq = ${CUR_SEQ}, updated_by = 'sync'
         WHERE path IN (SELECT value FROM json_each(?)) AND deleted = 0 AND NOT (source = 'web' AND updated_at > ?)`,
      ).bind(JSON.stringify(doomed), pulledAt),
    ]);
  }
  return json({ removed: doomed });
}

/** GET /api/sync/status */
async function status(env: Env): Promise<Response> {
  const [docs, meta, pending] = await env.DB.batch<any>([
    env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE deleted = 0"),
    env.DB.prepare("SELECT v FROM meta WHERE k = 'lastApplyAt'"),
    env.DB.prepare("SELECT path FROM docs WHERE source = 'web'"),
  ]);
  return json({
    docs: docs.results[0].n,
    lastApplyAt: meta.results[0]?.v ?? 0,
    webChangesPending: (pending.results as { path: string }[]).filter((r) => isSynced(r.path)).length,
  });
}

export async function handleSync(req: Request, env: Env, route: string, url: URL): Promise<Response> {
  if (route === "changes" && req.method === "GET") return changes(env, url);
  if (route === "status" && req.method === "GET") return status(env);
  if (route === "apply" && req.method === "POST") return apply(req, env);
  if (route === "manifest" && req.method === "POST") return manifest(req, env);
  throw new ApiError(404, "not_found", "Unknown sync route.");
}
