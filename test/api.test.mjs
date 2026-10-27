// API tests against `wrangler dev` with a fresh local database. Run with `npm test`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, SYNC_TOKEN } from "./harness.mjs";

let srv;
before(async () => { srv = await startServer({ writeLimit: 80 }); });
after(async () => { await srv?.stop(); });

const NAME = "Sam Patel";
async function db(op, body, name = NAME) {
  const headers = { "content-type": "application/json" };
  if (name) headers["x-diary-name"] = encodeURIComponent(name);
  const r = await fetch(`${srv.base}/api/db/${op}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function sync(method, route, body, token = SYNC_TOKEN) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${srv.base}/api/sync/${route}`, { method, headers, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

test("page is served with the shim and noindex, no login", async () => {
  const r = await fetch(srv.base + "/");
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /<script src="\/claude-shim.js"><\/script>\n<script>/);
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(await (await fetch(srv.base + "/robots.txt")).text(), /Disallow: \//);
  assert.equal((await fetch(srv.base + "/claude-shim.js")).status, 200);
});

test("set, get and deep-merging update", async () => {
  const path = "sites/cafe/days/2026-10-27";
  assert.equal((await db("set", { path, data: { date: "2026-10-27", opening: { items: { o1: true }, by: "a" } } })).status, 200);
  await db("update", { path, patch: { opening: { items: { o2: true }, by: "b" }, temps: { u1: { am: { v: 3.2 } } } } });
  await db("update", { path, patch: { temps: { u2: { am: { v: -18 } } }, problems: null } });
  const { body } = await db("get", { path });
  assert.equal(body.exists, true);
  assert.deepEqual(body.data, {
    date: "2026-10-27",
    opening: { items: { o1: true, o2: true }, by: "b" },
    temps: { u1: { am: { v: 3.2 } }, u2: { am: { v: -18 } } },
    problems: null,
  });
});

test("concurrent updates to one document all survive", async () => {
  const path = "days/2026-10-26";
  await db("set", { path, data: { date: "2026-10-26" } });
  await Promise.all(Array.from({ length: 20 }, (_, i) => db("update", { path, patch: { opening: { items: { ["c" + i]: true } } } })));
  const { body } = await db("get", { path });
  assert.equal(Object.keys(body.data.opening.items).length, 20);
});

test("update on a missing doc is not_found; get of a missing doc doesn't exist", async () => {
  const r = await db("update", { path: "days/2020-01-01", patch: { a: 1 } });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "not_found");
  assert.equal((await db("get", { path: "days/2020-01-01" })).body.exists, false);
});

test("invalid paths and data are rejected with invalid_argument", async () => {
  for (const path of ["nope/x", "days", "sites/roastery/days/x", "sites/cafe/secret/x", "config/sync", "config/people", "days//x"]) {
    const r = await db("set", { path, data: { a: 1 } });
    assert.equal(r.body.code, "invalid_argument", path);
  }
  assert.equal((await db("set", { path: "days/x", data: [1] })).body.code, "invalid_argument");
  const big = { blob: "x".repeat(257 * 1024) };
  assert.equal((await db("set", { path: "days/x", data: big })).body.code, "invalid_argument");
  assert.equal((await db("query", { path: "days", orderBy: "date; drop table docs" })).body.code, "invalid_argument");
});

test("writes need a name", async () => {
  const r = await db("set", { path: "days/2026-01-01", data: { date: "2026-01-01" } }, null);
  assert.equal(r.status, 401);
  assert.equal(r.body.code, "name_required");
});

test("query ordering and limit; deletes hide docs", async () => {
  for (const d of ["2026-09-01", "2026-09-03", "2026-09-02"]) await db("set", { path: `sites/asg/days/${d}`, data: { date: d } });
  const q = await db("query", { path: "sites/asg/days", orderBy: "date", dir: "desc", limit: 2 });
  assert.deepEqual(q.body.docs.map((d) => d.id), ["2026-09-03", "2026-09-02"]);
  await db("delete", { path: "sites/asg/days/2026-09-03" });
  const q2 = await db("query", { path: "sites/asg/days", orderBy: "date", dir: "desc" });
  assert.deepEqual(q2.body.docs.map((d) => d.id), ["2026-09-02", "2026-09-01"]);
});

test("poll returns only what changed", async () => {
  const queries = [
    { key: "a", kind: "col", path: "sites/factory/cleaning" },
    { key: "b", kind: "doc", path: "sites/factory/settings/main" },
  ];
  const first = (await db("poll", { since: null, queries })).body;
  assert.deepEqual(first.results.a.docs, []);
  assert.equal(first.results.b.exists, false);
  const withVers = queries.map((q) => ({ ...q, ver: first.results[q.key].ver }));
  assert.deepEqual((await db("poll", { since: first.seq, queries: withVers })).body.results, {});
  await db("set", { path: "sites/factory/cleaning/job1", data: { name: "Mop floor", freq: "daily" } });
  const third = (await db("poll", { since: first.seq, queries: withVers })).body;
  assert.deepEqual(Object.keys(third.results), ["a"]);
  assert.equal(third.results.a.docs[0].data.name, "Mop floor");
});

test("poll handles as many subscriptions as the page opens", async () => {
  const prefixes = ["", "sites/cafe/", "sites/asg/", "sites/factory/"];
  const cols = ["days", "weeks", "extras", "cleaning", "allergens", "allergenDocs", "reviews", "staff", "proveit"];
  const queries = prefixes.flatMap((p) => [
    ...cols.map((c) => ({ key: p + c, kind: "col", path: p + c, orderBy: "date", dir: "desc", limit: 14 })),
    { key: p + "settings", kind: "doc", path: p + "settings/main" },
  ]);
  assert.equal(queries.length, 40);
  const r = await db("poll", { since: null, queries });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(Object.keys(r.body.results).length, 40);
  assert.deepEqual(r.body.results["sites/cafe/days"].docs.map((d) => d.id), ["2026-10-27"]);
});

test("profiles resolves web names and synced Claude names", async () => {
  await sync("POST", "apply", { pulledAt: Date.now(), docs: [{ path: "config/people", data: { u_will: "Will" } }] });
  const r = await db("profiles", { ids: ["web:Sam Patel", "u_will", "u_unknown"] });
  assert.deepEqual(r.body, { "web:Sam Patel": { name: "Sam Patel" }, u_will: { name: "Will" }, u_unknown: { name: "" } });
});

test("PDF upload, serve and delete", async () => {
  const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const up = await fetch(`${srv.base}/api/assets`, {
    method: "POST", headers: { "content-type": "application/pdf", "x-diary-name": "Sam" }, body: pdf,
  });
  assert.equal(up.status, 200);
  const info = await up.json();
  assert.match(info.id, /^[0-9a-f]{32}$/);
  assert.equal(info.url, "/_blob/" + info.id);
  const get = await fetch(srv.base + info.url);
  assert.equal(get.headers.get("content-type"), "application/pdf");
  assert.equal(get.headers.get("content-disposition"), "inline");
  assert.equal(get.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await get.arrayBuffer()).byteLength, pdf.length);
  const bad = await fetch(`${srv.base}/api/assets`, { method: "POST", headers: { "content-type": "text/html", "x-diary-name": "Sam" }, body: "<p>" });
  assert.equal((await bad.json()).code, "unsupported_type");
  const del = await fetch(`${srv.base}/api/assets/${info.id}`, { method: "DELETE", headers: { "x-diary-name": "Sam" } });
  assert.deepEqual(await del.json(), { deleted: true });
  assert.equal((await fetch(srv.base + info.url)).status, 404);
});

test("sync routes need the token", async () => {
  for (const [m, route] of [["GET", "changes?since=0"], ["GET", "status"], ["POST", "apply"], ["POST", "manifest"]]) {
    assert.equal((await sync(m, route, m === "POST" ? {} : undefined, null)).status, 401, route);
    assert.equal((await sync(m, route, m === "POST" ? {} : undefined, "wrong")).status, 401, route);
  }
});

test("sync: changes, apply (with skip), manifest", async () => {
  const c1 = (await sync("GET", "changes?since=0")).body;
  assert.ok(c1.now > 0);
  const paths = c1.changes.map((c) => c.path);
  assert.ok(paths.includes("sites/cafe/days/2026-10-27"));
  assert.ok(paths.includes("sites/factory/cleaning/job1"));
  const del = c1.changes.find((c) => c.path === "sites/asg/days/2026-09-03");
  assert.equal(del.deleted, true);
  assert.equal(del.data, null);
  assert.ok(c1.changes.every((c) => !c.path.includes("allergenDocs") && c.base === null));
  const pulledAt = c1.now;

  // A website edit made after Claude pulled is protected from the push.
  await new Promise((r) => setTimeout(r, 5));
  await db("set", { path: "sites/cafe/staff/s1", data: { name: "Late edit" } });

  const applied = (await sync("POST", "apply", {
    pulledAt,
    docs: [
      { path: "sites/cafe/days/2026-10-27", data: { date: "2026-10-27", signed: { by: "u_will", at: 1, name: "Will" } } },
      { path: "sites/cafe/staff/s1", data: { name: "Claude version" } },
      { path: "sites/asg/days/2026-09-02", deleted: true },
      { path: "sites/factory/cleaning/job1", data: { name: "Mop floor", freq: "daily" } }, // identical: quiet
      { path: "sites/cafe/allergenDocs/x", data: { title: "no" } },
    ],
  })).body;
  assert.equal(applied.applied, 3); // overwrite, delete, identical
  assert.deepEqual(applied.skipped, ["sites/cafe/staff/s1"]);
  assert.equal(applied.rejected.length, 1);

  assert.equal((await db("get", { path: "sites/cafe/days/2026-10-27" })).body.data.signed.name, "Will");
  assert.equal((await db("get", { path: "sites/asg/days/2026-09-02" })).body.exists, false);
  assert.equal((await db("get", { path: "sites/cafe/staff/s1" })).body.data.name, "Late edit");

  // Only the protected web edit is still pending; its base is null (Claude never had it).
  const c2 = (await sync("GET", `changes?since=${pulledAt}`)).body;
  assert.deepEqual(c2.changes.map((c) => c.path), ["sites/cafe/staff/s1"]);

  // A later web edit of a Claude-applied doc carries Claude's version as base.
  await db("update", { path: "sites/cafe/days/2026-10-27", patch: { problems: { text: "Fridge 2 warm" } } });
  const c3 = (await sync("GET", `changes?since=${c2.now}`)).body;
  assert.equal(c3.changes[0].base.signed.name, "Will");
  assert.equal(c3.changes[0].data.problems.text, "Fridge 2 warm");

  // Manifest removes docs Claude doesn't have, but not web edits newer than pulledAt.
  await db("set", { path: "sites/factory/cleaning/job2", data: { name: "Old job" } });
  const c4 = (await sync("GET", "changes?since=0")).body;
  await db("set", { path: "sites/factory/cleaning/job3", data: { name: "Brand new on web" } });
  const m = (await sync("POST", "manifest", {
    pulledAt: c4.now, collections: ["sites/factory/cleaning"], paths: ["sites/factory/cleaning/job1"],
  })).body;
  assert.deepEqual(m.removed, ["sites/factory/cleaning/job2"]);
  const left = (await db("query", { path: "sites/factory/cleaning" })).body.docs.map((d) => d.id).sort();
  assert.deepEqual(left, ["job1", "job3"]);
  assert.equal((await sync("POST", "manifest", { pulledAt: 0, collections: ["sites/cafe/allergenDocs"], paths: [] })).body.code, "invalid_argument");

  const st = (await sync("GET", "status")).body;
  assert.ok(st.docs > 0 && st.lastApplyAt > 0 && st.webChangesPending > 0);
});

test("writes are rate limited per IP", async () => {
  let last;
  for (let i = 0; i < 90; i++) {
    last = await db("set", { path: `sites/asg/extras/r${i}`, data: { name: "x" } });
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429);
  assert.equal(last.body.code, "rate_limited");
  assert.equal((await db("get", { path: "sites/asg/extras/r0" })).status, 200, "reads still work");
});
