// Admin page: manage people (add, edit, reset PINs, sign out, switch off) and check the sync.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const ROLE = { admin: "Admin", manager: "Manager", staff: "Staff" };
  let me = null;
  let people = [];
  let editing = null;

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (k === "text") e.textContent = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    e.append(...kids.filter((x) => x != null));
    return e;
  }

  async function api(method, url, body) {
    let res;
    try {
      res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error("Couldn't reach the diary. Check your connection.");
    }
    if (res.status === 401) { location.replace("/signin?next=/admin"); throw new Error("Signed out."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Something went wrong.");
    return data;
  }

  const when = (ms) => {
    if (!ms) return "never";
    const d = new Date(ms), mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  function showPin(box, name, pin) {
    box.replaceChildren(
      el("span", { text: `${name}'s PIN` }),
      el("b", { text: pin }),
      el("span", { class: "note", text: "Give it to them in person. It won't be shown again." }),
    );
    box.hidden = false;
  }

  /* ---------- people ---------- */

  function render() {
    const box = $("#people");
    box.replaceChildren();
    const active = people.filter((p) => p.active).length;
    $("#pplCount").textContent = `${active} active`;
    for (const p of people) {
      const isMe = p.id === me.id;
      const row = el("div", { class: "person" + (p.active ? "" : " off") },
        el("div", { class: "who" },
          el("strong", { text: p.name + (isMe ? " (you)" : "") }),
          el("div", { class: "meta" },
            el("span", { class: "pill" + (p.role === "admin" ? " ok" : p.role === "manager" ? " warn" : ""), text: ROLE[p.role] }),
            !p.active ? el("span", { class: "pill bad", text: "Switched off" }) : null,
            p.locked ? el("span", { class: "pill bad", text: "Locked: too many wrong PINs" }) : null,
            el("span", { text: p.lastLoginAt ? `Last signed in ${when(p.lastLoginAt)}` : "Never signed in" }))),
        el("div", { class: "row" },
          el("button", { class: "btn ghost sm", type: "button", "aria-expanded": String(editing === p.id), on: { click: () => { editing = editing === p.id ? null : p.id; render(); } } }, editing === p.id ? "Close" : "Manage")));
      if (editing === p.id) row.appendChild(editor(p, isMe));
      box.appendChild(row);
    }
  }

  function editor(p, isMe) {
    const msg = el("p", { role: "status" });
    const pinBox = el("div", { class: "pinbox", hidden: true, role: "status" });
    const name = el("input", { type: "text", id: "ename", value: p.name, maxlength: "60", autocapitalize: "words" });
    const role = el("select", { id: "erole" }, ...Object.entries(ROLE).map(([v, t]) => el("option", { value: v, selected: p.role === v }, t)));
    const pin = el("input", { type: "text", id: "epin", inputmode: "numeric", pattern: "[0-9]*", maxlength: "6", placeholder: "New PIN", autocomplete: "off" });

    async function change(body, done) {
      msg.className = "";
      msg.textContent = "Saving…";
      try {
        const r = await api("PATCH", `/api/admin/users/${p.id}`, body);
        people = people.map((x) => (x.id === p.id ? r.user : x));
        if (isMe && (body.pin || body.signOut || body.name)) { location.replace("/signin?next=/admin"); return; }
        render();
        const again = document.querySelector(".editor p[role=status]");
        if (again) { again.className = "ok"; again.textContent = done; }
        if (r.pin) showPin(document.querySelector(".editor .pinbox"), r.user.name, r.pin);
      } catch (e) {
        msg.className = "err";
        msg.textContent = e.message;
      }
    }

    return el("div", { class: "editor" },
      el("div", { class: "fields" },
        el("div", { class: "field" }, el("label", { for: "ename", text: "Name" }), name),
        el("div", { class: "field" }, el("label", { for: "erole", text: "Role" }), role)),
      el("div", { class: "row" },
        el("button", { class: "btn sm", type: "button", on: { click: () => {
          const body = {};
          if (name.value.trim() !== p.name) body.name = name.value;
          if (role.value !== p.role) body.role = role.value;
          if (!Object.keys(body).length) { msg.className = "note"; msg.textContent = "Nothing changed."; return; }
          change(body, "Saved.");
        } } }, "Save name and role")),
      el("p", { class: "note", text: "Renaming someone doesn't change the name on records they've already made." }),
      el("div", { class: "fields" },
        el("div", { class: "field" }, el("label", { for: "epin", text: "Set a new PIN" }), pin)),
      el("div", { class: "row" },
        el("button", { class: "btn ghost sm", type: "button", on: { click: () => {
          if (!/^\d{4,6}$/.test(pin.value.trim())) { msg.className = "err"; msg.textContent = "A PIN is 4 to 6 digits."; return; }
          change({ pin: pin.value.trim() }, "New PIN set. They've been signed out on every device.");
        } } }, "Set this PIN"),
        el("button", { class: "btn ghost sm", type: "button", on: { click: () => change({ pin: "generate" }, "New PIN created. They've been signed out on every device.") } }, "Create a new PIN"),
        p.locked ? el("button", { class: "btn ghost sm", type: "button", on: { click: () => change({ unlock: true }, "Unlocked.") } }, "Unlock") : null,
        el("button", { class: "btn ghost sm", type: "button", on: { click: () => change({ signOut: true }, "Signed out on every device.") } }, "Sign out everywhere"),
        isMe ? null : p.active
          ? el("button", { class: "btn ghost sm danger", type: "button", on: { click: () => change({ active: false }, "Switched off. They can't sign in, and their records stay.") } }, "Switch off")
          : el("button", { class: "btn ghost sm", type: "button", on: { click: () => change({ active: true }, "Switched back on.") } }, "Switch back on")),
      pinBox,
      msg);
  }

  $("#add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#addErr");
    const name = $("#aname").value.trim(), pin = $("#apin").value.trim();
    err.textContent = "";
    $("#newPin").hidden = true;
    if (!name) { err.textContent = "Enter a name."; return; }
    if (pin && !/^\d{4,6}$/.test(pin)) { err.textContent = "A PIN is 4 to 6 digits, or leave it blank."; return; }
    try {
      const r = await api("POST", "/api/admin/users", { name, role: $("#arole").value, ...(pin ? { pin } : {}) });
      people = [...people, r.user].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
      render();
      showPin($("#newPin"), r.user.name, r.pin);
      $("#aname").value = "";
      $("#apin").value = "";
      $("#arole").value = "staff";
    } catch (x) {
      err.textContent = x.message;
    }
  });

  /* ---------- sync ---------- */

  async function loadStatus() {
    const s = await api("GET", "/api/admin/status");
    const ago = s.lastSyncAt ? (Date.now() - s.lastSyncAt) / 60000 : null;
    const ok = ago != null && ago < 120;
    const pill = $("#syncPill");
    pill.className = "pill " + (ok ? "ok" : "warn");
    pill.textContent = ok ? "Running" : s.lastSyncAt ? "Late" : "Not started";
    $("#stats").replaceChildren(
      el("div", { class: "stat" }, el("span", { class: "note", text: "Last sync" }), el("b", { text: when(s.lastSyncAt) })),
      el("div", { class: "stat" }, el("span", { class: "note", text: "Website changes waiting" }), el("b", { text: String(s.webChangesPending) })),
      el("div", { class: "stat" }, el("span", { class: "note", text: "Records on the website" }), el("b", { text: String(s.docs) })));
    $("#syncNote").textContent = !s.syncTokenSet
      ? "The SYNC_TOKEN secret isn't set in Cloudflare, so Will's Claude can't sync."
      : !s.lastSyncAt
        ? "Will's Claude hasn't synced yet. It runs every hour once he's set it up with the sync token."
        : ok
          ? "Will's Claude syncs every hour. Changes made here reach his diary at the next sync."
          : "No sync for over 2 hours. Ask Will to check his scheduled task in Claude.";
  }

  /* ---------- start ---------- */

  (async () => {
    const { user } = await api("GET", "/api/auth/me");
    if (!user) { location.replace("/signin?next=/admin"); return; }
    if (user.role !== "admin") { location.replace("/"); return; }
    me = user;
    $("#me").textContent = `Signed in as ${user.name}`;
    people = (await api("GET", "/api/admin/users")).users;
    render();
    loadStatus().catch((e) => { $("#syncNote").textContent = e.message; });
  })().catch((e) => { $("#people").textContent = e.message; });
})();
