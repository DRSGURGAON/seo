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

- Each generated post gets its own time anywhere in the day, 00:00-23:59 (never on :00 or :30, never a time an earlier post already used). Change the range with a `post_time_window` column in the Businesses tab (e.g. `08:00-22:00`), or set it to `fixed` to put every post at `post_time`. A `time` typed in the posts tab always wins.
- Offer posts go in the same `<id>_posts` tab with `type = offer` and `offer_end` (and `offer_start` if the offer began before the post date). They follow the same checks as daily posts, can share a day with a daily post at a different time, and do not shift the month generator's dates or photo rotation. On the website they show an "Offer till ..." badge and disappear after `offer_end`. Put the offer terms in `notes` for the Localo Offer post.
- `out/amex/offers-2026-11-to-2027-03.csv`: AmEx "10% off local shifting" offers (2-7 and 16-25 of each month, Nov 2026 - Mar 2027), ready to import into `amex_posts` below the existing rows. Leave `image` empty to get an AI photo (below), or fill a photo_id.

## AI photos (Gemini) with approval

For upcoming posts with an empty `image`:
1. Actions > **Generate AI photos** > Run workflow (business `amex`, which = `offer` / `post` / `all`, source = `pool` or `gemini`).
   - `pool`: uses your own photos from the Photos tab (free, best for Google).
   - `gemini`: Gemini draws one photo per post (no text, logos, branded trucks or faces). Image models have no free quota: the Gemini key needs billing on in Google AI Studio.
   - Offer posts get a banner in the brand colour drawn by code: headline from the `banner` cell or from the offer text ("10% OFF LOCAL SHIFTING"), the validity dates and the business name.
   The photos are committed to `photos/` and the list to `out/<id>/photo-review.csv` (also under the run's Artifacts; the run's Summary page shows the photos).
2. In the sheet: a tab named `AI_Photos`. First time: File > Import > Upload the CSV > "Replace current sheet"; later runs: "Append to current sheet". The `preview` column shows each photo.
3. `status`: `approve`, or `reject` with what to change in `notes`. Run step 1 again to redo rejected ones.
4. Run **Sync posts from Google Sheet**: approved photos go on their posts (and the website). Upload the same photo (the `url`) to Localo for the Google post.

`npm run photos -- amex --only offer` does step 1 locally (GEMINI_API_KEY and GBP_SHEET_ID in .env). If Google retires the image model, set the repository variable `GEMINI_IMAGE_MODEL`.

## Everything from the Actions tab (no computer needed)

1. Repository variable `GBP_SHEET_ID` = the sheet URL or ID (Settings > Secrets and variables > Actions > Variables). Secret `GEMINI_API_KEY` as above.
2. **Generate month of GBP posts**: the posts appear as a table on the run's Summary page; the CSV is under Artifacts.
3. Import the CSV into the `<id>_posts` tab, review, then run **Sync posts from Google Sheet**: it commits `out/<id>/posts.json` only if every post passes the checks, and the website widget picks it up from `main`.
