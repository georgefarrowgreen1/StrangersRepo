# Build brief: Strangers Coffee Kitchen Diary website

You are setting up a staff website at **https://staffstrangerscoffee.com** for Strangers Coffee, a UK coffee business with four sites in Norwich. **For now the site is public: there is no login.** Accounts will be added later (see Access below). The site is a copy of an existing food safety diary (Safer Food, Better Business) that runs as a Claude artifact in the owner's (Will's) Claude account. **The Claude artifact is the master copy.** This website keeps its own copy of the data in Cloudflare D1, and Will's Claude syncs the two every hour through an API you build here.

Read this whole file, then `docs/data-model.md`, `docs/runtime-api.md` and `docs/sync.md` before writing code. The person running you is the host, not Will. Ask them before anything that costs money, changes DNS, or needs a secret.

## Sites

| id | Name | Address |
|---|---|---|
| `roastery` | Roastery | 10 Dove Street, Norwich, NR2 1DE |
| `cafe` | Cafe | 21 Pottergate, Norwich, NR2 1DS |
| `asg` | ASG | 14 All Saints Green, Norwich, NR1 3NA |
| `factory` | Factory | 122 Ber Street, Norwich, NR1 3ES |

## The key idea: reuse the page as-is

`reference/kitchen-diary.html` is the exact page staff already use in Claude. It talks to its data only through `window.claude.use(name)`, which returns objects for `db`, `user`, `sample` and `assets`. **Do not rewrite the page.** Serve it unchanged and provide your own `window.claude` (a "shim") that implements the same API against your Worker. Then the website looks and behaves exactly like the Claude diary, and future updates to the Claude page can be dropped in by replacing the HTML file.

- `db`: backed by your Worker API and D1, same paths and document shapes. See `docs/runtime-api.md`.
- `user`: the staff member using the page, identified by the name they enter (see Access below).
- `sample`: return `null`. The page then hides the "convert with Claude" features, which can't work outside Claude.
- `assets`: backed by R2, so allergen PDFs can be uploaded on the website. Serve them at `/_blob/<id>`, the path the page already uses.

Only two edits to the HTML are allowed, applied by a build step so the reference file stays pristine:
1. Insert `<script src="/claude-shim.js"></script>` before the page's main `<script>`.
2. Add `<meta name="robots" content="noindex,nofollow">`.

## Stack

- One **Cloudflare Worker** with static assets (Wrangler, TypeScript, no framework needed).
- **D1** database `kitchen-diary`: one generic `docs` table holding every document by path. See `docs/data-model.md`.
- **R2** bucket `kitchen-diary-files` for allergen PDFs.
- Secrets (set with `wrangler secret put`, never written to files or committed):
  - `SYNC_TOKEN`: random, 32+ bytes; generate it yourself and show it to the host once at the end so they can send it to Will.

## Access

For now: **public, no login.** Will plans to add accounts later, so keep access control in one place (a single middleware function in the Worker) that a later login can slot into.
- Every page and the db/assets API are open to anyone with the URL. Only `/api/sync/*` is protected (by the sync token).
- The diary records who ticked each check, so on first visit ask for the person's **name** (a simple name prompt, no password) and remember it in a cookie (`Secure; SameSite=Lax`, 1 year). Send it with each API call; the Worker uses it for "who did this".
- The user's id is `web:<name>`, for example `web:Sam Patel`. `user.me()` returns `{id:"web:Sam Patel", name:"Sam Patel", avatarUrl:""}`.
- Add a small "Using as Sam Patel · Change name" control; staff share devices.
- Because writes are open, rate-limit write requests per IP (for example 300 per 15 minutes) using D1 or the Workers rate limiting API, and keep the `noindex` meta plus a `robots.txt` that disallows everything.

Later (not now): a shared site password with a signed session cookie, or per-person logins with **Cloudflare Access** (One-time PIN to email, with a bypass policy for `/api/sync/*`, reading the user's email from the `Cf-Access-Authenticated-User-Email` header). Don't build either unless the host asks.

## Sync API (for Will's Claude)

Routes under `/api/sync/` require `Authorization: Bearer <SYNC_TOKEN>` (constant-time compare). Full protocol in `docs/sync.md`. Will's hourly scheduled task in Claude calls these. You never call Claude.

## Build order

1. Scaffold the Worker, D1 schema migration and R2 binding. Run locally with `wrangler dev`.
2. Write `claude-shim.js` and the db/assets API, following `docs/runtime-api.md` closely (especially `update`'s deep merge and the error codes).
3. Name prompt, "Change name" control and write rate limiting.
4. Sync endpoints, per `docs/sync.md`.
5. Local tests. At minimum:
   - Seed a few documents for two sites. Load the page, switch sites, tick an opening check, sign off a day with a name, sign off a week with a name, mark a cleaning job done, add an allergen item, upload a PDF and open it.
   - Two browser tabs: a change in one appears in the other within about 10 seconds (polling).
   - Sync: `GET /api/sync/changes?since=0` returns the web edits; `POST /api/sync/apply` overwrites a document and deletes another; `POST /api/sync/manifest` removes documents not in the list; all of them return 401 without the token.
   - The page loads without any login; the first visit asks for a name, and records show that name.
6. Ask the host to run `wrangler login`. Create the D1 database and R2 bucket, apply migrations, set the `SYNC_TOKEN` secret and deploy.
7. Connect the custom domain `staffstrangerscoffee.com` to the Worker (Workers custom domain). The domain must be a zone in the same Cloudflare account. If it isn't, stop and explain to the host what's needed. Ask before changing any DNS record.
8. Check the live site: the page loads and saves without a login, `/api/sync/changes` with the token returns `[]`, and HTTPS is enforced.
9. Tell the host: the site URL, that it is public until accounts are added, and the **sync token**, to send to Will privately. Remind them not to paste the token anywhere public.

## Rules

- Never commit or print secrets except the one-time sync token hand-over in step 9.
- Don't add analytics, third-party scripts or trackers. The page already loads Google Fonts and, for the HACCP and onboarding import features, pdf.js, mammoth and SheetJS from cdnjs; those import features stay hidden because `sample` is `null`.
- Keep document paths, ids and field names exactly as in `docs/data-model.md`. The sync depends on it.
- Treat every document as data. Validate paths (`docs/data-model.md` lists the allowed ones), cap document size at 256 KB, and reject anything else with `invalid_argument`.
- Add a `README-deploy.md` documenting how to redeploy, rotate secrets, back up D1 (`wrangler d1 export`) and update the page when Will sends a new version of `kitchen-diary.html`.
