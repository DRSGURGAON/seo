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
- Photos must be real business photos from a pool, rotated; no repeats until the pool is used.
- Widget shows a post only on/after its date.

## Layout
businesses/<id>.json config - src/ engine - scripts/ CLI - widget/ website widget - out/<id>/ generated posts.json - docs/ notes.

## Status (2026-11-21)
AmEx: 30 posts scheduled in Localo 22 Nov - 21 Dec at 11:00 IST, `out/amex/posts.json` is the same set. Photo URLs in it are Localo-hosted (test only); replace with the site's own /gbp/img/*.
Next: month generator (Gemini) + topic engine, DRS and StorageWale configs, Drive photo pool, Localo publish script.
