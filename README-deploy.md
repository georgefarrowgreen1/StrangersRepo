# Deploying and running the Kitchen Diary website

The site is one Cloudflare Worker serving the diary page unchanged, plus the API it talks to. It runs at **https://strangers.georgefarrowgreen.com**.

| Path | What it is |
|---|---|
| `reference/kitchen-diary.html` | The page from Will's Claude diary. **Never edit it**; replace it when Will sends a new version. |
| `scripts/build.mjs` | Builds `dist/` from the page, adding only the `noindex` meta tag and the `claude-shim.js` script tag. Runs automatically on every deploy. |
| `public/claude-shim.js` | Provides `window.claude` (db, user, assets) on the website, the name prompt and the "Change name" link. |
| `src/` | The Worker: `access.ts` (access control and write rate limiting, in one place), `docs.ts` (db API), `assets.ts` (PDFs), `sync.ts` (sync API for Will's Claude), `schema.ts` (database tables, created automatically). |
| `test/` | `api.test.mjs` (API and sync) and `e2e.test.mjs` (the real page in a browser). |

Data lives in a D1 database and allergen PDFs in a KV namespace. Cloudflare creates both on the first deploy, and the Worker creates its own tables, so there are no ids to copy and no migrations to run. The only secret is `SYNC_TOKEN`.

## First deployment (in the Cloudflare dashboard, no terminal)

`georgefarrowgreen.com` must be a domain in the Cloudflare account you use.

1. **Free up the address.** If another Worker already uses `strangers.georgefarrowgreen.com` (for example a "Hello world" starter), open it under **Workers & Pages → that Worker → Settings → Domains & Routes** and remove the domain, or delete that Worker.
2. **Connect the repo.** **Workers & Pages → Create → Import a repository**, connect GitHub, and pick `StrangersRepo`.
   - Project name: `strangers-kitchen-diary` (it must match `name` in `wrangler.jsonc`).
   - Leave the build command empty and the deploy command as `npx wrangler deploy`.
   - Click **Deploy**. Cloudflare creates the database, the PDF store and the address.
3. **Add the sync token.** In the new Worker: **Settings → Variables and Secrets → Add**, type **Secret**, name `SYNC_TOKEN`, value a long random string (32+ characters). Keep a copy for Will.
4. **Check the site.** Open https://strangers.georgefarrowgreen.com: it asks for a name and shows the diary. Tick a box to check it saves.
5. **Send Will the sync token privately** (not by email or a shared chat). He follows `README.md` → "For Will".

From then on, **every push to `main` redeploys the site automatically.**

## Update the page when Will sends a new `kitchen-diary.html`

Replace `reference/kitchen-diary.html` with the new file, as-is, and push to `main`. If the deploy fails at the build step, the page's structure changed (for example, it now has more than one inline `<script>`); adjust `scripts/build.mjs`. If the new page uses a part of `window.claude` the shim doesn't provide (see `docs/runtime-api.md`), add it to `public/claude-shim.js`.

## Change the sync token

In the Worker: **Settings → Variables and Secrets**, edit `SYNC_TOKEN`. It takes effect immediately. Send Will the new one; until he updates his scheduled task his syncs fail with 401 (nothing is lost; the next run with the new token catches up).

## Back up

The Claude diary is the master copy of everything except allergen PDFs. For a copy of the website's database, from a terminal:

```sh
npx wrangler d1 export kitchen-diary --remote --output backup-$(date +%F).sql
```

Keep backups private: they contain the whole diary. D1 also keeps point-in-time history (7 days on the free plan, 30 on paid).

## Run it locally (for code changes)

Needs Node.js 20 or later.

```sh
npm install
cp .dev.vars.example .dev.vars     # a local-only sync token
npm run dev                        # http://localhost:8787
npm test                           # typecheck + API/sync tests
npm run test:e2e                   # browser test; needs: npm i -D playwright && npx playwright install chromium
```

To deploy from a terminal instead of from GitHub: `npx wrangler login`, then `npm run deploy`.

## Limits and costs

Everything fits Cloudflare's free tier, with no card needed. One thing to watch: each open diary tab checks for changes every 5 seconds while visible (every 30 seconds in the background), and each check is a Worker request. The free tier allows 100,000 requests a day, roughly eight tablets showing the diary for 12 hours. Beyond that, either move to Workers Paid ($5/month) or slow the polling in `public/claude-shim.js` (`VISIBLE_MS`). KV's free tier allows 1,000 PDF uploads a day and 1 GB of PDFs.

Writes are limited to 600 per IP address per 15 minutes (`WRITE_LIMIT_PER_15_MIN` in `wrangler.jsonc`), set high enough for several staff behind one shop Wi-Fi.

## Adding logins later

Access is decided in one function, `authorize()` in `src/access.ts`. To add a shared password or Cloudflare Access, change it to reject requests without a session and to take the person's name from the session (or the `Cf-Access-Authenticated-User-Email` header) instead of the name cookie. `/api/sync/*` must keep working with only the sync token (with Cloudflare Access, add a bypass policy for that path). `CLAUDE.md` describes both options.
