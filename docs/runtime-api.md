# The `window.claude` API the page expects

`reference/kitchen-diary.html` was written for Claude's artifact runtime. On the website, `claude-shim.js` must provide the same surface, backed by the Worker. This is the exact subset the page uses; nothing else is needed.

```js
window.claude = { use: async (name) => ({db, user, sample: null, assets}[name] ?? null) };
```

`use()` must return a Promise. The page awaits `db`, `user`, `sample` and `assets` together at start-up.

## `db`

```ts
db.doc(path: string): DocRef          // even number of segments
db.collection(path: string): ColRef   // odd number of segments
```
Throw a `TypeError` for a path with the wrong segment count.

**DocRef**
```ts
id: string; path: string
get(): Promise<DocSnap>
set(data: object): Promise<void>      // full replace; creates if missing
update(patch: object): Promise<void>  // DEEP MERGE into the existing doc (see below)
delete(): Promise<void>
onSnapshot(next: (s: DocSnap) => void, error?: (e) => void): () => void   // returns unsubscribe
```

**ColRef / Query**
```ts
add(data: object): Promise<{id: string}>   // new random id, 20 lowercase alphanumerics
doc(id?: string): DocRef
orderBy(field: string, dir?: "asc"|"desc"): Query
limit(n: number): Query
get(): Promise<QuerySnap>
onSnapshot(next: (q: QuerySnap) => void, error?: (e) => void): () => void
```

**Snapshots**
```ts
DocSnap   = { id, exists: boolean, data(): object|undefined }
QuerySnap = { docs: Array<{ id, data(): object }> }   // deleted docs excluded
```

### `update` semantics (important)
Nested plain objects merge recursively; everything else (arrays, strings, numbers, `null`) replaces. A `null` value is stored as `null`, not deleted. Example: the doc `{opening:{items:{o1:true},by:"a"}}` updated with `{opening:{items:{o2:true},by:"b"}}` becomes `{opening:{items:{o1:true,o2:true},by:"b"}}`. `update` on a missing document rejects with code `not_found`; the page then falls back to `set`. Do the merge server-side inside one D1 statement or transaction so two staff ticking boxes at once don't overwrite each other.

### Live updates
`onSnapshot` must call `next` once with the current data soon after subscribing, then again whenever the result changes. Polling is fine: every 5 seconds while the tab is visible, 30 seconds when hidden, comparing a hash or `max(updated_at)` so unchanged results don't re-render. Also refresh straight after the shim's own writes so the person sees their change at once. The page opens about 30 subscriptions (one site in full, plus a summary of all four), so batch them: one `POST /api/poll` carrying all active queries is better than 30 requests.

### Errors
Reject with an object `{code, message}`. Codes the page understands:
- `invalid_argument`: bad path or data. **Note:** the page treats this on a write as "you don't have write access" and switches to read-only, so use it only for genuinely invalid writes.
- `quota_exceeded`: database full.
- `revoked`: session ended. Not used while the site is public; reserved for when logins are added.
- `not_found`: `update` on a missing document.
Anything else shows "Couldn't save. Check your connection and try again."

## `user`

```ts
me(): Promise<{id: string, name: string, avatarUrl: string}>   // {id:"web:Sam Patel", name:"Sam Patel", avatarUrl:""}
can(perm: "data.write"): Promise<boolean>                       // true for any signed-in person
profiles(ids: string[]): Promise<Record<string, {name: string}>>
```
`profiles` resolves names for the "by" ids on records:
- `web:<name>` → `<name>`.
- `u_…` (people who recorded in Claude) → look up `config/people` (the sync writes `{ "<id>": "<name>" }`), else `""`. The page shows "a team member" for `""`.

## `assets`

```ts
upload(file: Blob, opts?: {type?: string}): Promise<{id, url, sizeBytes, contentType}>
delete(id: string): Promise<{deleted: boolean}>
```
Store in R2 under a random 32-character hex id. Accept `application/pdf` only, 20 MB maximum (reject with `too_large` or `unsupported_type`). Serve at `GET /_blob/<id>` with the stored content type, `Content-Disposition: inline` and `X-Content-Type-Options: nosniff`. `url` = `"/_blob/" + id`.

## `sample`

Return `null`. The page hides every Claude-powered upload (HACCP plans, EHO reports, onboarding documents) when `sample` is `null`; staff can still enter those by hand or use the templates.
