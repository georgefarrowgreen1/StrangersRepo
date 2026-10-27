# Data model

The diary stores JSON documents at slash-separated paths, Firestore-style: an even number of segments is a document (`days/2026-10-27`), an odd number is a collection (`days`, `sites/cafe/days`).

## Where each site's data lives

| Site | Path prefix | Example |
|---|---|---|
| Roastery | *(none: top level)* | `days/2026-10-27` |
| Cafe | `sites/cafe/` | `sites/cafe/days/2026-10-27` |
| ASG | `sites/asg/` | `sites/asg/days/2026-10-27` |
| Factory | `sites/factory/` | `sites/factory/days/2026-10-27` |

The Roastery's records were recorded before sites existed, so they sit at the top level. **Keep it that way.** The page and the sync both rely on it.

## Allowed collections

Under each site prefix:

`settings` · `days` · `weeks` · `extras` · `cleaning` · `proveit` · `allergens` · `allergenDocs` · `suppliers` · `contacts` · `staff` · `reviews` · `plans` · `onboarding` · `inspections`

Plus one shared document: `config/shared`. `config/sync` and `config/people` are written only by the sync (see `sync.md`).

Reject any other path with `invalid_argument`.

## D1 schema (suggested)

```sql
CREATE TABLE docs (
  path        TEXT PRIMARY KEY,          -- e.g. 'sites/cafe/days/2026-10-27'
  collection  TEXT NOT NULL,             -- e.g. 'sites/cafe/days'
  doc_id      TEXT NOT NULL,             -- e.g. '2026-10-27'
  data        TEXT,                      -- JSON; NULL when deleted
  updated_at  INTEGER NOT NULL,          -- ms since epoch
  source      TEXT NOT NULL,             -- 'web' (edited on the website) or 'claude' (written by sync)
  deleted     INTEGER NOT NULL DEFAULT 0 -- tombstone, so the sync can see website deletions
);
CREATE INDEX docs_collection ON docs(collection, deleted);
CREATE INDEX docs_web_changes ON docs(source, updated_at);
```

Queries the page makes: one document by path; a whole collection; a collection ordered by one field and limited (`days` by `date` desc, `weeks` by `week` desc, `reviews` by `date` desc, `proveit` by `at` desc). Ordering on a JSON field with `json_extract(data,'$.date')` is fine at this size (hundreds of documents per collection).

## Documents

Timestamps (`at`, `lastAt`, `createdAt`, `updatedAt`) are ms since epoch. Dates are `YYYY-MM-DD` strings. `by` fields are user ids: `u_…` for people in Claude, `web:<name>` for people on the website.

**`settings/main`**, one per site: the site's setup.
```
units:[{id,name,kind:"fridge"|"freezer"}]
opening|closing|weekly:[{id,t,off?:true}]     // checks; off = turned off at this site
closedDays:[0..6]   // 0 = Sunday
hide:{<tab>:true}   // sections not used at this site
proveOff:[<method>]  info:{address,manager,note}  startDate
updatedBy, updatedAt, publishedAt?, publishedFrom?
```

**`days/<YYYY-MM-DD>`**: one diary page.
```
date
temps:{<unitId>:{am:{v,by,at}}}
opening|closing:{items:{<checkId>:bool}, by, at, allDone?:{by,at}}
problems:{text,by,at}
signed:{by,at,name}          // name = typed by the person signing (older entries may lack it)
```
The page writes these with nested `update`s such as `{temps:{u1:{am:{v:3.2,by,at}}}}`, which must merge deeply (see `runtime-api.md`).

**`weeks/<Monday YYYY-MM-DD>`**: `week, items:{<checkId>:bool}, by, at, notes:{text,by,at}, signed:{by,at,name}`

**`extras/<id>`**, **`cleaning/<id>`**: `name, how, freq ("after use"|"daily"|"weekly"|"fortnightly"|"monthly"|"quarterly"|"yearly"), who, createdAt, lastAt?, lastBy?, log:[{at,by,note}] (newest first, max 30), importedAt?, importedFrom?`

**`proveit/<id>`**: `date, method, food, reading, unit, pass, action, by, at`

**`allergens/<id>`**: `name, source, contains:[allergen names], notes, by, at, importedFrom?`

**`allergenDocs/<id>`**: `title, note, fileName, assetId, size, by, at`. `assetId` points to a file in that platform's own storage (Claude's asset store, or R2 on the website), so these are **not synced** (see `sync.md`).

**`suppliers/<id>`**: `name, supplies, contact, phone, email, address, rating, notes, by, at`

**`contacts/<id>`**: `type, name, person, phone, outOfHours, email, account, notes, by, at`

**`staff/<id>`**: `name, role, start, topics:{<topic>:{date,by}}, notes, personId, sites:[siteIds], at`

**`reviews/<YYYY-MM-DD>`**: `date, answers:{<q>:{a:"Yes"|"No", d}}, notes, by, at`

**`plans/<id>`** (HACCP plans and risk assessments): `type:"haccp"|"risk", title, …metadata, steps[] or rows[], notes, source, createdBy, createdAt, updatedBy, updatedAt, history[]`

**`onboarding/<id>`**: `category, title, audience, owner, date, reviewDate, summary, sections:[{heading,body}], notes, source, created…/updated…, history[]`

**`inspections/<id>`** (EHO): `inspectionDate, inspector, authority, visitType, rating, scores:{hygiene,structure,management}, revisitDate, summary, goodPoints[], issues:[{id,issue,area,priority,action,deadline,ref,done,doneBy,doneAt,fixNote}], notes, source, created…/updated…, history[]`

**`config/shared`**: the last published shared setup: `opening, closing, weekly, from, to[], by, at`.
