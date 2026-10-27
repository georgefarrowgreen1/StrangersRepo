# Strangers Coffee Kitchen Diary: staff website

This folder is everything needed to put the Strangers Coffee food safety diary (Safer Food, Better Business) online at **strangers.georgefarrowgreen.com**, hosted on Cloudflare, kept in sync with the master copy that lives in Will's Claude account.

It's written so that the person hosting it can hand the whole job to Claude Code.

---

## For the host (Will's friend)

### What you'll need

- A free Cloudflare account. The site runs at **strangers.georgefarrowgreen.com**, so the domain `georgefarrowgreen.com` must be managed in the same Cloudflare account that hosts the site. If its DNS is elsewhere, move it to Cloudflare first.
- Nothing secret from Will. For now the site is public (no login); accounts will be added later. You'll generate the sync token yourself during set-up.

### How to set it up

The site is already built. Connect this GitHub repo to Cloudflare once, in the dashboard, and every push to `main` deploys it automatically. **`README-deploy.md`** has the five steps, plus how to update the page, change the token and back up.

During set-up you create a **sync token**. Send that to Will privately: his Claude needs it to keep the two copies in step.

### What it costs

Everything here fits Cloudflare's free tier (Workers, D1, KV and a custom domain), with no card needed, for a team this size.

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
