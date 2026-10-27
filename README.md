# Strangers Coffee Kitchen Diary: staff website

This folder is everything needed to put the Strangers Coffee food safety diary (Safer Food, Better Business) online at **strangers.georgefarrowgreen.com**, hosted on Cloudflare, kept in sync with the master copy that lives in Will's Claude account.

It's written so that the person hosting it can hand the whole job to Claude Code.

---

## For the host (Will's friend)

### What you'll need

- [Claude Code](https://claude.com/claude-code) installed.
- Node.js 20 or later.
- Access to the Cloudflare account that will host the site, with permission to manage Workers, D1, R2 and DNS. The site runs at **strangers.georgefarrowgreen.com**, so the domain `georgefarrowgreen.com` must be managed in the same Cloudflare account that hosts the site. If its DNS is elsewhere, move it to Cloudflare first.
- Nothing secret from Will. For now the site is public (no login); accounts will be added later. You'll generate the sync token yourself during set-up.

### How to set it up

The Worker is already built in this folder. **`README-deploy.md`** has the exact commands to run it locally, deploy it, connect the domain, and later redeploy, rotate the token and back up. You can follow it by hand, or hand it to Claude Code:

1. Unzip this folder somewhere on your computer.
2. Open a terminal in the folder and run `claude`.
3. Say: **"Read CLAUDE.md and set this project up."**

Claude Code will build the site, ask you to log in to Cloudflare (`wrangler login`), create the database and storage, deploy it and connect the domain. It stops and asks before anything that costs money or touches DNS.

At the end it gives you a **sync token**. Send that to Will privately: his Claude needs it to keep the two copies in step.

### What it costs

Everything here fits Cloudflare's free tier (Workers, D1, R2 and a custom domain) for a team this size.

---

## For Will

Once your friend has deployed the site and sent you the sync token:

1. **Allow Claude to reach the website.** Your Claude works in a cloud workspace with restricted internet access. In claude.ai, go to **Admin settings → Capabilities** and add `strangers.georgefarrowgreen.com` to the allowed domains. Without this the sync can't run.
2. **Set up the hourly sync.** Open a new Claude task and paste the prompt in `docs/will-sync-setup.md`, filling in the sync token. Claude will run the first sync and schedule it to repeat every hour. (The diary already shows the names of people who record entries on the website.)
3. **Check the first sync.** Open the website, pick a site, and check that the diary, cleaning schedule and allergens match the Claude diary.

### How the two copies behave

- **The Claude diary is the master copy.**
- Changes made on the website reach Claude at the next hourly sync, and changes made in Claude reach the website at the same time. So a change can take up to an hour to appear on the other side.
- If the same record is changed in both places between syncs, the **Claude version wins** and the website change is listed in a sync log you can review.
- Reading uploaded documents with Claude (HACCP plans, EHO reports, onboarding documents) works in Claude only. On the website those upload buttons are hidden.
- Allergen PDFs are kept separately on each side for now; upload them where staff will look for them.

### A note on access

For now the site is **public**: anyone with the address can open the diary and record entries. Staff just type their name the first time so records show who did what. The site is hidden from search engines, but don't share the address beyond the team. Accounts will be added later, either a shared site password or per-person email sign-in with **Cloudflare Access** (free for up to 50 people); `CLAUDE.md` notes both.
