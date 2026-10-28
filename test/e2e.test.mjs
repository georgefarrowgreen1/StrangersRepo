// Browser test of the real page + shim against `wrangler dev`. Needs Playwright with Chromium:
//   npm i -D playwright && npx playwright install chromium     (then: npm run test:e2e)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startServer, SETUP_CODE } from "./harness.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = await import("playwright")); }

let srv, browser, COOKIE = "";
before(async () => {
  srv = await startServer();
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser?.close(); await srv?.stop(); });

async function api(op, body) {
  const r = await fetch(`${srv.base}/api/db/${op}`, {
    method: "POST", headers: { "content-type": "application/json", cookie: COOKIE }, body: JSON.stringify(body),
  });
  return r.json();
}

const settings = (address) => ({
  units: [{ id: "u1", name: "Fridge 1", kind: "fridge" }],
  opening: [{ id: "o1", t: "Hands washed" }, { id: "o2", t: "Surfaces sanitised" }],
  closing: [{ id: "c1", t: "Bins emptied" }],
  weekly: [{ id: "w1", t: "Deep clean fridges" }],
  closedDays: [], hide: {}, info: { address }, updatedBy: "web:Seeder", updatedAt: Date.now(),
});

test("staff journey on the real page", async () => {
  // A phone-sized screen: the tab bar, the Records and More lists, the site sheet and the account menu.
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // Signed out, the diary sends you to sign-in. With no accounts yet, that's the first-admin setup.
  await page.goto(srv.base + "/");
  await page.waitForURL(/\/signin$/);
  await page.locator("#setup").waitFor();
  await page.fill("#sname", "Sam Patel");
  assert.equal(await page.inputValue("#suser"), "sam.patel", "username suggested from the name");
  await page.fill("#spw", "admin-pass-1");
  await page.fill("#spw2", "admin-pass-1");
  await page.fill("#scode", "wrong code");
  await page.click("#setup button[type=submit]");
  await page.locator("#serr", { hasText: "setup code isn't right" }).waitFor();
  await page.fill("#scode", SETUP_CODE);
  await page.click("#setup button[type=submit]");

  // The admin page: add a member of staff, with a temporary password created for them.
  await page.waitForURL(/\/admin$/);
  await page.locator(".person", { hasText: "Sam Patel (you)" }).waitFor();
  await page.click("#addOpen");
  await page.fill("#aname", "Alex Brown");
  assert.equal(await page.inputValue("#auser"), "alex.brown");
  await page.click("#add button[type=submit]");
  await page.locator("#newPw b").first().waitFor();
  const [alexUser, alexTemp] = (await page.locator("#newPw b").allTextContents()).map((t) => t.trim());
  assert.equal(alexUser, "alex.brown");
  assert.match(alexTemp, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.locator(".person", { hasText: "Alex Brown" }).waitFor();
  assert.equal(await page.locator("#addPanel").isHidden(), true, "add form closes after adding");

  COOKIE = (await ctx.cookies()).filter((c) => c.name === "sfbb_session").map((c) => `${c.name}=${c.value}`).join("");
  await api("set", { path: "settings/main", data: settings("10 Dove Street") });
  await api("set", { path: "sites/cafe/settings/main", data: settings("21 Pottergate") });
  await api("set", { path: "sites/cafe/cleaning/job1", data: { name: "Clean coffee machine", how: "Backflush", freq: "daily", who: "Barista", createdAt: Date.now(), log: [] } });
  await api("set", { path: "days/2026-10-01", data: { date: "2026-10-01", opening: { items: { o1: true }, by: "web:Seeder", at: Date.now() } } });

  await page.click("a.back");
  await page.locator("#avatarBtn", { hasText: "SP" }).waitFor();
  assert.deepEqual(await accountMenu(page), ["Switch person", "Change password", "Admin", "Sign out"]);

  // Switch to the Cafe and tick an opening check.
  await switchSite(page, "Cafe");
  await page.locator("#openList label", { hasText: "Hands washed" }).waitFor();
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await page.locator("#openList label", { hasText: "Hands washed" }).click();
  await assert.doesNotReject(waitFor(async () => {
    const d = await api("get", { path: `sites/cafe/days/${today}` });
    return d.exists && d.data.opening?.items?.o1 === true && d.data.opening.by === "web:Sam Patel";
  }), "opening check saved with the person's name");

  // Second tab sees changes from the first within ~10 s.
  const page2 = await ctx.newPage();
  await page2.goto(srv.base + "/");
  await page2.locator("#openList label", { hasText: "Surfaces sanitised" }).waitFor();
  assert.match(await page2.locator("[data-sitebtn]:visible").innerText(), /Cafe/);
  const t0 = Date.now();
  await page.locator("#openList label", { hasText: "Surfaces sanitised" }).click();
  await page2.locator("#openList input:checked").nth(1).waitFor({ state: "attached", timeout: 10000 });
  console.log(`  second tab updated after ${Date.now() - t0} ms`);
  await page2.close();

  // Sign-off stays locked until the day is done, then signs as the signed-in person.
  assert.equal(await page.locator("#signFab").isHidden(), true);
  await page.locator("#signCard", { hasText: "Still to do: temperatures, closing checks" }).waitFor();
  await page.fill("#t_u1", "3.5");
  await page.locator("#t_u1").blur();
  await page.locator("#closeFoot button", { hasText: "Tick all" }).click();
  await page.locator("#signFab", { hasText: "Sign off as Sam" }).click();
  await page.locator("#signCard", { hasText: "By Sam Patel" }).waitFor();
  const day = await api("get", { path: `sites/cafe/days/${today}` });
  assert.equal(day.data.signed.name, "Sam Patel");
  assert.equal(day.data.signed.by, "web:Sam Patel");
  assert.deepEqual(day.data.opening.items, { o1: true, o2: true });
  assert.equal(day.data.temps.u1.am.v, 3.5);
  assert.ok(day.data.closing.allDone, "Tick all records who confirmed");

  // Sign off the week.
  await openSection(page, "week");
  await page.locator("#wkFoot button", { hasText: "Tick all" }).click();
  await page.locator("#wkSignFab", { hasText: "Sign off week as Sam" }).click();
  await page.locator("#wkSignCard", { hasText: "By Sam Patel" }).waitFor();
  const weeks = await api("query", { path: "sites/cafe/weeks" });
  assert.equal(weeks.docs[0].data.signed.name, "Sam Patel");

  // Mark a cleaning job done.
  await openSection(page, "cleaning");
  const job1 = page.locator("#kList .xrow", { hasText: "Clean coffee machine" });
  await job1.locator(".xhead .btn", { hasText: "Done" }).click();
  await page.locator("#kList .xrow", { hasText: "you" }).waitFor();
  const job = await api("get", { path: "sites/cafe/cleaning/job1" });
  assert.equal(job.data.lastBy, "web:Sam Patel");
  assert.equal(job.data.log.length, 1);

  // Set the date it was last done by hand.
  const past = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  if (!(await job1.locator("input[type=date]").isVisible())) await job1.locator(".xmain").click();
  await job1.locator("input[type=date]").fill(past);
  await job1.locator(".btn", { hasText: "Save date" }).click();
  await assert.doesNotReject(waitFor(async () => {
    const j = await api("get", { path: "sites/cafe/cleaning/job1" });
    return j.data.lastSet === true && j.data.log.length === 2 && j.data.log[0].set === true;
  }), "hand-entered last-done date saved");
  const jobSet = await api("get", { path: "sites/cafe/cleaning/job1" });
  const savedDay = await page.evaluate((at) => {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, jobSet.data.lastAt);
  assert.equal(savedDay, past);
  assert.equal(jobSet.data.lastBy, "web:Sam Patel");
  await page.locator("#kList .xrow", { hasText: "Clean coffee machine" }).locator(".pill.bad").waitFor();

  // Add an allergen item from the Add button.
  await openSection(page, "allergens");
  assert.equal(await page.locator("#algFormPanel").isHidden(), true, "form closed until Add");
  await page.click("#addBtn");
  await page.fill("#algName", "Almond croissant");
  await page.locator("#algChecks label", { hasText: /nuts/i }).first().click();
  await page.click("#algSave");
  await page.locator("#algList .xrow", { hasText: "Almond croissant" }).waitFor();
  const alg = await api("query", { path: "sites/cafe/allergens" });
  assert.equal(alg.docs[0].data.name, "Almond croissant");
  assert.equal(alg.docs[0].data.by, "web:Sam Patel");

  // Upload an allergen PDF and open it.
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  await page.locator("#adList button", { hasText: "Upload" }).click();
  await page.setInputFiles("#adFile", { name: "allergen-matrix.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.fill("#adTitle", "Allergen matrix");
  await page.click("#adSave");
  await page.locator("#adMsg", { hasText: "Uploaded to the Cafe" }).waitFor();
  const link = page.locator("#adList").getByRole("link", { name: "Open" }).first();
  await link.waitFor();
  const href = await link.getAttribute("href");
  assert.match(href, /^\/_blob\/[0-9a-f]{32}$/);
  const blob = await page.evaluate(async (u) => { const r = await fetch(u); return { type: r.headers.get("content-type"), size: (await r.arrayBuffer()).byteLength }; }, href);
  assert.deepEqual(blob, { type: "application/pdf", size: pdf.length });

  // Records show names: switch to the Roastery, whose seeded day was ticked by "Seeder".
  await switchSite(page, "Roastery");
  await openSection(page, "day");
  await page.fill("#dayDate", "2026-10-01");
  await page.locator("#dayDate").dispatchEvent("change");
  await page.locator("#openFoot", { hasText: "Seeder" }).waitFor();
  assert.equal(await page.locator("#pageTitle").innerText(), "Diary");

  // Managers' sections are in More.
  await openSection(page, "plans");
  assert.equal(await page.locator("#pageTitle").innerText(), "HACCP & risk");
  assert.doesNotMatch(await page.locator('[data-panel="plans"]').innerText(), /Claude/);

  // Sign out, then sign in as the new member of staff: username + temporary password, then their own.
  await accountMenu(page, "Sign out");
  await page.waitForURL(/\/signin$/);
  await page.fill("#username", "alex.brown");
  await page.fill("#password", "wrong-password");
  await page.click("#signin button[type=submit]");
  await page.locator("#err", { hasText: "tries left" }).waitFor();
  await page.fill("#password", alexTemp);
  await page.click("#signin button[type=submit]");
  await page.locator("#newpw", { hasText: "Hi Alex Brown" }).waitFor();
  await page.fill("#np1", "alex-own-pass");
  await page.fill("#np2", "alex-own-pass");
  await page.click("#newpw button[type=submit]");

  // Staff: no admin link, no manager sections, and the server refuses manager changes.
  await page.locator("#avatarBtn", { hasText: "AB" }).waitFor();
  assert.deepEqual(await accountMenu(page), ["Switch person", "Set a quick PIN", "Change password", "Sign out"]);
  await page.locator("#tabbar .tab", { hasText: "Records" }).click();
  assert.deepEqual(await page.locator("#recordsHub .lrow b").allTextContents(), ["Extra checks", "Cleaning", "Prove it", "Allergens"]);
  await page.locator("#tabbar .tab", { hasText: "More" }).click();
  assert.deepEqual(await page.locator("#moreHub .lrow b").allTextContents(), ["Last 4 weeks", "Switch person", "Set a quick PIN", "Change password", "Sign out"]);
  const refused = await fetch(`${srv.base}/api/db/set`, { method: "POST", headers: { "content-type": "application/json", cookie: (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
    body: JSON.stringify({ path: "suppliers/x", data: { name: "X" } }) });
  assert.equal((await refused.json()).code, "permission_denied");
  await page.goto(srv.base + "/admin");
  await page.waitForURL(srv.base + "/");
  await page.goto(srv.base + "/#setup");
  await page.locator("#openList").waitFor();
  assert.equal(await page.locator('[data-panel="day"]').isVisible(), true, "a manager section sends staff back to Today");
  assert.equal(await page.locator('[data-panel="setup"]').isVisible(), false);

  // Signing out leaves a plain sign-in form; the new password works.
  await accountMenu(page, "Sign out");
  await page.waitForURL(/\/signin$/);
  assert.equal(await page.inputValue("#username"), "");
  await page.fill("#username", "alex.brown");
  await page.fill("#password", "alex-own-pass");
  await page.click("#signin button[type=submit]");
  await page.locator("#avatarBtn", { hasText: "AB" }).waitFor();

  // Bad Wi-Fi: a tick made offline shows straight away, waits on the device, and saves once back online.
  const t1 = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  await page.locator("#weekCtl, #dayCtl").first().waitFor({ state: "attached" });
  await ctx.setOffline(true);
  await page.locator("#openList label", { hasText: "Hands washed" }).click();
  await page.locator("#conn", { hasText: "Offline · 1 change waiting" }).waitFor();
  assert.equal(await page.locator("#openList input").first().isChecked(), true, "the tick shows while offline");
  await ctx.setOffline(false);
  await page.locator("#conn").waitFor({ state: "hidden", timeout: 15000 });
  await page.locator("#toast", { hasText: "Back online" }).waitFor();
  const saved = await api("get", { path: `days/${t1}` });
  assert.equal(saved.data.opening.items.o1, true);
  assert.equal(saved.data.opening.by, "web:Alex Brown");

  // Quick switching: Alex sets a 4-digit PIN, signs out, then signs back in from the list with the PIN.
  await accountMenu(page, "Set a quick PIN");
  for (const pin of ["4826", "4826"]) {
    await page.locator(".pp-sheet").waitFor();
    for (const d of pin) await page.locator(".pp-key", { hasText: d }).first().click();
    await page.waitForTimeout(400);
  }
  await page.locator("#toast", { hasText: "Quick PIN set" }).waitFor();
  assert.ok((await accountMenu(page)).includes("Switch person"), "this device can switch person");
  await accountMenu(page, "Sign out");
  await page.waitForURL(/\/signin$/);
  await page.locator("#quick .person", { hasText: "Alex Brown" }).click();
  for (const d of "1357") await page.locator(".pp-key", { hasText: d }).first().click();
  await page.locator(".pp-msg", { hasText: "Wrong PIN" }).waitFor();
  for (const d of "4826") await page.locator(".pp-key", { hasText: d }).first().click();
  await page.waitForURL(srv.base + "/");
  await page.locator("#avatarBtn", { hasText: "AB" }).waitFor();

  assert.deepEqual(errors, []);
  await ctx.close();
});

// Opens a section the way staff do on a phone: Today and Week are tabs; everything else is listed
// under Records or More.
async function openSection(page, tab) {
  const tabs = { day: "Today", week: "Week" };
  if (tabs[tab]) return page.locator("#tabbar .tab", { hasText: tabs[tab] }).click();
  const name = { history: "Last 4 weeks", extras: "Extra checks", cleaning: "Cleaning", prove: "Prove it", allergens: "Allergens", eho: "EHO inspection",
    plans: "HACCP & risk", suppliers: "Suppliers", contacts: "Contacts", staff: "Staff training", onboarding: "Onboarding", review: "4-weekly review", setup: "Setup" }[tab];
  for (const hub of ["Records", "More"]) {
    await page.locator("#tabbar .tab", { hasText: hub }).click();
    const row = page.locator(`#${hub === "Records" ? "recordsHub" : "moreHub"} .lrow`, { hasText: name });
    if (await row.count()) { await row.first().click(); return page.locator("#pageTitle", { hasText: name }).waitFor(); }
  }
  throw new Error(`No list entry for ${tab}`);
}

async function switchSite(page, name) {
  await page.locator("[data-sitebtn]:visible").click();
  await page.locator("#siteList .lrow", { hasText: name }).click();
  await page.locator("[data-sitebtn]:visible", { hasText: name }).waitFor();
}

// With an item, picks it from the account menu; without, returns the menu's items and closes it.
async function accountMenu(page, item) {
  await page.click("#avatarBtn");
  if (item) return page.locator("#acctMenu .m", { hasText: item }).click();
  const items = await page.locator("#acctMenu .m").allTextContents();
  await page.keyboard.press("Escape");
  return items.map((t) => t.trim());
}

async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 200));
  }
}
