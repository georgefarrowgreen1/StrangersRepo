# Build brief: Strangers Coffee Kitchen Diary website

You are setting up a staff website at **https://strangers.georgefarrowgreen.com** for Strangers Coffee, a UK coffee business with four sites in Norwich. Staff sign in with a username and password (see Access below). The site is a copy of an existing food safety diary (Safer Food, Better Business) that runs as a Claude artifact in the owner's (Will's) Claude account. **The Claude artifact is the master copy.** This website keeps its own copy of the data in Cloudflare D1, and Will's Claude syncs the two every hour through an API you build here.

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
- `user`: the signed-in member of staff (see Access below).
- `sample`: return `null`. The page then hides the "convert with Claude" features, which can't work outside Claude.
- `assets`: backed by Workers KV, so allergen PDFs can be uploaded on the website. Serve them at `/_blob/<id>`, the path the page already uses.

Only two edits to the HTML are allowed, applied by a build step so the reference file stays pristine:
1. Insert `<script src="/claude-shim.js"></script>` before the page's main `<script>`.
2. Add `<meta name="robots" content="noindex,nofollow">`.

## Stack

- One **Cloudflare Worker** with static assets (Wrangler, TypeScript, no framework needed).
- **D1** database `kitchen-diary`: one generic `docs` table holding every document by path. See `docs/data-model.md`.
- **KV** namespace (binding `FILES`) for allergen PDFs. (KV rather than R2 so the free tier needs no card.) D1 and KV have no ids in `wrangler.jsonc`: Cloudflare provisions them on first deploy, and the Worker creates its own tables (`src/schema.ts`).
- Secrets (set with `wrangler secret put`, never written to files or committed):
  - `SYNC_TOKEN`: random, 32+ bytes; generate it yourself and show it to the host once at the end so they can send it to Will.

## Access

**Staff accounts, username + password.** Access control stays in one place: `authorize()` in `src/access.ts`, with sign-in and sessions in `src/auth.ts` and the admin API in `src/admin.ts`.
- Signed out, only the sign-in page (`/signin`) and its files are reachable. Everything else redirects there, and the API returns 401 `unauthenticated` (the shim then sends the person to sign in). `/api/sync/*` needs only the sync token.
- A conventional sign-in form: **username** and **password** (8+ characters). Each account also has a display **name**, shown on records; it isn't typed at sign-in. Admins give out temporary passwords; people choose their own at first sign-in, and can change it from the sign-in page. Five wrong passwords lock the account for 10 minutes, and each IP is limited to 30 failed attempts per 15 minutes.
- Sessions are `HttpOnly; Secure; SameSite=Lax` cookies, HMAC-signed with a key the Worker generates and keeps in D1 (`secrets` table), valid 30 days. A new password, renaming, switching off or "sign out everywhere" ends all of that person's sessions.
- Roles: **staff** (daily diary, end of week, last 4 weeks, extra checks, cleaning, Prove it, allergens), **manager** (also EHO, HACCP & risk, suppliers, contacts, staff training, onboarding, 4-weekly review, Setup) and **admin** (also `/admin`). The Worker refuses staff writes to manager data with `permission_denied` (never `invalid_argument`, which the page treats as read-only for everything); the shim hides those sections.
- The first account is created on the sign-in page with the **setup code**, which is the `SYNC_TOKEN`. The same code lets an admin who forgot their password set a new one.
- Records still use `web:<name>` as the user id, so a person's history follows their name. `user.me()` returns `{id:"web:Sam Patel", name:"Sam Patel", avatarUrl:""}`.
- The header shows "Recording as Sam Patel · Sign out · Admin" (Admin for admins only); staff share devices.
- Writes are rate-limited per IP (`WRITE_LIMIT_PER_15_MIN`), and the site keeps the `noindex` meta plus a `robots.txt` that disallows everything.

Alternative not built: per-person email sign-in with **Cloudflare Access** (One-time PIN to email, with a bypass policy for `/api/sync/*`, reading `Cf-Access-Authenticated-User-Email`).

## Sync API (for Will's Claude)

Routes under `/api/sync/` require `Authorization: Bearer <SYNC_TOKEN>` (constant-time compare). Full protocol in `docs/sync.md`. Will's hourly scheduled task in Claude calls these. You never call Claude.

## Build order

1. Scaffold the Worker, D1 schema and KV binding. Run locally with `wrangler dev`.
2. Write `claude-shim.js` and the db/assets API, following `docs/runtime-api.md` closely (especially `update`'s deep merge and the error codes).
3. Accounts (username + password sign-in, roles, admin page), "Sign out" control and write rate limiting.
4. Sync endpoints, per `docs/sync.md`.
5. Local tests. At minimum:
   - Seed a few documents for two sites. Load the page, switch sites, tick an opening check, sign off a day with a name, sign off a week with a name, mark a cleaning job done, add an allergen item, upload a PDF and open it.
   - Two browser tabs: a change in one appears in the other within about 10 seconds (polling).
   - Sync: `GET /api/sync/changes?since=0` returns the web edits; `POST /api/sync/apply` overwrites a document and deletes another; `POST /api/sync/manifest` removes documents not in the list; all of them return 401 without the token.
   - Signed out, only the sign-in page loads. The first visit sets up an admin with the setup code; the admin adds staff; staff can't open manager sections; records show the signed-in name.
6. Deploy by connecting the GitHub repo in the Cloudflare dashboard (Workers Builds; see `README-deploy.md`), or with `wrangler login` and `wrangler deploy`. Set the `SYNC_TOKEN` secret.
7. Connect the custom domain `strangers.georgefarrowgreen.com` to the Worker (Workers custom domain). The parent domain `georgefarrowgreen.com` must be a zone in the same Cloudflare account. If it isn't, stop and explain to the host what's needed. Ask before changing any DNS record.
8. Check the live site: the sign-in page loads, and after signing in the diary saves, `/api/sync/changes` with the token returns `[]`, and HTTPS is enforced.
9. Tell the host: the site URL, how to create the first admin with the setup code, and the **sync token**, to send to Will privately. Remind them not to paste the token anywhere public.

## Rules

- Never commit or print secrets except the one-time sync token hand-over in step 9.
- Don't add analytics, third-party scripts or trackers. The page already loads Google Fonts and, for the HACCP and onboarding import features, pdf.js, mammoth and SheetJS from cdnjs; those import features stay hidden because `sample` is `null`.
- Keep document paths, ids and field names exactly as in `docs/data-model.md`. The sync depends on it.
- Treat every document as data. Validate paths (`docs/data-model.md` lists the allowed ones), cap document size at 256 KB, and reject anything else with `invalid_argument`.
- Add a `README-deploy.md` documenting how to redeploy, rotate secrets, back up D1 (`wrangler d1 export`) and update the page when Will sends a new version of `kitchen-diary.html`.
