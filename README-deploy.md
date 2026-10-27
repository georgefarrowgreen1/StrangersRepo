# Deploying and running the Kitchen Diary website

The site is one Cloudflare Worker serving the diary page unchanged, plus the API it talks to:

| Path | What it is |
|---|---|
| `reference/kitchen-diary.html` | The page from Will's Claude diary. **Never edit it**; replace it when Will sends a new version. |
| `scripts/build.mjs` | Builds `dist/` from the page, adding only the `noindex` meta tag and the `claude-shim.js` script tag. Runs automatically before `wrangler dev` and `wrangler deploy`. |
| `public/claude-shim.js` | Provides `window.claude` (db, user, assets) on the website, the name prompt and the "Change name" link. |
| `public/robots.txt` | Disallows all crawlers. |
| `src/` | The Worker: `access.ts` (access control and write rate limiting, in one place), `docs.ts` (db API), `assets.ts` (PDFs in R2), `sync.ts` (sync API for Will's Claude). |
| `migrations/` | D1 schema. |
| `test/` | `api.test.mjs` (API and sync) and `e2e.test.mjs` (the real page in a browser). |

Data lives in the D1 database `kitchen-diary` and allergen PDFs in the R2 bucket `kitchen-diary-files`. The only secret is `SYNC_TOKEN`.

## Run it locally

Needs Node.js 20 or later.

```sh
npm install
cp .dev.vars.example .dev.vars     # a local-only sync token for testing
npm run db:migrate:local
npm run dev                        # http://localhost:8787
```

Tests (each run starts its own `wrangler dev` with an empty database):

```sh
npm test                 # typecheck + API/sync tests
npm run test:e2e         # browser test; needs: npm i -D playwright && npx playwright install chromium
```

## First deployment

1. **Log in to Cloudflare** with an account that can manage Workers, D1, R2 and the `staffstrangerscoffee.com` zone:
   ```sh
   npx wrangler login
   ```
2. **Create the database** and put its id in `wrangler.jsonc` (`d1_databases[0].database_id`; wrangler offers to do it for you):
   ```sh
   npx wrangler d1 create kitchen-diary
   npm run db:migrate:remote
   ```
3. **Create the file bucket.** R2 must be enabled on the account first (Dashboard → R2; free tier, but Cloudflare asks for a payment method).
   ```sh
   npx wrangler r2 bucket create kitchen-diary-files
   ```
4. **Create the sync token** and store it as a secret. Generate it, copy it somewhere private for step 8, then paste it when `secret put` asks:
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   npx wrangler secret put SYNC_TOKEN
   ```
5. **Connect the domain.** `staffstrangerscoffee.com` must be a zone in the *same* Cloudflare account (Dashboard → Websites). If it isn't, move it there first (add the site, then change the nameservers at the registrar). In `wrangler.jsonc`, uncomment:
   ```jsonc
   "routes": [{ "pattern": "staffstrangerscoffee.com", "custom_domain": true }],
   ```
   On deploy, Cloudflare creates the DNS record and the certificate for the hostname. If a DNS record for `staffstrangerscoffee.com` already exists (an old website, for example), deploy stops; decide with Will before deleting it.
6. **Deploy:**
   ```sh
   npm run deploy
   ```
7. **Check the live site:**
   - https://staffstrangerscoffee.com loads, asks for a name, and saves a ticked check.
   - `curl -H "Authorization: Bearer <token>" "https://staffstrangerscoffee.com/api/sync/changes?since=0"` returns `{"now":…,"changes":[…]}` (only edits you just made on the site, otherwise `[]`).
   - The same request without the header returns 401.
   - `curl -I http://staffstrangerscoffee.com` redirects to `https://`.
8. **Send Will the sync token privately** (not by email or a shared chat). He follows `README.md` → "For Will". Don't paste it anywhere public.

## Redeploy

After any change (or to pick up a new page):

```sh
npm test && npm run deploy
```

If a change adds a file to `migrations/`, run `npm run db:migrate:remote` first.

## Update the page when Will sends a new `kitchen-diary.html`

1. Replace `reference/kitchen-diary.html` with the new file, as-is.
2. `npm run build`. If it fails, the page's structure changed (for example, it now has more than one inline `<script>`); adjust `scripts/build.mjs`.
3. `npm test && npm run test:e2e`, then `npm run deploy`.

If the new page uses a part of `window.claude` the shim doesn't provide (see `docs/runtime-api.md`), the browser console shows an error; add it to `public/claude-shim.js`.

## Rotate the sync token

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put SYNC_TOKEN      # takes effect immediately, no redeploy needed
```

Send Will the new token; until he updates his scheduled task, his syncs fail with 401 (nothing is lost; the next run with the new token catches up).

## Back up

```sh
npx wrangler d1 export kitchen-diary --remote --output backup-$(date +%F).sql
```

Keep backups somewhere private: they contain the whole diary. To restore into an empty database: `npx wrangler d1 execute kitchen-diary --remote --file backup-YYYY-MM-DD.sql`. D1 also keeps point-in-time history (7 days on the free plan, 30 on paid) (`npx wrangler d1 time-travel restore kitchen-diary --timestamp …`).

The Claude diary is the master copy of everything except allergen PDFs. To back up the PDFs, download them from the R2 bucket in the dashboard.

## Limits and costs

Everything fits Cloudflare's free tier for a team this size, with one thing to watch: each open diary tab checks for changes every 5 seconds while visible (every 30 seconds in the background), and each check is a Worker request. The free tier allows 100,000 requests a day, which is roughly eight tablets showing the diary for 12 hours. Beyond that, either move to Workers Paid ($5/month) or slow the polling in `public/claude-shim.js` (`VISIBLE_MS`).

Writes are limited to 600 per IP address per 15 minutes (`WRITE_LIMIT_PER_15_MIN` in `wrangler.jsonc`), set high enough for several staff behind one shop Wi-Fi.

## Adding logins later

Access is decided in one function, `authorize()` in `src/access.ts`. To add a shared password or Cloudflare Access, change it to reject requests without a session and to take the person's name from the session (or the `Cf-Access-Authenticated-User-Email` header) instead of the name cookie. `/api/sync/*` must keep working with only the sync token (with Cloudflare Access, add a bypass policy for that path). `CLAUDE.md` describes both options.
