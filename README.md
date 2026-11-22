# GBP Automation Engine

Auto-generate unique SEO Google Business Profile posts and show the same posts on the business website.

```
npm install
npm run sync       # Google Sheet -> businesses/<id>.json + out/<id>/posts.json, then checks
npm run check      # validate out/amex/posts.json (length, keywords, duplicates)
npm test
```

## Google Sheet (master data)

All profiles and posts live in one Google Sheet: a `Businesses` tab (one row per profile), one `<id>_posts` tab per profile, and a `Photos` tab. Edit there, then `npm run sync`.

One-time setup:
1. `npm run sheet:export` writes `sheet/gbp-sheet.xlsx` from the current JSON (git-ignored).
2. In Google Drive: New > File upload, then open it with Google Sheets (or in a blank sheet: File > Import > Replace spreadsheet).
3. Share > General access > "Anyone with the link" > Viewer. No customer data in the sheet.
4. Copy `.env.example` to `.env` and paste the sheet URL or ID into `GBP_SHEET_ID`.

`npm run sync -- --dry` shows what would change; `npm run sync -- --file x.xlsx` reads a downloaded file instead. Rows with `status = draft` are left out, sheet errors stop the sync before anything is written.

Website embed (copy `widget/gbp-posts.js` and `out/<id>/posts.json` to the site's `public/gbp/`):

```html
<div data-gbp-posts data-src="/gbp/posts.json" data-cols="4" data-limit="8" data-accent="#9b1c2c"></div>
<script src="/gbp/gbp-posts.js" defer></script>
```
Preview all posts regardless of date: add `?gbp=all` to the page URL or `data-show="all"`.

See CLAUDE.md for rules and roadmap.

## Month generator (Gemini)

```
npm run month -- amex 2027-01                 # GEMINI_API_KEY in .env
npm run month -- amex 2026-12 --from 2026-12-22
```
Writes `out/<id>/<YYYY-MM>.posts.csv` (git-ignored): one post per day from the day after the last existing post, each checked for length, both keywords, no phone numbers and similarity < `max_similarity` against all earlier posts; failures are sent back to Gemini with the reason. Photos continue the pool rotation. Import the CSV into the `<id>_posts` tab, review, then `npm run sync`.

Without a computer: add the key as a repository secret (Settings > Secrets and variables > Actions > `GEMINI_API_KEY`), then Actions > "Generate month of GBP posts" > Run workflow, and download the CSV from the run's Artifacts. If Google retires the model, set a repository variable `GEMINI_MODEL` (same page, Variables tab) to the new name; no code change needed.

## Posting times and offer posts

- Each generated post gets its own time between 09:00 and 19:00 (never on :00 or :30, never twice in a month). Change the range with a `post_time_window` column in the Businesses tab (e.g. `10:00-18:00`), or set it to `fixed` to put every post at `post_time`. A `time` typed in the posts tab always wins.
- Offer posts go in the same `<id>_posts` tab with `type = offer` and `offer_end` (and `offer_start` if the offer began before the post date). They follow the same checks as daily posts, can share a day with a daily post at a different time, and do not shift the month generator's dates or photo rotation. On the website they show an "Offer till ..." badge and disappear after `offer_end`. Put the offer terms in `notes` for the Localo Offer post.
- `out/amex/offers-2026-11-to-2027-03.csv`: AmEx "10% off local shifting" offers (2-7 and 16-25 of each month, Nov 2026 - Mar 2027), ready to import into `amex_posts` below the existing rows. Fill `image` with a photo_id first.

## Everything from the Actions tab (no computer needed)

1. Repository variable `GBP_SHEET_ID` = the sheet URL or ID (Settings > Secrets and variables > Actions > Variables). Secret `GEMINI_API_KEY` as above.
2. **Generate month of GBP posts**: the posts appear as a table on the run's Summary page; the CSV is under Artifacts.
3. Import the CSV into the `<id>_posts` tab, review, then run **Sync posts from Google Sheet**: it commits `out/<id>/posts.json` only if every post passes the checks, and the website widget picks it up from `main`.
