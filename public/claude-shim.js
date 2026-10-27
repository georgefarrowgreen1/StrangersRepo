// claude-shim.js: the diary's data connection. The page (app.js) talks to its data only through
// window.claude.use(name), the API it was first written against in Claude (docs/runtime-api.md);
// this implements it against the Worker's /api routes. Loaded before app.js.
(() => {
  "use strict";

  /* ---------- the signed-in person ---------- */

  function goSignIn() {
    location.replace("/signin?next=" + encodeURIComponent(location.pathname + location.search + location.hash));
  }

  // Never settles when redirecting to sign-in, so the page doesn't start up with no one signed in.
  const mePromise = fetch("/api/auth/me")
    .then((r) => r.json())
    .then(({ user }) => (user ? user : (goSignIn(), new Promise(() => {}))));

  // Sign-off asks for a typed name; start it from the signed-in person's. The page fills the box from
  // localStorage on its first render, before we know who's signed in, so clear the last person's name
  // straight away (devices are shared) and set this person's once known.
  try { localStorage.removeItem("sfbb.signName"); } catch (e) {}
  mePromise.then((u) => { try { localStorage.setItem("sfbb.signName", u.name); } catch (e) {} });

  /* ---------- API calls ---------- */

  const headers = (extra) => Object.assign({}, extra);

  async function call(url, init) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw { code: "unavailable", message: "Couldn't reach the diary. Check your connection." };
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* not JSON */ }
    if (res.status === 401) goSignIn();
    if (!res.ok) throw { code: (body && body.code) || "unavailable", message: (body && body.message) || `HTTP ${res.status}` };
    return body;
  }

  const api = (op, body) =>
    call("/api/db/" + op, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify(body) });

  /* ---------- live updates: one batched poll for every subscription ---------- */

  const VISIBLE_MS = 5000;
  const HIDDEN_MS = 30000;
  const subs = new Map();
  let nextKey = 1, seq = null, timer = null, inflight = false, again = false;

  function subscribe(spec, deliver, onError) {
    const key = String(nextKey++);
    subs.set(key, { spec, deliver, onError, ver: undefined, last: undefined });
    schedule(0);
    return () => { subs.delete(key); };
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(pollNow, ms);
  }

  function refresh() {
    if (inflight) again = true;
    else schedule(0);
  }

  async function pollNow() {
    if (inflight) { again = true; return; }
    if (!subs.size) return;
    inflight = true;
    const entries = [...subs];
    try {
      const r = await api("poll", { since: seq, queries: entries.map(([key, s]) => Object.assign({ key, ver: s.ver }, s.spec)) });
      seq = r.seq;
      for (const [key, res] of Object.entries(r.results || {})) {
        const s = subs.get(key);
        if (!s) continue;
        s.ver = res.ver;
        const text = JSON.stringify(res);
        if (text === s.last) continue; // same result as last time: don't re-render
        s.last = text;
        try { s.deliver(res); } catch (e) { console.error(e); }
      }
    } catch (e) {
      if (e && e.code === "invalid_argument") for (const [, s] of entries) if (s.onError) try { s.onError(e); } catch (_) {}
    }
    inflight = false;
    if (again) { again = false; schedule(0); }
    else if (subs.size) schedule(document.hidden ? HIDDEN_MS : VISIBLE_MS);
  }

  document.addEventListener("visibilitychange", () => { if (!document.hidden && subs.size && !inflight) schedule(0); });

  /* ---------- db ---------- */

  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const docSnap = (id, exists, data) => ({ id, exists, data: () => (exists ? copy(data) : undefined) });
  const querySnap = (docs) => ({ docs: docs.map((d) => ({ id: d.id, data: () => copy(d.data) })) });

  function segments(path) {
    if (typeof path !== "string") throw new TypeError("Path must be a string");
    const parts = path.split("/");
    if (parts.some((p) => !p)) throw new TypeError(`Invalid path: ${path}`);
    return parts;
  }

  const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
  function randomId() {
    const b = crypto.getRandomValues(new Uint8Array(20));
    return Array.from(b, (x) => ALNUM[x % 36]).join("");
  }

  async function write(op, body) {
    try { await api(op, body); } finally { refresh(); }
  }

  function docRef(path) {
    const parts = segments(path);
    if (parts.length % 2 !== 0) throw new TypeError(`Not a document path: ${path}`);
    const id = parts[parts.length - 1];
    return {
      id,
      path,
      async get() {
        const r = await api("get", { path });
        return docSnap(id, r.exists, r.data);
      },
      set: (data) => write("set", { path, data }),
      update: (patch) => write("update", { path, patch }),
      delete: () => write("delete", { path }),
      onSnapshot(next, error) {
        return subscribe({ kind: "doc", path }, (r) => next(docSnap(id, r.exists, r.data)), error);
      },
    };
  }

  function query(path, opts) {
    const spec = () => ({ kind: "col", path, orderBy: opts.orderBy, dir: opts.dir, limit: opts.limit });
    return {
      orderBy: (field, dir) => query(path, Object.assign({}, opts, { orderBy: field, dir: dir === "desc" ? "desc" : "asc" })),
      limit: (n) => query(path, Object.assign({}, opts, { limit: n })),
      async get() {
        const r = await api("query", spec());
        return querySnap(r.docs);
      },
      onSnapshot(next, error) {
        return subscribe(spec(), (r) => next(querySnap(r.docs)), error);
      },
    };
  }

  function collectionRef(path) {
    const parts = segments(path);
    if (parts.length % 2 !== 1) throw new TypeError(`Not a collection path: ${path}`);
    return Object.assign(query(path, {}), {
      id: parts[parts.length - 1],
      path,
      doc: (id) => docRef(path + "/" + (id || randomId())),
      async add(data) {
        const ref = docRef(path + "/" + randomId());
        await ref.set(data);
        return ref;
      },
    });
  }

  const db = { doc: docRef, collection: collectionRef };

  /* ---------- user ---------- */

  const user = {
    async me() {
      const u = await mePromise;
      return { id: u.recordId, name: u.name, avatarUrl: "", role: u.role };
    },
    async can(perm) { return perm === "data.write"; }, // every role records entries; section limits are separate
    async profiles(ids) { return api("profiles", { ids }); },
  };

  /* ---------- assets (allergen PDFs) ---------- */

  const assets = {
    async upload(file, opts) {
      const type = (opts && opts.type) || file.type || "application/octet-stream";
      return call("/api/assets", { method: "POST", headers: headers({ "content-type": type }), body: file });
    },
    async delete(id) {
      return call("/api/assets/" + encodeURIComponent(id), { method: "DELETE", headers: headers() });
    },
  };

  const services = { db, user, sample: null, assets };
  window.claude = { use: async (n) => services[n] ?? null };
})();
