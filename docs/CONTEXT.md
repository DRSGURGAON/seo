# Project context (handoff from the planning chat, 2026-11-21)

Owner: Pradeep, Gurgaon. Casual Hinglish, wants copy-paste-ready output and speed.
Businesses: American Express Packers and Movers (amex, americanpackersncr.in), Defence Relocation Services (drs, defencerelocationservices.in), StorageWale (Gurgaon, Pune, Bangalore).

## Goal
Own GBP automation engine (later a SaaS): auto-pick topics, write unique SEO GBP posts, use real photos, schedule/publish, and show the same posts on the website ("one post, two outputs"). GBP API access was rejected twice, so do not depend on it for now.

## Done
- AmEx: 30 unique posts scheduled in Localo, 22 Nov - 21 Dec 2026, 11:00 IST, same set in `out/amex/posts.json`. Primary keyword "best packers in Gurgaon", secondary "best movers in Gurgaon". Max similarity 0.185.
- Widget `widget/gbp-posts.js` (v2): 4-col grid, live dot header, action pills (WhatsApp/Directions/Review), modal, load more, JSON-LD, date filter (`?gbp=all` to preview). Tested on the real site and with Playwright.
- Competitor (GMB Expert Solution) widget = Google Apps Script reading a Google Sheet with a daily "drip", not a live GBP API feed. Ours does the same from posts.json.
- Profile SEO/NAP advice for AmEx (audit 57%, rank ~269). Pradeep fixes business name (plain text, no Unicode bold) and reviews himself.

## Localo automation notes (browser)
- Ant Design UI: plain JS click fails on menus; use real clicks or hover+mouse events.
- "Edit Post" creates a NEW post; delete + recreate instead. Delete needs a real click and popover confirm.
- Create flow: Manually > Manual tab > "Select from your published photos" > CTA Call now > date/time > Schedule.
- Localo AI auto-posts may reappear around 29 Dec; Pradeep may disable.

## Next (in order)
1. `drs.json` and `storagewale.json` configs.
2. `npm run month -- <id> <YYYY-MM>`: Gemini generator + topic engine; key in `.env` (git-ignored, repo is PUBLIC).
3. Cross-profile similarity check (all of Pradeep's profiles together, < 0.5).
4. Better title generation (some titles are short/cut).
5. Photo pool: replace Localo-hosted URLs with site `/gbp/img/NN.jpg` once Pradeep provides his 14 photos; later Drive pool with rotation.
6. Localo publish script; later GBP API adapter + per-client OAuth for SaaS.
7. Ask how the site deploys (git push / Netlify / Cloudflare Pages / cPanel).

## Multi-profile design
One engine, one `businesses/<id>.json` per profile, output in `out/<id>/`, per-profile history and photo rotation, `localo_location` field for publishing.

Full original transcript (cloud session only): /root/.claude/projects/-home-claude/c694d577-9c96-55d0-97b0-c3593894f762.jsonl
