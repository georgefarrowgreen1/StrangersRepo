// Admin page: manage people (add, edit, set temporary passwords, sign out, switch off).
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

  function showPassword(box, user, password) {
    box.replaceChildren(
      el("span", { text: `${user.name} signs in as` }),
      el("b", { text: user.username }),
      el("span", { text: "with the temporary password" }),
      el("b", { text: password }),
      el("span", { class: "note", text: "Give it to them in person. They'll choose their own password when they first sign in. It won't be shown again." }),
    );
    box.hidden = false;
  }

  /* ---------- people ---------- */

  const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const chev = () => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "i"); s.innerHTML = '<path d="M9 6l6 6-6 6"/>'; return el("span", { class: "chev" }, s); };

  function render() {
    const box = $("#people");
    box.replaceChildren();
    const active = people.filter((p) => p.active).length;
    $("#pplCount").textContent = `${active} active`;
    for (const p of people) {
      const isMe = p.id === me.id, open = editing === p.id;
      const row = el("div", { class: "person" + (p.active ? "" : " off") + (open ? " open" : "") },
        el("button", { class: "prow", type: "button", "aria-expanded": String(open), on: { click: () => { editing = open ? null : p.id; render(); } } },
          el("span", { class: "avatar", text: initials(p.name) }),
          el("span", { class: "t" },
            el("b", { text: p.name + (isMe ? " (you)" : "") }),
            el("span", { class: "s", text: `${p.username} · ${p.lastLoginAt ? "signed in " + when(p.lastLoginAt) : "never signed in"}` })),
          el("span", { class: "pills" },
            el("span", { class: "pill" + (p.role === "admin" ? " ok" : p.role === "manager" ? " warn" : ""), text: ROLE[p.role] }),
            !p.active ? el("span", { class: "pill bad", text: "Switched off" }) : null,
            p.locked ? el("span", { class: "pill bad", text: "Locked" }) : null,
            p.active && p.mustChange ? el("span", { class: "pill warn", text: "Temporary password" }) : null),
          chev()));
      if (open) row.appendChild(editor(p, isMe));
      box.appendChild(row);
    }
  }

  function editor(p, isMe) {
    const msg = el("p", { role: "status" });
    const pinBox = el("div", { class: "pinbox", hidden: true, role: "status" });
    const name = el("input", { type: "text", id: "ename", value: p.name, maxlength: "60", autocapitalize: "words" });
    const username = el("input", { type: "text", id: "euser", value: p.username, maxlength: "32", autocapitalize: "none", autocorrect: "off", spellcheck: "false" });
    const role = el("select", { id: "erole" }, ...Object.entries(ROLE).map(([v, t]) => el("option", { value: v, selected: p.role === v }, t)));
    const pw = el("input", { type: "text", id: "epw", maxlength: "128", placeholder: "At least 8 characters", autocomplete: "off", autocapitalize: "none", spellcheck: "false" });

    async function change(body, done) {
      msg.className = "";
      msg.textContent = "Saving…";
      try {
        const r = await api("PATCH", `/api/admin/users/${p.id}`, body);
        people = people.map((x) => (x.id === p.id ? r.user : x));
        if (isMe && (body.password || body.signOut || body.name)) { location.replace("/signin?next=/admin"); return; }
        render();
        const again = document.querySelector(".editor p[role=status]");
        if (again) { again.className = "ok"; again.textContent = done; }
        if (r.password) showPassword(document.querySelector(".editor .pinbox"), r.user, r.password);
      } catch (e) {
        msg.className = "err";
        msg.textContent = e.message;
      }
    }

    return el("div", { class: "editor" },
      p.locked ? el("p", { class: "err", text: "Locked after too many wrong passwords. It unlocks by itself after 10 minutes, or unlock it now below." }) : null,
      el("h3", { text: "Details" }),
      el("div", { class: "fields" },
        el("div", { class: "field" }, el("label", { for: "ename", text: "Name (shown on records)" }), name),
        el("div", { class: "field" }, el("label", { for: "euser", text: "Username" }), username),
        el("div", { class: "field" }, el("label", { for: "erole", text: "Role" }), role)),
      el("div", { class: "row" },
        el("button", { class: "btn sm", type: "button", on: { click: () => {
          const body = {};
          if (name.value.trim() !== p.name) body.name = name.value;
          if (username.value.trim().toLowerCase() !== p.username) body.username = username.value.trim().toLowerCase();
          if (role.value !== p.role) body.role = role.value;
          if (!Object.keys(body).length) { msg.className = "note"; msg.textContent = "Nothing changed."; return; }
          change(body, "Saved.");
        } } }, "Save changes")),
      el("p", { class: "note", text: "Renaming someone doesn't change the name on records they've already made." }),
      el("h3", { text: "Password and access" }),
      el("div", { class: "fields" },
        el("div", { class: "field" }, el("label", { for: "epw", text: "Set a temporary password" }), pw)),
      el("div", { class: "row" },
        el("button", { class: "btn ghost sm", type: "button", on: { click: () => {
          if (pw.value.length < 8) { msg.className = "err"; msg.textContent = "Passwords need at least 8 characters."; return; }
          change({ password: pw.value }, "Temporary password set. They've been signed out everywhere and will choose a new password at next sign-in.");
        } } }, "Set this password"),
        el("button", { class: "btn ghost sm", type: "button", on: { click: () => change({ password: "generate" }, "Temporary password created. They've been signed out everywhere and will choose a new password at next sign-in.") } }, "Create a temporary password"),
        p.locked ? el("button", { class: "btn ghost sm", type: "button", on: { click: () => change({ unlock: true }, "Unlocked.") } }, "Unlock") : null,
        el("button", { class: "btn ghost sm", type: "button", on: { click: () => change({ signOut: true }, "Signed out on every device.") } }, "Sign out everywhere"),
        isMe ? null : p.active
          ? el("button", { class: "btn ghost sm danger", type: "button", on: { click: () => change({ active: false }, "Switched off. They can't sign in, and their records stay.") } }, "Switch off")
          : el("button", { class: "btn ghost sm", type: "button", on: { click: () => change({ active: true }, "Switched back on.") } }, "Switch back on")),
      pinBox,
      msg);
  }

  // Suggest a username from the name until the admin types their own.
  let userEdited = false;
  $("#auser").addEventListener("input", () => { userEdited = true; });
  $("#aname").addEventListener("input", () => {
    if (!userEdited) $("#auser").value = $("#aname").value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 .-]/g, "").trim().replace(/\s+/g, ".").slice(0, 32);
  });

  function addPanel(open) {
    $("#addPanel").hidden = !open;
    $("#addOpen").hidden = open;
    if (open) { $("#newPw").hidden = true; $("#aname").focus(); }
  }
  $("#addOpen").addEventListener("click", () => addPanel(true));
  $("#addClose").addEventListener("click", () => addPanel(false));

  $("#add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#addErr");
    const name = $("#aname").value.trim(), username = $("#auser").value.trim().toLowerCase(), password = $("#apw").value;
    err.textContent = "";
    $("#newPw").hidden = true;
    if (!name) { err.textContent = "Enter a name."; return; }
    if (!username) { err.textContent = "Enter a username."; return; }
    if (password && password.length < 8) { err.textContent = "Passwords need at least 8 characters, or leave it blank."; return; }
    try {
      const r = await api("POST", "/api/admin/users", { name, username, role: $("#arole").value, ...(password ? { password } : {}) });
      people = [...people, r.user].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
      render();
      if (r.password) showPassword($("#newPw"), r.user, r.password);
      else { $("#newPw").replaceChildren(el("span", { text: `${r.user.name} signs in as ${r.user.username} with the password you chose, then picks their own.` })); $("#newPw").hidden = false; }
      $("#aname").value = "";
      $("#auser").value = "";
      userEdited = false;
      $("#apw").value = "";
      $("#arole").value = "staff";
      addPanel(false);
      $("#newPw").hidden = false;
    } catch (x) {
      err.textContent = x.message;
    }
  });

  /* ---------- start ---------- */

  (async () => {
    const { user } = await api("GET", "/api/auth/me");
    if (!user) { location.replace("/signin?next=/admin"); return; }
    if (user.role !== "admin") { location.replace("/"); return; }
    me = user;
    $("#me").textContent = "Admin";
    people = (await api("GET", "/api/admin/users")).users;
    render();
  })().catch((e) => { $("#people").textContent = e.message; });
})();
