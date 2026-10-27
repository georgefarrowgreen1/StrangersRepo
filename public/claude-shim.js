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

  /* ---------- the signed-in person ---------- */

  // Sections only managers and admins use. The Worker enforces the same rule on saves.
  const MANAGER_TABS = new Set(["eho", "plans", "suppliers", "contacts", "staff", "onboarding", "review", "setup"]);

  function goSignIn() {
    location.replace("/signin?next=" + encodeURIComponent(location.pathname + location.search));
  }

  // Never settles when redirecting to sign-in, so the page doesn't start up with no one signed in.
  const mePromise = fetch("/api/auth/me")
    .then((r) => r.json())
    .then(({ user }) => (user ? user : (goSignIn(), new Promise(() => {}))));

  const style = document.createElement("style");
  style.textContent = `
    #who img[src=""]{display:none}
    nav.tabs button.gl-denied{display:none!important}
    .shim-change{background:none;border:0;padding:0;font:inherit;font-size:12px;color:var(--accent,#1d5a7e);
      text-decoration:underline;cursor:pointer;white-space:nowrap}
  `;
  document.head.appendChild(style);

  async function switchUser() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch (e) {}
    location.replace("/signin");
  }

  // "Recording as Sam Patel · Switch user · Admin": the page fills #who; add the links beside its text.
  function addWhoLinks() {
    const who = document.getElementById("who");
    if (!who || !who.firstChild || who.querySelector(".shim-change")) return;
    const sep = () => Object.assign(document.createElement("span"), { className: "by shim-sep", textContent: "·" });
    const sw = Object.assign(document.createElement("button"), { type: "button", className: "shim-change", textContent: "Switch user" });
    sw.addEventListener("click", switchUser);
    who.append(sep(), sw);
    mePromise.then((u) => {
      if (u.role === "admin" && !who.querySelector(".shim-admin")) {
        who.append(sep(), Object.assign(document.createElement("a"), { className: "shim-change shim-admin", href: "/admin", textContent: "Admin" }));
      }
    });
  }
  function watchWho() {
    const who = document.getElementById("who");
    if (!who) return;
    new MutationObserver(addWhoLinks).observe(who, { childList: true });
    addWhoLinks();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchWho);
  else watchWho();

  // Staff don't see the manager sections; if one is opened anyway (a saved tab, or a "Needs attention"
  // link), go back to the daily diary.
  function applyRole(nav, user, refreshMenus) {
    if (user.role !== "staff") return;
    nav.querySelectorAll("button[data-tab]").forEach((b) => { if (MANAGER_TABS.has(b.dataset.tab)) b.classList.add("gl-denied"); });
    if (refreshMenus) refreshMenus();
    const guard = () => {
      const sel = nav.querySelector('button[aria-selected="true"]');
      if (!sel || !sel.classList.contains("gl-denied")) return;
      const day = nav.querySelector('button[data-tab="day"]');
      if (day) day.click();
      const t = document.getElementById("toast");
      if (t) { t.textContent = "That section is for managers."; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2400); }
    };
    new MutationObserver(guard).observe(nav, { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
    guard();
  }

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
          if (b.offsetParent && nav.scrollWidth > nav.clientWidth) nav.scrollBy({ left: br.left + br.width / 2 - (nr.left + nr.width / 2), behavior: "smooth" });
          const panel = document.querySelector(`[data-panel="${b.dataset.tab}"]`);
          if (panel && panel.getBoundingClientRect().top < nr.bottom) {
            window.scrollTo({ top: window.scrollY + panel.getBoundingClientRect().top - nr.bottom - 12, behavior: "smooth" });
          }
        });
      });
      const refreshMenus = THEME ? buildSectionMenus(nav) : null;
      mePromise.then((u) => applyRole(nav, u, refreshMenus));
      const sel = nav.querySelector('button[aria-selected="true"]');
      if (sel && sel.offsetParent && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = sel.offsetLeft - nav.clientWidth / 2 + sel.offsetWidth / 2;
    }
  }

  /*
   * Section menus: the first tab group (Diary) stays as tabs; the other groups (Records, Management)
   * become pull-down menus, or one "More" menu on narrow screens. The page's own buttons stay in the
   * DOM, hidden, and the menus simply click them, so the page's logic is untouched. If the tab bar
   * isn't laid out as expected (a new page version), nothing is changed.
   */
  function buildSectionMenus(nav) {
    const groups = [...nav.querySelectorAll(":scope > .grp")];
    if (groups.length < 2 || groups.some((g) => !g.querySelector("button[data-tab]"))) return;
    const later = groups.slice(1).map((g) => ({
      name: (g.querySelector(".label") || {}).textContent?.trim() || "More",
      tabs: [...g.querySelectorAll("button[data-tab]")],
    }));

    const veil = Object.assign(document.createElement("div"), { className: "gl-veil", hidden: true });
    document.body.appendChild(veil);
    const bar = Object.assign(document.createElement("div"), { className: "gl-menubar" });
    const chevron = '<svg class="gl-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    // Phones show the More menu as an iOS-style "…" button.
    const dots = '<svg class="gl-dots" viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.8"/><circle cx="10" cy="10" r="1.8"/><circle cx="16" cy="10" r="1.8"/></svg>';
    const menus = [];
    let openMenu = null, nextId = 1;

    function makeMenu(title, sets, cls) {
      const trigger = Object.assign(document.createElement("button"), { type: "button", className: "gl-trigger " + cls });
      const pop = Object.assign(document.createElement("div"), { className: "gl-pop", hidden: true, id: "gl-menu-" + nextId++ });
      pop.setAttribute("role", "menu");
      pop.setAttribute("aria-label", title);
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-controls", pop.id);
      document.body.appendChild(pop);
      const m = { title, sets, trigger, pop };
      trigger.addEventListener("click", () => (openMenu === m ? close() : open(m)));
      trigger.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(m); }
      });
      pop.addEventListener("keydown", (e) => {
        const items = [...pop.querySelectorAll('[role="menuitemradio"]')];
        const i = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown") items[(i + 1) % items.length].focus();
        else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length].focus();
        else if (e.key === "Home") items[0].focus();
        else if (e.key === "End") items[items.length - 1].focus();
        else if (e.key === "Escape") { close(); trigger.focus(); }
        else if (e.key === "Tab") close();
        else return;
        if (e.key !== "Tab") e.preventDefault();
      });
      menus.push(m);
      bar.appendChild(trigger);
    }

    function render(m) {
      m.pop.replaceChildren();
      for (const set of m.sets) {
        const tabs = set.tabs.filter((b) => !b.hidden && !b.classList.contains("gl-denied"));
        if (!tabs.length) continue;
        const grp = document.createElement("div");
        grp.setAttribute("role", "group");
        grp.setAttribute("aria-label", set.name);
        if (m.sets.length > 1) grp.appendChild(Object.assign(document.createElement("div"), { className: "gl-head", textContent: set.name }));
        for (const b of tabs) {
          const on = b.getAttribute("aria-selected") === "true";
          const item = Object.assign(document.createElement("button"), { type: "button", className: "gl-item", textContent: b.textContent.trim() });
          item.setAttribute("role", "menuitemradio");
          item.setAttribute("aria-checked", String(on));
          item.tabIndex = -1;
          item.addEventListener("click", () => { close(); b.click(); m.trigger.focus({ preventScroll: true }); });
          grp.appendChild(item);
        }
        m.pop.appendChild(grp);
      }
    }

    function sheetMode() { return window.innerWidth <= 600; }

    function open(m) {
      close();
      render(m);
      openMenu = m;
      m.trigger.setAttribute("aria-expanded", "true");
      const sheet = sheetMode();
      m.pop.classList.toggle("sheet", sheet);
      veil.hidden = !sheet;
      m.pop.hidden = false;
      if (!sheet) {
        const r = m.trigger.getBoundingClientRect(), w = m.pop.offsetWidth;
        m.pop.style.top = r.bottom + 8 + "px";
        m.pop.style.left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) + "px";
      } else {
        m.pop.style.top = m.pop.style.left = "";
      }
      (m.pop.querySelector('[aria-checked="true"]') || m.pop.querySelector(".gl-item"))?.focus({ preventScroll: true });
    }

    function close() {
      if (!openMenu) return;
      openMenu.pop.hidden = true;
      openMenu.trigger.setAttribute("aria-expanded", "false");
      veil.hidden = true;
      openMenu = null;
    }

    // The trigger shows the current section when it's inside that menu, and hides if the site has
    // switched off every section in it.
    function update() {
      for (const m of menus) {
        const tabs = m.sets.flatMap((s) => s.tabs);
        const active = tabs.find((b) => b.getAttribute("aria-selected") === "true");
        m.trigger.innerHTML = "";
        m.trigger.append(Object.assign(document.createElement("span"), { textContent: active ? active.textContent.trim() : m.title }));
        m.trigger.insertAdjacentHTML("beforeend", chevron);
        if (m.trigger.classList.contains("more")) m.trigger.insertAdjacentHTML("beforeend", dots);
        m.trigger.classList.toggle("on", !!active);
        const none = tabs.every((b) => b.hidden || b.classList.contains("gl-denied"));
        if (m.trigger.hidden !== none) m.trigger.hidden = none; // only on change: this runs from a MutationObserver
        m.trigger.setAttribute("aria-label", active ? `${m.title}: ${active.textContent.trim()}` : m.title);
      }
    }

    for (const set of later) makeMenu(set.name, [set], "split");
    makeMenu("More", later, "more");
    groups.slice(1).forEach((g) => { g.hidden = true; });
    groups[0].after(bar);
    nav.classList.add("gl-menus");
    update();
    new MutationObserver(update).observe(nav, { subtree: true, attributes: true, attributeFilter: ["aria-selected", "hidden"] });

    veil.addEventListener("click", close);
    document.addEventListener("pointerdown", (e) => {
      if (openMenu && !openMenu.pop.contains(e.target) && !openMenu.trigger.contains(e.target)) close();
    });
    window.addEventListener("resize", close);
    window.addEventListener("scroll", () => { if (openMenu && !sheetMode()) close(); }, { passive: true });
    return update;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", polishPage);
  else polishPage();

  // Sign-off asks for a typed name; start it from the signed-in person's (devices are shared, so it's
  // set on every load rather than only the first).
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
      return { id: u.recordId, name: u.name, avatarUrl: "" };
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
