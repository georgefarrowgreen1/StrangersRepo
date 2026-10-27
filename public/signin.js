// Sign-in page: name + PIN, with one-tap buttons for people who've signed in on this device before.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const RECENT = "sfbb.people";
  const MAX_RECENT = 8;

  // Only same-site paths, so the next= link can't send people elsewhere.
  const next = (() => {
    const n = new URLSearchParams(location.search).get("next") || "/";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/";
  })();

  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT) || "[]").filter((x) => typeof x === "string"); } catch (e) { return []; } };
  function remember(name) {
    try { localStorage.setItem(RECENT, JSON.stringify([name, ...recent().filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, MAX_RECENT))); } catch (e) {}
  }

  async function post(url, body) {
    let res;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error("Couldn't reach the diary. Check your connection.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Something went wrong. Try again.");
    return data;
  }

  /* ---------- sign in ---------- */

  function showPeople() {
    const names = recent();
    const box = $("#people");
    box.replaceChildren();
    for (const n of names) {
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: n });
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => pick(n));
      box.appendChild(b);
    }
    const has = names.length > 0;
    $("#peopleField").hidden = !has;
    $("#nameField").hidden = has;
    $("#someoneElse").hidden = !has;
  }

  function pick(name) {
    $("#name").value = name;
    for (const b of $("#people").children) b.setAttribute("aria-pressed", String(b.textContent === name));
    $("#err").textContent = "";
    $("#pin").value = "";
    $("#pin").focus();
  }

  $("#someoneElse").addEventListener("click", () => {
    $("#peopleField").hidden = true;
    $("#someoneElse").hidden = true;
    $("#nameField").hidden = false;
    $("#name").value = "";
    $("#name").focus();
  });

  $("#signin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#err");
    const name = $("#name").value.trim();
    const pin = $("#pin").value.trim();
    if (!name) { err.textContent = recent().length ? "Tap your name, or choose Someone else." : "Enter your name."; return; }
    if (!/^\d{4,6}$/.test(pin)) { err.textContent = "Enter your PIN (4 to 6 digits)."; $("#pin").focus(); return; }
    err.textContent = "";
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const { user } = await post("/api/auth/login", { name, pin });
      remember(user.name);
      location.replace(next);
    } catch (x) {
      err.textContent = x.message;
      $("#pin").value = "";
      $("#pin").focus();
      btn.disabled = false;
    }
  });

  /* ---------- first admin ---------- */

  $("#setup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#serr");
    const name = $("#sname").value.trim(), pin = $("#spin").value.trim(), pin2 = $("#spin2").value.trim(), code = $("#scode").value.trim();
    if (!name) { err.textContent = "Enter your name."; return; }
    if (!/^\d{4,6}$/.test(pin)) { err.textContent = "Choose a PIN of 4 to 6 digits."; return; }
    if (pin !== pin2) { err.textContent = "The two PINs don't match."; return; }
    if (!code) { err.textContent = "Enter the setup code."; return; }
    err.textContent = "";
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const { user } = await post("/api/auth/setup", { name, pin, code });
      remember(user.name);
      location.replace("/admin");
    } catch (x) {
      err.textContent = x.message;
      btn.disabled = false;
    }
  });

  /* ---------- admin PIN recovery ---------- */

  $("#toRecover").addEventListener("click", () => { $("#signin").hidden = true; $("#recover").hidden = false; $("#rname").focus(); });
  $("#toSignin").addEventListener("click", () => { $("#recover").hidden = true; $("#signin").hidden = false; });

  $("#recover").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#rerr");
    const name = $("#rname").value.trim(), pin = $("#rpin").value.trim(), code = $("#rcode").value.trim();
    if (!name) { err.textContent = "Enter the admin's name."; return; }
    if (!/^\d{4,6}$/.test(pin)) { err.textContent = "Choose a PIN of 4 to 6 digits."; return; }
    if (!code) { err.textContent = "Enter the setup code."; return; }
    err.textContent = "";
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const { user } = await post("/api/auth/recover", { name, pin, code });
      remember(user.name);
      location.replace("/admin");
    } catch (x) {
      err.textContent = x.message;
      btn.disabled = false;
    }
  });

  /* ---------- start ---------- */

  fetch("/api/auth/me").then((r) => r.json()).then(({ user, setupNeeded }) => {
    if (user) { location.replace(next); return; }
    if (setupNeeded) {
      $("#setup").hidden = false;
      $("#sname").focus();
    } else {
      $("#signin").hidden = false;
      showPeople();
      (recent().length ? $("#people button") : $("#name")).focus();
    }
  }).catch(() => {
    $("#signin").hidden = false;
    $("#err").textContent = "Couldn't reach the diary. Check your connection and reload.";
  });
})();
