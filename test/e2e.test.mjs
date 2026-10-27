// Browser test of the real page + shim against `wrangler dev`. Needs Playwright with Chromium:
//   npm i -D playwright && npx playwright install chromium     (then: npm run test:e2e)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startServer, SYNC_TOKEN } from "./harness.mjs";

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
  const ctx = await browser.newContext();
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
  await page.fill("#scode", SYNC_TOKEN);
  await page.click("#setup button[type=submit]");

  // The admin page: add a member of staff, with a temporary password created for them.
  await page.waitForURL(/\/admin$/);
  await page.locator(".person", { hasText: "Sam Patel (you)" }).waitFor();
  await page.fill("#aname", "Alex Brown");
  assert.equal(await page.inputValue("#auser"), "alex.brown");
  await page.click("#add button[type=submit]");
  await page.locator("#newPw b").first().waitFor();
  const [alexUser, alexTemp] = (await page.locator("#newPw b").allTextContents()).map((t) => t.trim());
  assert.equal(alexUser, "alex.brown");
  assert.match(alexTemp, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.locator(".person", { hasText: "Alex Brown" }).waitFor();

  COOKIE = (await ctx.cookies()).filter((c) => c.name === "sfbb_session").map((c) => `${c.name}=${c.value}`).join("");
  await api("set", { path: "settings/main", data: settings("10 Dove Street") });
  await api("set", { path: "sites/cafe/settings/main", data: settings("21 Pottergate") });
  await api("set", { path: "sites/cafe/cleaning/job1", data: { name: "Clean coffee machine", how: "Backflush", freq: "daily", who: "Barista", createdAt: Date.now(), log: [] } });
  await api("set", { path: "days/2026-10-01", data: { date: "2026-10-01", opening: { items: { o1: true }, by: "web:Seeder", at: Date.now() } } });

  await page.click("text=Back to the diary");
  await page.locator("#who", { hasText: "Recording as Sam Patel" }).waitFor();
  await page.locator("#who .shim-admin").waitFor();

  // Switch to the Cafe and tick an opening check.
  await page.locator("#sites button", { hasText: "Cafe" }).click();
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
  assert.equal(await page2.locator("#sites button[aria-pressed=true]").innerText().then((t) => t.includes("Cafe")), true);
  const t0 = Date.now();
  await page.locator("#openList label", { hasText: "Surfaces sanitised" }).click();
  await page2.locator("#openList label", { hasText: "Surfaces sanitised" }).locator("input:checked").waitFor({ timeout: 10000 });
  console.log(`  second tab updated after ${Date.now() - t0} ms`);
  await page2.close();

  // Sign off the day with a name.
  await page.fill("#signName", "Sam Patel");
  await page.locator("#signArea button", { hasText: "Sign off" }).click();
  await page.locator("#signArea", { hasText: "Signed by Sam Patel" }).waitFor();
  const day = await api("get", { path: `sites/cafe/days/${today}` });
  assert.equal(day.data.signed.name, "Sam Patel");
  assert.equal(day.data.signed.by, "web:Sam Patel");
  assert.deepEqual(day.data.opening.items, { o1: true, o2: true });

  // Sign off the week with a name.
  await openSection(page, "week");
  await page.fill("#wkSignName", "Sam Patel");
  await page.locator("#wkSign button", { hasText: "Sign off" }).click();
  await page.locator("#wkSign", { hasText: "Signed by Sam Patel" }).waitFor();
  const weeks = await api("query", { path: "sites/cafe/weeks" });
  assert.equal(weeks.docs[0].data.signed.name, "Sam Patel");

  // Mark a cleaning job done.
  await openSection(page, "cleaning");
  await page.locator(".task", { hasText: "Clean coffee machine" }).getByRole("button", { name: "Done" }).click();
  await page.locator(".task", { hasText: "by you" }).waitFor();
  const job = await api("get", { path: "sites/cafe/cleaning/job1" });
  assert.equal(job.data.lastBy, "web:Sam Patel");
  assert.equal(job.data.log.length, 1);

  // Add an allergen item.
  await openSection(page, "allergens");
  await page.fill("#algName", "Almond croissant");
  await page.locator("#algChecks label", { hasText: /nuts/i }).first().click();
  await page.click("#algSave");
  await page.locator("#algConfirm", { hasText: "Saved Almond croissant" }).waitFor();
  const alg = await api("query", { path: "sites/cafe/allergens" });
  assert.equal(alg.docs[0].data.name, "Almond croissant");
  assert.equal(alg.docs[0].data.by, "web:Sam Patel");

  // Upload an allergen PDF and open it.
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  await page.setInputFiles("#adFile", { name: "allergen-matrix.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.fill("#adTitle", "Allergen matrix");
  await page.click("#adSave");
  await page.locator("#adMsg", { hasText: "Uploaded to the Cafe" }).waitFor();
  const link = page.getByRole("link", { name: "Open PDF" }).first();
  await link.waitFor();
  const href = await link.getAttribute("href");
  assert.match(href, /^\/_blob\/[0-9a-f]{32}$/);
  const blob = await page.evaluate(async (u) => { const r = await fetch(u); return { type: r.headers.get("content-type"), size: (await r.arrayBuffer()).byteLength }; }, href);
  assert.deepEqual(blob, { type: "application/pdf", size: pdf.length });

  // Records show names: switch to the Roastery, whose seeded day was ticked by "Seeder".
  await page.locator("#sites button", { hasText: "Roastery" }).click();
  await openSection(page, "day");
  await page.fill("#dayDate", "2026-10-01");
  await page.locator("#dayDate").dispatchEvent("change");
  await page.locator("#openBy", { hasText: "Seeder" }).waitFor();

  // Records and Management are pull-down menus; the trigger shows the current section.
  await openSection(page, "suppliers");
  await page.locator(".gl-trigger.on:visible", { hasText: "Suppliers" }).waitFor();
  await page.locator(".gl-trigger.on:visible").focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("role")), "menuitemradio");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".gl-pop:not([hidden])").count(), 0);

  // The Claude-only import features stay hidden.
  await openSection(page, "plans");
  assert.equal(await page.locator("#plUploadPanel").isHidden(), true);

  // Sign out, then sign in as the new member of staff: username + temporary password, then their own.
  await page.locator("#who .shim-change", { hasText: "Sign out" }).click();
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
  await page.locator("#who", { hasText: "Recording as Alex Brown" }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.inputValue("#signName"), "Alex Brown", "sign-off starts with the signed-in person's name, not the last one");
  assert.equal(await page.locator("#who .shim-admin").count(), 0);
  assert.equal(await page.locator(".gl-trigger.split", { hasText: "Management" }).isVisible(), false, "Management menu hidden");
  await page.locator(".gl-trigger.split", { hasText: "Records" }).click();
  assert.deepEqual(await page.locator(".gl-pop:not([hidden]) .gl-item").allTextContents(), ["Extra checks", "Cleaning schedule", "Prove it", "Allergens"]);
  await page.keyboard.press("Escape");
  await page.goto(srv.base + "/admin");
  await page.waitForURL(srv.base + "/");
  await page.locator("#openList").waitFor();
  await page.evaluate(() => { localStorage.setItem("sfbb.tab", "setup"); });
  await page.reload();
  await page.locator("#toast", { hasText: "for managers" }).waitFor();
  assert.equal(await page.locator('[data-panel="day"]').isVisible(), true, "back on the daily diary");

  // Signing out leaves a plain sign-in form; the new password works.
  await page.locator("#who .shim-change", { hasText: "Sign out" }).click();
  await page.waitForURL(/\/signin$/);
  assert.equal(await page.inputValue("#username"), "");
  await page.fill("#username", "alex.brown");
  await page.fill("#password", "alex-own-pass");
  await page.click("#signin button[type=submit]");
  await page.locator("#who", { hasText: "Recording as Alex Brown" }).waitFor();

  assert.deepEqual(errors, []);
  await ctx.close();
});

// Opens a section the way staff do: Diary sections are tabs; the rest are in the Records and
// Management menus (claude-shim.js), with the page's own buttons hidden behind them.
async function openSection(page, tab) {
  const direct = page.locator(`nav.tabs button[data-tab=${tab}]`);
  if (await direct.isVisible()) return direct.click();
  const name = (await direct.textContent()).trim();
  for (const trigger of await page.locator(".gl-trigger:visible").all()) {
    await trigger.click();
    const item = page.locator(".gl-pop:not([hidden]) .gl-item", { hasText: name });
    if (await item.count()) return item.first().click();
    await page.keyboard.press("Escape");
  }
  throw new Error(`No menu item for ${tab}`);
}

async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 200));
  }
}
