# Deploying and running the Kitchen Diary

The site is one Cloudflare Worker serving the diary's pages and the API they talk to. It runs at **https://staffstrangerscoffee.com**, and **every push to `main` redeploys it automatically** (Cloudflare Workers Builds).

| Path | What it is |
|---|---|
| `public/index.html`, `public/app.js` | The diary: markup and page logic. |
| `public/app.css`, `public/theme.css`, `public/ui.css` | Styles: base layout, the Liquid Glass theme (colours, materials, dark mode, accessibility settings), then the app layout (bars, sidebar, cards, lists). See `docs/design.md`. |
| `public/claude-shim.js` | The page's data connection: `window.claude.use("db" \| "user" \| "assets")` backed by the API, with live updates by polling. The name dates from when the page ran inside Claude; see `docs/runtime-api.md`. |
| `public/signin.html`, `public/signin.js` | Sign-in, choosing a new password, changing a password, first-admin setup and admin password recovery. |
| `public/admin.html`, `public/admin.js` | The Admin page: people and roles. |
| `public/icon-*.png`, `public/manifest.webmanifest` | Home Screen icon and app settings. |
| `public/pdf.js` | Makes PDFs on the device (allergen matrix, EHO inspection records): Helvetica text, tables and the logo, no libraries. |
| `public/pinpad.js` | The 4-digit PIN pad for quick switching, used by the diary and the sign-in page. |
| `src/` | The Worker: `index.ts` (routing, security headers and the nightly job), `access.ts` (who can reach what: access control, roles and write rate limiting, in one place), `auth.ts` (sign-in, sessions and quick switching), `admin.ts` (admin API), `backup.ts` (nightly backups), `docs.ts` (the db API), `assets.ts` (PDFs), `paths.ts` (allowed document paths), `schema.ts` (database tables, created automatically). |
| `.github/workflows/test.yml`, `.github/annotate.mjs` | Runs every test on GitHub for each pull request and each merge to `main`; posts a failing test's message as an annotation. |
| `.github/workflows/automerge.yml` | Squash-merges each pull request into `main` by itself once Tests passes. |
| `test/` | `api.test.mjs` and `migration.test.mjs` (the API, against `wrangler dev`) and `e2e.test.mjs` (the site in a browser, phone-sized). |

Data lives in a D1 database (`kitchen-diary`) and allergen PDFs in a KV namespace. Cloudflare creates both on the first deploy and the Worker creates its own tables, so there are no ids to copy and no migrations to run. The only secret is the **setup code**.

## First deployment (in the Cloudflare dashboard, no terminal)

`staffstrangerscoffee.com` must be a domain (zone) in the Cloudflare account you use, with its nameservers pointing at Cloudflare. The site is served at `staffstrangerscoffee.com`; `www.staffstrangerscoffee.com` redirects there.

1. **Free up the addresses.** If another Worker already uses `staffstrangerscoffee.com` or `www.staffstrangerscoffee.com`, open it under **Workers & Pages → that Worker → Settings → Domains & Routes** and remove the domain. If the zone already has A, AAAA or CNAME records for either name (for example a parked page from the registrar), delete them under **DNS → Records**, or the deploy can't add its own.
2. **Connect the repo.** **Workers & Pages → Create → Import a repository**, connect GitHub and pick `StrangersRepo`.
   - Project name: `strangers-kitchen-diary` (it must match `name` in `wrangler.jsonc`).
   - Build command: leave empty, or `npm run build` (it does nothing). Deploy command: `npx wrangler deploy`.
   - Click **Deploy**. Cloudflare creates the database, the PDF store and the address.
3. **Add the setup code.** In the Worker: **Settings → Variables and Secrets → Add**, type **Secret**, name `SETUP_CODE`, value a long random string (32+ characters). It must be a runtime secret, not a build variable. Keep it somewhere safe.
4. **Create the first admin.** Open the site. With no accounts yet it shows "Set up the first admin": enter your name, a username, a password and the setup code.

## Changing the site

Edit the files in `public/` (or `src/` for the API), run the tests, and push to `main`. The deploy takes about a minute. If a deploy fails, the build log is in the Cloudflare dashboard under the Worker → **Deployments**, and GitHub shows a red cross next to the commit.

**Tests on GitHub.** Every pull request, and every merge to `main`, runs the typecheck, the API tests and the browser test (the "Tests" check). If one fails, its error message is shown as an annotation on the check. Cloudflare deploys whatever reaches `main`, so the safe way to change the site is a branch and a pull request, merged once Tests is green. That's a rule on `main` (GitHub → the repo → **Settings → Rules → Rulesets**: "Tests must pass", requiring the **test** status check).

**Auto-merge.** Every pull request into `main` is squash-merged by itself as soon as Tests passes (`.github/workflows/automerge.yml`), then Cloudflare deploys it, so there's nothing to press. If Tests fails, the pull request stays open with a red cross until it's fixed. To hold a change back, open it as a **draft** pull request (or "Convert to draft" on an open one): drafts aren't merged until they're marked "Ready for review". Auto-merge needs **Settings → General → Allow auto-merge** switched on (it is), and squash merging allowed.

## Change the setup code

In the Worker: **Settings → Variables and Secrets**, edit `SETUP_CODE`. It takes effect immediately and only affects creating the first admin and the "Admin? Forgotten password" recovery. Existing accounts and sessions are unaffected. (`SYNC_TOKEN`, the secret's name before the Claude sync was removed, is still accepted if `SETUP_CODE` isn't set.)

## Back up

The website is the only copy of the diary. **It backs itself up every night** (03:17 UTC, the cron in `wrangler.jsonc`) into the KV namespace, keeping the last 30. On the Admin page, **Back up now** makes one straight away and **Download** saves any of them: a JSON file with every record (by path) and the list of accounts (no passwords). Keep a download somewhere safe now and then; those copies survive even if the Cloudflare account doesn't.

To restore, the JSON's `docs` are documents to write back at their `path`s (ask Claude Code to do it with the db API or `wrangler d1 execute`). For a full copy of the database from a terminal:

```sh
npx wrangler d1 export kitchen-diary --remote --output backup-$(date +%F).sql
```

Keep backups private: they contain the whole diary, including staff names. D1 also keeps point-in-time history (7 days on the free plan, 30 on paid): `npx wrangler d1 time-travel restore kitchen-diary --timestamp=<ISO time>`. Allergen PDFs live in KV and aren't in the export; keep the originals.

## Run it locally (for code changes)

Needs Node.js 20 or later.

```sh
npm install
cp .dev.vars.example .dev.vars     # a local-only setup code
npm run dev                        # http://localhost:8787
npm test                           # typecheck + API tests
npm run test:e2e                   # browser test; needs Playwright: npm i -D playwright && npx playwright install chromium
```

To deploy from a terminal instead of from GitHub: `npx wrangler login`, then `npm run deploy`.

## Limits and costs

Everything fits Cloudflare's free tier, with no card needed. One thing to watch: each open diary tab checks for changes every 5 seconds while visible (every 30 seconds in the background), and each check is a Worker request. The free tier allows 100,000 requests a day, roughly eight tablets showing the diary for 12 hours. Beyond that, either move to Workers Paid ($5/month) or slow the polling in `public/claude-shim.js` (`VISIBLE_MS`). KV's free tier allows 1,000 PDF uploads a day and 1 GB of PDFs.

Writes are limited to 600 per IP address per 15 minutes (`WRITE_LIMIT_PER_15_MIN` in `wrangler.jsonc`), set high enough for several staff behind one shop Wi-Fi.

## Accounts

- **Adding people.** Account menu → **Admin** → **Add person**: their name (as it should appear on records), a username (suggested from the name), their role, and a temporary password, or leave it blank to have one created. Give them the username and temporary password in person; they choose their own password when they first sign in. If they've recorded entries under a name before, use exactly that name to keep their history together.
- **Changing a password.** Anyone can: account menu → **Change password**.
- **Forgotten password.** On the Admin page, tap the person and set or create a temporary password. That signs them out everywhere and clears their quick PIN.
- **Quick PINs.** Staff and managers set their own (account menu → Set a quick PIN; 4 digits, not repeated or running digits). Switching with a PIN only works on a device someone has signed in on with a password in the last 180 days; elsewhere the list of names is empty. Wrong PINs count towards the same 5-tries lock as passwords. The Admin page shows who has one.
- **Locked out.** Five wrong passwords lock an account for 10 minutes (and each IP is limited to 30 failed attempts per 15 minutes). An admin can **Unlock** it straight away.
- **Someone leaves.** Tap them on the Admin page → **Switch off**. They can't sign in, and their records stay.
- **The only admin forgot their password.** On the sign-in page, choose "Admin? Forgotten password" and use the setup code.

Access is decided in one function, `authorize()` in `src/access.ts`. Sign-in and sessions are in `src/auth.ts`, the admin API in `src/admin.ts`. Section permissions are `MANAGER_TABS` and `MANAGER_COLLECTIONS` in `src/access.ts`; the page mirrors `MANAGER_TABS` in `public/app.js` to hide those sections from staff, but the Worker is what enforces them.
