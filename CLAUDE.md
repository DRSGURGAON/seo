# GBP Automation Engine (repo: seo)

Owner: Pradeep (Gurgaon). Businesses: American Express Packers and Movers (amex), Defence Relocation Services (drs), StorageWale. Casual Hinglish, wants copy-paste-ready output and speed.

## What this does
Generate unique SEO Google Business Profile posts per business, one per day, and publish them in two places:
1. Google (via Localo scheduling today; Google Business Profile API later, access was rejected twice).
2. The business website, via `widget/gbp-posts.js` reading `out/<id>/posts.json` ("one post, two outputs").

## Rules
- Repo is PUBLIC: never commit API keys, tokens, passwords or customer data. Use `.env` (git-ignored).
- Business name in GBP must be plain real-world name, no keywords/Unicode bold.
- Posts: 700-1000 chars, primary keyword in opener, secondary in closer, similarity to any other post < 0.5 (`npm run check`), no phone numbers in text, one photo, CTA = Call now.
- Photos: real business photos from a pool, rotated; no repeats until the pool is used. AI photos (Gemini, `npm run photos`) only for posts without one, only generic scenes (no text, logos, branded trucks, faces), and only after Pradeep approves them in the AI_Photos tab.
- Widget shows a post only on/after its date; offer posts (type = offer) hide after offer_end.
- From Jan 2027 every post has its own time anywhere in the 24 hours (month generator, `post_time_window`, default 00:00-23:59); no two posts at the same time.

## Layout
businesses/<id>.json config - src/ engine - scripts/ CLI - widget/ website widget - out/<id>/ generated posts.json - docs/ notes.

## Google Sheet is the source of truth
Pradeep edits one Google Sheet (tabs: Businesses, <id>_posts per profile, Photos); `npm run sync` (src/sheet.js, scripts/sync.js) rebuilds businesses/<id>.json, out/<id>/posts.json and out/<id>/photos.json from it. Do not hand-edit those JSON files, change the sheet (or the generator that fills it). Sheet ID is in `.env` as GBP_SHEET_ID; the sheet is link-shared, so no customer data in it. `npm run sheet:export` rebuilds an .xlsx from the JSON (first upload only).

## Status (2026-11-21)
AmEx: 30 posts scheduled in Localo 22 Nov - 21 Dec at 11:00 IST, `out/amex/posts.json` is the same set. Photo URLs in it are Localo-hosted (test only); replace with the site's own /gbp/img/*.
Google Sheet sync added 2026-11-21 (DRS, StorageWale rows in the sheet with active = no, to be filled).
Month generator done: `npm run month -- <id> <YYYY-MM>` (src/month.js, src/gemini.js) and the "Generate month of GBP posts" Action write a CSV for the sheet; key = GEMINI_API_KEY (.env locally, repo secret in Actions).
Offers (2026-11-22): `out/amex/offers-2026-11-to-2027-03.csv`, 10% off local shifting, runs 2-7 and 16-25 each month; to be imported into amex_posts; terms in notes confirmed by Pradeep. Photos for them: "Generate AI photos" Action (only = offer, source = pool: own photo + code-drawn offer banner, src/banner.js), review in AI_Photos. Gemini image generation failed 2026-11-24 with free-tier quota 0: needs billing on the key.
Next: topic engine, DRS and StorageWale details, Drive photo pool, Localo publish script.
