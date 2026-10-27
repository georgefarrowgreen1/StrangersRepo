# Strangers Coffee Kitchen Diary: staff website

This folder is everything needed to put the Strangers Coffee food safety diary (Safer Food, Better Business) online at **staffstrangerscoffee.com**, hosted on Cloudflare, kept in sync with the master copy that lives in Will's Claude account.

It's written so that the person hosting it can hand the whole job to Claude Code.

---

## For the host (Will's friend)

### What you'll need

- [Claude Code](https://claude.com/claude-code) installed.
- Node.js 20 or later.
- Access to the Cloudflare account that will host the site, with permission to manage Workers, D1, R2 and DNS. Will owns **staffstrangerscoffee.com**. The simplest set-up is for Will to invite you as a member of *his* Cloudflare account, so he keeps ownership of the domain and the data. If the site goes on your account, the domain's DNS must be moved there first.
- Two values from Will, sent to you privately (not by email or chat that others can read):
  - the **site password** staff will use;
  - nothing else. You'll generate the other secrets yourself during set-up.

### How to set it up

1. Unzip this folder somewhere on your computer.
2. Open a terminal in the folder and run `claude`.
3. Say: **"Read CLAUDE.md and set this project up."**

Claude Code will build the site, ask you to log in to Cloudflare (`wrangler login`), ask for the site password, create the database and storage, deploy it and connect the domain. It stops and asks before anything that costs money or touches DNS.

At the end it gives you a **sync token**. Send that to Will privately: his Claude needs it to keep the two copies in step.

### What it costs

Everything here fits Cloudflare's free tier (Workers, D1, R2 and a custom domain) for a team this size.

---

## For Will

Once your friend has deployed the site and sent you the sync token:

1. **Allow Claude to reach the website.** Your Claude works in a cloud workspace with restricted internet access. In claude.ai, go to **Admin settings → Capabilities** and add `staffstrangerscoffee.com` to the allowed domains. Without this the sync can't run.
2. **Set up the hourly sync.** Open a new Claude task and paste the prompt in `docs/will-sync-setup.md`, filling in the sync token. Claude will run the first sync and schedule it to repeat every hour. (The diary already shows the names of people who record entries on the website.)
3. **Check the first sync.** Open the website, pick a site, and check that the diary, cleaning schedule and allergens match the Claude diary.

### How the two copies behave

- **The Claude diary is the master copy.**
- Changes made on the website reach Claude at the next hourly sync, and changes made in Claude reach the website at the same time. So a change can take up to an hour to appear on the other side.
- If the same record is changed in both places between syncs, the **Claude version wins** and the website change is listed in a sync log you can review.
- Reading uploaded documents with Claude (HACCP plans, EHO reports, onboarding documents) works in Claude only. On the website those upload buttons are hidden.
- Allergen PDFs are kept separately on each side for now; upload them where staff will look for them.

### A note on the password

A single shared password can't be taken away from one person when they leave, and it should be long and hard to guess. Pick a new one rather than reusing one you've typed elsewhere, and change it when someone leaves (your friend can do that in a minute). If you'd prefer each person to sign in with their own email instead, ask your friend to switch the site to **Cloudflare Access** (free for up to 50 people). `CLAUDE.md` covers both.
