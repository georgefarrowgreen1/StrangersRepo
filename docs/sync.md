# Sync between the Claude diary (master) and the website

## Who does what

- **Will's Claude** runs the sync, as an hourly scheduled task. It reads and writes the master diary with its artifact database tools, and calls this website's sync API over HTTPS.
- **The website** only exposes the API below. It never calls Claude.

All routes need `Authorization: Bearer <SYNC_TOKEN>`. Use a constant-time compare and return 401 otherwise. These routes skip the site password and Cloudflare Access.

## What is synced

Every allowed path in `data-model.md` for all four sites, plus `config/shared` and `config/people`, **except**:
- `allergenDocs` (PDF records point at files in each platform's own storage);
- `config/sync` (the sync's own state, kept in Claude only).

## Extra columns the website needs

On top of the `docs` table in `data-model.md`:

```sql
ALTER TABLE docs ADD COLUMN claude_data TEXT;   -- the JSON Claude last applied for this path (NULL = Claude had no doc)
```

`claude_data` is what makes conflict detection possible: it records what the document looked like in Claude at the last sync.

## API

### `GET /api/sync/changes?since=<ms>`
Website edits since the watermark.
```json
{ "now": 1793100000000,
  "changes": [ { "path": "sites/cafe/days/2026-10-27", "data": {...} | null, "deleted": false,
                 "updated_at": 1793099000000, "base": {...} | null } ] }
```
- Include rows with `source = 'web'` and `updated_at > since`, tombstones included.
- `base` = that row's `claude_data` (parsed), or `null`.
- `now` = server time at the start of the query. Claude stores it as the next `since`.

### `POST /api/sync/apply`
```json
{ "pulledAt": 1793100000000,
  "docs": [ { "path": "days/2026-10-27", "data": {...} }, { "path": "staff/abc", "deleted": true } ] }
```
For each doc (max 500 per request; Claude sends batches):
- **Skip** it if the existing row has `source = 'web'` and `updated_at > pulledAt`: someone edited it on the website after Claude pulled, and it'll be pulled next hour.
- Otherwise upsert: `data` (or tombstone), `claude_data = data` (or NULL), `source = 'claude'`, `updated_at = now`.
- Skip writes whose data is identical to what's stored, so unchanged documents don't trigger page refreshes.

Returns `{ "applied": n, "skipped": ["path", ...] }`.

### `POST /api/sync/manifest`
```json
{ "pulledAt": 1793100000000, "collections": ["days", "sites/cafe/days", ...], "paths": ["days/2026-10-27", ...] }
```
Tombstones every live doc in those collections whose path isn't in `paths`, except rows with `source = 'web'` and `updated_at > pulledAt`. This is how deletions made in Claude reach the website. Returns `{ "removed": [paths] }`. Accept bodies up to a few MB.

### `GET /api/sync/status`
`{ "docs": n, "lastApplyAt": ms, "webChangesPending": n }`. For checking that things are working.

## The run (Will's Claude, every hour)

1. Read `config/sync` from the Claude diary: `{ lastPull: ms (0 at first), log: [...] }`.
2. **Snapshot Claude.** List every synced collection in the diary, saving the documents to files.
3. **Pull.** `GET /changes?since=lastPull`. For each change:
   - Compare the current Claude document with `base`.
   - **Equal** (Claude hasn't touched it since the last sync, including both missing): write the website version into the Claude diary (set, or delete), pinned to the version read in step 2.
   - **Different**: conflict. **Claude wins.** Don't write. Add `{path, at, websiteData}` to the log.
4. **Push.** Re-list the collections changed in step 3, then `POST /apply` with every Claude document (batches of 200, `pulledAt` = `now` from step 3), then `POST /manifest` with every Claude path per synced collection.
5. **People.** Collect every `u_…` id seen in `by`, `lastBy`, `doneBy`, `createdBy`, `updatedBy` and `signed.by`; resolve names with the artifact database's `profiles` action; push `config/people` = `{ "<id>": "<name>" }`.
6. Write `config/sync` = `{ lastPull: now from step 3, lastRunAt, log: last 50 entries }`.
7. If there were conflicts or errors, send Will a short message listing them (site, date, what was overwritten).

The first run (`lastPull = 0`) pulls nothing, because the website is empty, and pushes everything.

## Why this order

Pulling before pushing means website edits are folded into the master first. The push then never overwrites them, and anything edited on the website in the gap between pull and push is protected by `pulledAt`.
