// Admin API (/api/admin/*): manage accounts and check the sync. Admins only (enforced in index.ts).
import { ROLES, Role, User, UserRow, checkPin, cleanName, hashPin, nameKey, newId, randomPin } from "./auth";
import { ApiError, Env, SQL_NOW_MS, invalid, json, readJson } from "./http";
import { isSynced } from "./paths";

function listItem(r: UserRow) {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    active: !!r.active,
    locked: r.locked_until > Date.now(),
    createdAt: r.created_at,
    createdBy: r.created_by,
    lastLoginAt: r.last_login_at,
  };
}

function checkRole(role: unknown): Role {
  if (!ROLES.includes(role as Role)) throw invalid("Role must be admin, manager or staff.");
  return role as Role;
}

async function getRow(env: Env, id: string): Promise<UserRow> {
  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  if (!row) throw new ApiError(404, "not_found", "No such person.");
  return row;
}

async function activeAdmins(env: Env): Promise<number> {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").first<{ n: number }>())?.n ?? 0;
}

async function nameTaken(env: Env, name: string, exceptId = ""): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT 1 FROM users WHERE name_key = ? AND id != ?").bind(nameKey(name), exceptId).first());
}

export async function handleAdmin(req: Request, env: Env, route: string, admin: User): Promise<Response> {
  // GET /api/admin/users
  if (route === "users" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM users ORDER BY active DESC, name_key").all<UserRow>();
    return json({ users: results.map(listItem) });
  }

  // POST /api/admin/users {name, role, pin?}: returns the PIN once if one was generated.
  if (route === "users" && req.method === "POST") {
    const body = await readJson<any>(req, 4096);
    const name = cleanName(body.name);
    if (!name) throw invalid("Enter a name (up to 60 characters).");
    if (await nameTaken(env, name)) throw new ApiError(409, "name_taken", `There's already someone called ${name}. Add a surname or initial.`);
    const role = checkRole(body.role ?? "staff");
    const pin = body.pin ? checkPin(body.pin) : randomPin();
    const { hash, salt } = await hashPin(pin);
    const id = newId();
    await env.DB.prepare(
      `INSERT INTO users (id, name, name_key, role, pin_hash, pin_salt, created_at, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ${SQL_NOW_MS}, ?, ${SQL_NOW_MS})`,
    ).bind(id, name, nameKey(name), role, hash, salt, admin.name).run();
    return json({ user: listItem(await getRow(env, id)), pin });
  }

  // PATCH /api/admin/users/<id> {name?, role?, active?, pin?: "1234" | "generate", unlock?, signOut?}
  const m = route.match(/^users\/([0-9a-f]{24})$/);
  if (m && req.method === "PATCH") {
    const body = await readJson<any>(req, 4096);
    const row = await getRow(env, m[1]);
    const sets: string[] = [];
    const args: unknown[] = [];
    let bump = false; // sign this person out everywhere
    let pinOut: string | undefined;

    if (body.name !== undefined) {
      const name = cleanName(body.name);
      if (!name) throw invalid("Enter a name (up to 60 characters).");
      if (await nameTaken(env, name, row.id)) throw new ApiError(409, "name_taken", `There's already someone called ${name}.`);
      sets.push("name = ?", "name_key = ?");
      args.push(name, nameKey(name));
      bump = true; // their records are written under their name, so sessions must pick up the new one
    }
    const losingAdmin =
      row.role === "admin" && row.active &&
      ((body.role !== undefined && body.role !== "admin") || body.active === false);
    if (losingAdmin && (await activeAdmins(env)) <= 1) {
      throw new ApiError(409, "last_admin", "This is the only admin. Make someone else an admin first.");
    }
    if (body.role !== undefined) {
      sets.push("role = ?");
      args.push(checkRole(body.role));
    }
    if (body.active !== undefined) {
      sets.push("active = ?");
      args.push(body.active ? 1 : 0);
      if (!body.active) bump = true;
    }
    if (body.pin !== undefined) {
      pinOut = body.pin === "generate" ? randomPin() : checkPin(body.pin);
      const { hash, salt } = await hashPin(pinOut);
      sets.push("pin_hash = ?", "pin_salt = ?", "failed = 0", "locked_until = 0");
      args.push(hash, salt);
      bump = true;
    }
    if (body.unlock) sets.push("failed = 0", "locked_until = 0");
    if (body.signOut) bump = true;
    if (bump) sets.push("session_ver = session_ver + 1");
    if (!sets.length) throw invalid("Nothing to change.");
    sets.push(`updated_at = ${SQL_NOW_MS}`);
    await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, row.id).run();
    return json({ user: listItem(await getRow(env, row.id)), ...(body.pin === "generate" ? { pin: pinOut } : {}) });
  }

  // GET /api/admin/status: is Will's sync running?
  if (route === "status" && req.method === "GET") {
    const [docs, meta, pending] = await env.DB.batch<any>([
      env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE deleted = 0"),
      env.DB.prepare("SELECT v FROM meta WHERE k = 'lastApplyAt'"),
      env.DB.prepare("SELECT path FROM docs WHERE source = 'web'"),
    ]);
    return json({
      docs: docs.results[0].n,
      lastSyncAt: meta.results[0]?.v || null,
      webChangesPending: (pending.results as { path: string }[]).filter((r) => isSynced(r.path)).length,
      syncTokenSet: !!env.SYNC_TOKEN,
    });
  }

  throw new ApiError(404, "not_found", "Unknown admin route.");
}
