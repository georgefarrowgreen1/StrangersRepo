// A 4-digit PIN pad in a bottom sheet, used by the diary (switch person, set a quick PIN) and the sign-in
// page (quick sign-in). PinPad.open({title, sub, onPin}) shows it; onPin(pin) returns a Promise that
// resolves to null when the PIN is accepted (the pad closes) or to a message to show (the pad clears).
(() => {
  "use strict";
  let open = null;

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") e.textContent = v;
      else if (k === "onclick") e.addEventListener("click", v);
      else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids) if (kid != null) e.append(kid);
    return e;
  }

  function close() {
    if (!open) return;
    open.veil.remove();
    open.sheet.remove();
    document.removeEventListener("keydown", open.onKey);
    open = null;
  }

  function show({ title, sub, onPin }) {
    close();
    let pin = "", busy = false;
    const dots = el("div", { class: "pp-dots", "aria-hidden": "true" }, ...[0, 1, 2, 3].map(() => el("i")));
    const msg = el("p", { class: "pp-msg", role: "alert" });
    const live = el("span", { class: "pp-live", "aria-live": "polite" });
    const paint = () => {
      dots.querySelectorAll("i").forEach((d, i) => d.classList.toggle("on", i < pin.length));
      live.textContent = `${pin.length} of 4 digits`;
    };
    async function press(k) {
      if (busy) return;
      if (k === "del") pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += k;
      msg.textContent = "";
      paint();
      if (pin.length < 4) return;
      busy = true;
      sheet.classList.add("busy");
      let err;
      try { err = await onPin(pin); } catch (e) { err = (e && e.message) || "Something went wrong. Try again."; }
      busy = false;
      sheet.classList.remove("busy");
      if (!err) return close();
      msg.textContent = err;
      pin = "";
      paint();
      sheet.classList.remove("shake");
      void sheet.offsetWidth;
      sheet.classList.add("shake");
    }
    const key = (k, label, extra) => el("button", { type: "button", class: "pp-key" + (extra ? " " + extra : ""), "aria-label": label || k, onclick: () => press(k) }, label === "Delete" ? "⌫" : k);
    const keys = el("div", { class: "pp-keys" },
      ...["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => key(k)),
      el("button", { type: "button", class: "pp-key alt", onclick: close }, "Cancel"),
      key("0"), key("del", "Delete", "alt"));
    const veil = el("div", { class: "pp-veil", onclick: close });
    const sheet = el("div", { class: "pp-sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
      el("div", { class: "pp-grab", "aria-hidden": "true" }),
      el("h2", { text: title }), sub ? el("p", { class: "pp-sub", text: sub }) : null,
      dots, live, msg, keys);
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
      else if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.append(veil, sheet);
    open = { veil, sheet, onKey };
    paint();
    sheet.querySelector(".pp-key").focus();
  }

  window.PinPad = { open: show, close };
})();
