# For Will: turning on the hourly sync

Do this once your friend has deployed the website and sent you the sync token, and you've added `strangers.georgefarrowgreen.com` to the allowed domains in **Admin settings → Capabilities**.

Open a new Claude task and paste everything in the box below, replacing `PASTE-SYNC-TOKEN-HERE` with the token.

```
Set up an hourly two-way sync between my Kitchen Diary artifact and its staff website.

- Master copy: my Kitchen Diary artifact, https://claude.ai/code/artifact/0008e0f6-d70a-448f-a4cf-dc9cca59487e
- Website: https://strangers.georgefarrowgreen.com
- Sync token (send it as "Authorization: Bearer <token>"): PASTE-SYNC-TOKEN-HERE
- Protocol: follow the steps below exactly. The Claude diary always wins a conflict.

Synced paths. Roastery records are at the top level; the other sites are under sites/cafe/, sites/asg/ and sites/factory/. For each of those four prefixes, sync the collections: settings, days, weeks, extras, cleaning, proveit, allergens, suppliers, contacts, staff, reviews, plans, onboarding, inspections. Also sync config/shared and config/people. Never sync allergenDocs or config/sync.

Each run:
1. Read config/sync from the diary database ({lastPull, log}; treat it as missing on the first run: lastPull = 0).
2. List every synced collection in the diary, saving documents to files.
3. GET /api/sync/changes?since=<lastPull>. For each change, compare the current diary document with the change's "base". If they're equal (or both missing), write the website version into the diary (set, or delete), pinned to the version you read. If they differ, it's a conflict: leave the diary as it is and add {path, at, websiteData} to the log.
4. POST /api/sync/apply with every diary document in batches of 200 ({pulledAt: "now" from step 3, docs: [{path, data}]}), then POST /api/sync/manifest with {pulledAt, collections, paths} listing every diary path in each synced collection.
5. Resolve the names of every u_… user id found in by, lastBy, doneBy, createdBy, updatedBy and signed.by fields using the artifact database "profiles" action, and include config/people = {id: name} in the apply.
6. Write config/sync = {lastPull: now from step 3, lastRunAt, log: last 50 entries}.
7. If there were conflicts or errors, message me a short list (site, date, what was overwritten). Otherwise finish quietly.

First, do one run now and show me the result. Then create a scheduled task that repeats this every hour, with this same prompt.
```

## If something goes wrong

- **"Couldn't reach the website" / network errors:** the domain isn't on the allowed list yet (Admin settings → Capabilities), or the site isn't deployed.
- **401 errors:** the token was pasted wrongly, or your friend changed it. Ask for the current one and update the scheduled task's prompt.
- **To pause syncing:** turn off the scheduled task in your scheduled tasks list. Both copies keep working on their own; the next run catches up.
