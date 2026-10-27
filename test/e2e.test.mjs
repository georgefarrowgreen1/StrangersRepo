// Browser test of the real page + shim against `wrangler dev`. Needs Playwright with Chromium:
//   npm i -D playwright && npx playwright install chromium     (then: npm run test:e2e)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startServer } from "./harness.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = await import("playwright")); }

let srv, browser;
before(async () => {
  srv = await startServer();
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser?.close(); await srv?.stop(); });

async function api(op, body) {
  const r = await fetch(`${srv.base}/api/db/${op}`, {
    method: "POST", headers: { "content-type": "application/json", "x-diary-name": "Seeder" }, body: JSON.stringify(body),
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
  await api("set", { path: "settings/main", data: settings("10 Dove Street") });
  await api("set", { path: "sites/cafe/settings/main", data: settings("21 Pottergate") });
  await api("set", { path: "sites/cafe/cleaning/job1", data: { name: "Clean coffee machine", how: "Backflush", freq: "daily", who: "Barista", createdAt: Date.now(), log: [] } });
  await api("set", { path: "days/2026-10-01", data: { date: "2026-10-01", opening: { items: { o1: true }, by: "web:Seeder", at: Date.now() } } });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(srv.base + "/");

  // First visit: no login, just a name prompt.
  await page.getByRole("dialog").waitFor();
  await page.locator("#shim-name").fill("Sam Patel");
  await page.getByRole("dialog").getByRole("button", { name: "Continue" }).click();
  await page.locator("#who", { hasText: "Recording as Sam Patel" }).waitFor();
  await page.locator("#who .shim-change").waitFor();

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
  await page.click("[data-tab=week]");
  await page.fill("#wkSignName", "Sam Patel");
  await page.locator("#wkSign button", { hasText: "Sign off" }).click();
  await page.locator("#wkSign", { hasText: "Signed by Sam Patel" }).waitFor();
  const weeks = await api("query", { path: "sites/cafe/weeks" });
  assert.equal(weeks.docs[0].data.signed.name, "Sam Patel");

  // Mark a cleaning job done.
  await page.click("[data-tab=cleaning]");
  await page.locator(".task", { hasText: "Clean coffee machine" }).getByRole("button", { name: "Done" }).click();
  await page.locator(".task", { hasText: "by you" }).waitFor();
  const job = await api("get", { path: "sites/cafe/cleaning/job1" });
  assert.equal(job.data.lastBy, "web:Sam Patel");
  assert.equal(job.data.log.length, 1);

  // Add an allergen item.
  await page.click("[data-tab=allergens]");
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
  const blob = await page.request.get(srv.base + href);
  assert.equal(blob.headers()["content-type"], "application/pdf");
  assert.equal((await blob.body()).length, pdf.length);

  // Records show names: switch to the Roastery, whose seeded day was ticked by "Seeder".
  await page.locator("#sites button", { hasText: "Roastery" }).click();
  await page.click("[data-tab=day]");
  await page.fill("#dayDate", "2026-10-01");
  await page.locator("#dayDate").dispatchEvent("change");
  await page.locator("#openBy", { hasText: "Seeder" }).waitFor();

  // Change name.
  await page.locator("#who .shim-change").click();
  await page.locator("#shim-name").fill("Alex Brown");
  await Promise.all([page.waitForNavigation(), page.getByRole("dialog").getByRole("button", { name: "Save" }).click()]);
  await page.locator("#who", { hasText: "Recording as Alex Brown" }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0, "no prompt once a name is saved");

  // The Claude-only import features stay hidden.
  await page.click("[data-tab=plans]");
  assert.equal(await page.locator("#plUploadPanel").isHidden(), true);

  assert.deepEqual(errors, []);
  await ctx.close();
});

async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 200));
  }
}
