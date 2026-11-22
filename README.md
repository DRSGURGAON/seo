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
