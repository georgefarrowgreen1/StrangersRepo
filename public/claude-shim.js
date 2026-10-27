// claude-shim.js: provides window.claude for the Kitchen Diary page outside Claude.
// The page talks to its data only through window.claude.use(name); this implements the same API
// (docs/runtime-api.md) against the Worker's /api routes. Loaded before the page's own script.
(() => {
  "use strict";

  /* ---------- theme ---------- */

  // The Liquid Glass theme (public/theme.css). Delete this line to go back to the page's own look.
  const THEME = "/theme.css";

  // Written during parsing so it lands after the page's <style> (and wins) and blocks the first paint,
  // so the page never flashes unstyled.
  if (THEME) {
    if (document.readyState === "loading") document.write(`<link rel="stylesheet" href="${THEME}">`);
    else document.body.appendChild(Object.assign(document.createElement("link"), { rel: "stylesheet", href: THEME }));
  }

  /* ---------- the person's name (no login for now) ---------- */

  const COOKIE = "sfbb_name";
  const YEAR = 365 * 24 * 3600;

  function readName() {
    const m = document.cookie.match(/(?:^|;\s*)sfbb_name=([^;]*)/);
    if (!m) return "";
    try { return cleanName(decodeURIComponent(m[1])); } catch (e) { return ""; }
  }
  function cleanName(s) {
    const n = String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
    return n.length <= 60 ? n : "";
  }
  function saveName(name) {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE}=${encodeURIComponent(name)}; Max-Age=${YEAR}; Path=/; SameSite=Lax${secure}`;
  }

  let name = readName();
  let namePromise = null;

  function ensureName() {
    if (name) return Promise.resolve(name);
    if (!namePromise) namePromise = askName({ first: true }).then((n) => { name = n; saveName(n); prefillSignName(n); return n; });
    return namePromise;
  }

  const style = document.createElement("style");
  style.textContent = `
    #who img[src=""]{display:none}
    .shim-veil{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.45)}
    .shim-box{width:100%;max-width:380px;box-sizing:border-box;padding:20px;border-radius:var(--r,6px);
      background:var(--surface,#fff);color:var(--fg,#16212a);border:1px solid var(--line,#d3dade);box-shadow:0 10px 40px rgba(0,0,0,.25)}
    .shim-box h2{margin:0 0 6px;font-family:var(--display,inherit);font-size:20px}
    .shim-box p{margin:0 0 14px;color:var(--muted,#5a6872);font-size:14px;line-height:1.4}
    .shim-box input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px;border-radius:var(--r,6px);
      border:1px solid var(--line,#d3dade);background:var(--bg,#f3f5f6);color:inherit}
    .shim-box .shim-err{color:var(--bad,#b3261e);font-size:13px;min-height:18px;margin-top:6px}
    .shim-row{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
    .shim-change{background:none;border:0;padding:0;font:inherit;font-size:12px;color:var(--accent,#1d5a7e);
      text-decoration:underline;cursor:pointer;white-space:nowrap}
  `;
  document.head.appendChild(style);

  function askName({ first }) {
    return new Promise((resolve) => {
      const veil = document.createElement("div");
      veil.className = "shim-veil";
      veil.innerHTML = `
        <form class="shim-box" role="dialog" aria-modal="true" aria-labelledby="shim-title">
          <h2 id="shim-title">${first ? "Who's using the diary?" : "Change name"}</h2>
          <p>Enter your name. The diary records who did each check, so use the name your team knows you by.</p>
          <label for="shim-name" class="by">Your name</label>
          <input id="shim-name" name="name" autocomplete="name" maxlength="60" required>
          <div class="shim-err" aria-live="polite"></div>
          <div class="shim-row">
            ${first ? "" : '<button type="button" class="btn ghost" data-cancel>Cancel</button>'}
            <button type="submit" class="btn">${first ? "Continue" : "Save"}</button>
          </div>
        </form>`;
      const form = veil.querySelector("form");
      const input = veil.querySelector("input");
      const err = veil.querySelector(".shim-err");
      input.value = name;
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const n = cleanName(input.value);
        if (!n) { err.textContent = input.value.trim() ? "Use 60 characters or fewer." : "Enter your name to continue."; input.focus(); return; }
        veil.remove();
        resolve(n);
      });
      const cancel = veil.querySelector("[data-cancel]");
      if (cancel) cancel.addEventListener("click", () => { veil.remove(); resolve(null); });
      document.body.appendChild(veil);
      input.focus();
      input.select();
    });
  }

  async function changeName() {
    const n = await askName({ first: false });
    if (!n || n === name) return;
    saveName(n);
    try { localStorage.setItem("sfbb.signName", n); } catch (e) {}
    location.reload();
  }

  // "Recording as Sam Patel · Change name": the page fills #who; add the link beside its text.
  function addChangeLink() {
    const who = document.getElementById("who");
    if (!who || !who.firstChild || who.querySelector(".shim-change")) return;
    const sep = document.createElement("span");
    sep.className = "by";
    sep.textContent = "·";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shim-change";
    btn.textContent = "Change name";
    btn.addEventListener("click", changeName);
    who.append(sep, btn);
  }
  function watchWho() {
    const who = document.getElementById("who");
    if (!who) return;
    new MutationObserver(addChangeLink).observe(who, { childList: true });
    addChangeLink();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchWho);
  else watchWho();

  /* ---------- page polish (the page file itself stays untouched) ---------- */

  function addHead(tag, attrs) {
    document.head.appendChild(Object.assign(document.createElement(tag), attrs));
  }

  function polishPage() {
    document.documentElement.lang = document.documentElement.lang || "en-GB";
    document.title = "Kitchen Diary · Strangers Coffee";

    // Add to Home Screen: name, icon, full-screen launch and status-bar colour.
    addHead("meta", { name: "theme-color", content: "#edf1f6", media: "(prefers-color-scheme: light)" });
    addHead("meta", { name: "theme-color", content: "#05070b", media: "(prefers-color-scheme: dark)" });
    addHead("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    addHead("meta", { name: "mobile-web-app-capable", content: "yes" });
    addHead("meta", { name: "apple-mobile-web-app-title", content: "Kitchen Diary" });
    addHead("meta", { name: "apple-mobile-web-app-status-bar-style", content: "default" });
    addHead("link", { rel: "apple-touch-icon", href: "/icon-180.png" });
    addHead("link", { rel: "icon", type: "image/png", href: "/icon-192.png" });
    addHead("link", { rel: "manifest", href: "/manifest.webmanifest" });

    // The section buttons act as tabs (they carry aria-selected), so give them tab roles.
    document.querySelectorAll("nav.tabs .grp").forEach((g) => {
      g.setAttribute("role", "tablist");
      const label = g.querySelector(".label");
      if (label) g.setAttribute("aria-label", label.textContent.trim());
    });
    document.querySelectorAll("nav.tabs button[data-tab]").forEach((b) => b.setAttribute("role", "tab"));

    const adFile = document.getElementById("adFile");
    if (adFile && !adFile.getAttribute("aria-label")) adFile.setAttribute("aria-label", "Choose an allergen PDF");

    // Reading reports with Claude isn't available here, so the EHO upload panel only offers entry by hand.
    const eho = document.getElementById("ehoUploadPanel");
    if (eho) {
      const h = eho.querySelector("h2");
      if (h) h.textContent = "Record an inspection";
      eho.querySelectorAll("p.note").forEach((p) => { p.hidden = true; });
    }

    // Tab bar: keep the chosen tab in view, and bring its section into view when the bar is pinned.
    const nav = document.querySelector("nav.tabs");
    if (nav) {
      nav.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-tab]");
        if (!b) return;
        requestAnimationFrame(() => {
          const nr = nav.getBoundingClientRect(), br = b.getBoundingClientRect();
          if (nav.scrollWidth > nav.clientWidth) nav.scrollBy({ left: br.left + br.width / 2 - (nr.left + nr.width / 2), behavior: "smooth" });
          const panel = document.querySelector(`[data-panel="${b.dataset.tab}"]`);
          if (panel && panel.getBoundingClientRect().top < nr.bottom) {
            window.scrollTo({ top: window.scrollY + panel.getBoundingClientRect().top - nr.bottom - 12, behavior: "smooth" });
          }
        });
      });
      const sel = nav.querySelector('button[aria-selected="true"]');
      if (sel && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = sel.offsetLeft - nav.clientWidth / 2 + sel.offsetWidth / 2;
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", polishPage);
  else polishPage();

  // Sign-off asks for a typed name; start it from the name we already know (the page remembers it after).
  function prefillSignName(n) {
    try { if (n && !localStorage.getItem("sfbb.signName")) localStorage.setItem("sfbb.signName", n); } catch (e) {}
  }
  prefillSignName(name);

  /* ---------- API calls ---------- */

  function headers(extra) {
    return Object.assign({ "x-diary-name": encodeURIComponent(name) }, extra);
  }

  async function call(url, init) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw { code: "unavailable", message: "Couldn't reach the diary. Check your connection." };
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* not JSON */ }
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
    await ensureName();
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
      const n = await ensureName();
      return { id: "web:" + n, name: n, avatarUrl: "" };
    },
    async can(perm) { return perm === "data.write"; },
    async profiles(ids) { return api("profiles", { ids }); },
  };

  /* ---------- assets (allergen PDFs) ---------- */

  const assets = {
    async upload(file, opts) {
      await ensureName();
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
