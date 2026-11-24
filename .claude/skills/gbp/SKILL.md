---
name: gbp
description: One-prompt GBP posts for a business - "amex81 ke 30 posts", "drs ka January", "storagewale ke 15 post schedule karo". Plans the next free dates from the Google Sheet, writes unique SEO posts, adds them to the <id>_posts tab, and schedules every post in Localo with photo and Call now, using the built-in browser. Use whenever Pradeep names a business and asks for posts, a month, or scheduling.
---

# GBP batch: sheet + Localo from one prompt

Pradeep says a business id (Businesses tab `id`, e.g. `amex`, `amex81`, `drs`) and either a count ("30 posts") or a month ("January"). Default: 30 posts. Do everything below without asking, in order, and report at the end. Stop and ask only where this file says "stop".

Browser: always the **built-in browser** (`mcp__Claude_Browser__*`), never Claude in Chrome. Pradeep signs in to Google and Localo there once; if a sign-in page shows up, stop and ask him to sign in in the browser pane, then continue.

Never do: change other businesses' rows or tabs, edit `businesses/*.json` or `out/*/posts.json` by hand, publish "now" instead of scheduling, type passwords.

## 1. Plan (no duplicates by construction)

```
node scripts/batch.js plan <id> --count 30        # or: --month 2027-01
```
Reads the live sheet (`GBP_SHEET_ID` in `.env`; if missing, write `GBP_SHEET_ID=<sheet id>` into `.env`, it is git-ignored) and writes `out/<id>/batch/plan.json`: dates (the day after the last post, never today or earlier), one posting time per date (business rule), the sheet row to paste at, keywords, services, areas, season, and titles to avoid.
- "No business" / "No <id>_posts tab": stop and tell Pradeep exactly what to add (row in Businesses; tab made by duplicating any `*_posts` tab and keeping only the header row).
- If `out/<id>/batch/localo.json` exists from an earlier run and the sheet already holds those posts, skip to step 5 (resume): only the Localo part was unfinished.

## 2. Write the posts

Write `out/<id>/batch/posts.json`: an array, one object per planned date, in date order, each `{ "topic", "title", "text" }`. Rules (same as `buildPrompt` in src/month.js):
- title + 1 + text between `rules.min_chars` and `rules.max_chars` (aim 750-950). Title under 70 characters.
- `primary_keyword` in the first sentence, `secondary_keyword` near the end, both exactly as written.
- Every post a different practical topic (a service, packing tip, route, season from `season`, customer worry, area); name 2-3 areas from `areas`. Never reuse a title or angle from `avoid_titles`.
- Plain English. No phone numbers, prices, discounts, emojis, hashtags, ALL CAPS, reviews, guarantees, certifications or invented extras. Only the listed services. Transit insurance only in an insurance post, and as optional.
- End with an invitation to call.

```
node scripts/batch.js stage <id> out/<id>/batch/posts.json
```
It checks every post against everything already in the sheet and the rest of the batch (length, both keywords, phone numbers, similarity < max_similarity, repeated titles, taken dates). On PROBLEM lines rewrite only those posts and stage again until it passes. Output: `sheet.tsv`, `NN.txt` (Localo text per post), `localo.json`.

## 3. Add the posts to the sheet

1. Built-in browser: open `https://docs.google.com/spreadsheets/d/<GBP_SHEET_ID>/edit`, click the `<id>_posts` tab.
   The signed-in Google account needs Editor access ("View only" badge = no access: stop and ask Pradeep to share the sheet with that account as Editor).
2. Click the Name box (top-left, shows a cell like A1; check with a zoom that it is focused), type `B<nextRow>` (type, then press Enter as a separate key) and confirm the Name box shows that cell and the row is empty.
3. The built-in browser does not paste the system clipboard, so type the rows from `sheet.tsv` cell by cell: for every cell press **F2** first, then type, then **Tab** to the next column (without F2 the keystrokes are lost). Columns: date, time, title, text, image (skip with a Tab), cta, status, chars (the formula from sheet.tsv), notes; **Enter** after notes goes to column B of the next row. Max 25 actions per browser batch, so one row per batch.
4. Check: `npm run sync -- --dry` must show `<id>: <old + new> posts, 0 problem(s)`, and the last posts' title/text must equal posts.json. If not, ctrl+z in the sheet, find the cause, redo.

Gotchas: keystrokes typed right after the page loads can land in a cell; if a cell changed by accident, ctrl+z at once and verify. Dates go in as YYYY-MM-DD, the chars column is a formula.

## 4. Website sync

`gh workflow run sync.yml --ref main`, then `gh run watch` on that run. It commits `out/<id>/posts.json` on main only if every post passes. Report if it fails; do not retry blindly.

## 5. Schedule in Localo

Profile: `https://app.localo.com/place-place/<localo_location>/posts/scheduled`. If `localo_location` is empty, open https://app.localo.com, find the profile whose address matches the business, take the id from its URL (`/place-place/<id>/...`) and tell Pradeep to put it in the `localo_location` cell (do not write it yourself).

Before posting, read what is already scheduled (JS on the Scheduled page, after it loads):
```js
[...document.body.innerText.matchAll(/will go live on ([A-Za-z]+ \d+, \d{4}) at ([0-9:]+ [AP]M)/g)].map(m => m[1] + ' ' + m[2])
```
Skip every planned date that already has a post there (never two posts on one day). Count the photos once: Content > Photos, or the "Select from your published photos" picker. Photo for post n = picker photo number `(daily_count + n - 1) % photo_count` (rotation, row by row, left to right).

Click by `find` refs (Create post, Manually, Select date, Select time, "Your post appears here", Select from your published photos, Use this photo, the combobox), not fixed coordinates: the pane size changes the layout. The dialog is one column in a narrow pane; check the post with JS instead of the preview: `const d=document.querySelector('[role=dialog]'); [...d.querySelectorAll('input')].map(i=>i.value)` (date, time), `/Call now/.test(d.innerText)`, the `NNN / 1500` counter, and `d.querySelectorAll('img').length` > 0.

For each remaining post in `localo.json`, in order:
1. Click **Create post**, wait 3 s, scroll the dialog to the top (it reopens at the last scroll position).
2. Click **Manually** (date and time). In the date box select all and type `YYYY-MM-DD`, Enter. In the time box select all, type `HH:MM`, click the picker's **OK** (wait 1 s, it may need a second click).
3. In "Generate content" click **Manual**. Put the text of `NN.txt` in "Your post appears here" with **form_input** on that textbox (title, newline, text; clipboard paste does not work in the built-in browser). The counter must show the post's `chars`.
4. Scroll the dialog fully down, click **Select from your published photos**, click the photo, wait 1 s, click **Use this photo**. If the picker did not open, do not click where "Use this photo" would be: that spot is the Schedule button.
5. Scroll fully down, set the call-to-action dropdown to **Call now**.
6. Verify before scheduling (zoom/screenshot): preview shows the photo and "Call now", the date box and time box show the planned values. Fix anything wrong first.
7. Click **Schedule**, wait 3 s, confirm the "Post scheduled" toast.

If a post went out wrong, fix it with that post's **Edit Post > Edit Post** (same dialog, **Schedule** saves). Never leave a second copy: if one was created, delete the extra only after telling Pradeep which.

## 6. Verify and report

Reload the Scheduled page, run the JS above: every planned date must appear exactly once at its time. Also check each card has an image and "Call now". Then reply in Hinglish, short: how many posts, date range, times, sheet rows, Action result, anything skipped or fixed, and one screenshot of the Scheduled list. Delete nothing in `out/<id>/batch/` (git-ignored) until the next run.
