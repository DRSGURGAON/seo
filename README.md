# GBP Automation Engine

Auto-generate unique SEO Google Business Profile posts and show the same posts on the business website.

```
npm run check      # validate out/amex/posts.json (length, keywords, duplicates)
npm test
```

Website embed (copy `widget/gbp-posts.js` and `out/<id>/posts.json` to the site's `public/gbp/`):

```html
<div data-gbp-posts data-src="/gbp/posts.json" data-cols="4" data-limit="8" data-accent="#9b1c2c"></div>
<script src="/gbp/gbp-posts.js" defer></script>
```
Preview all posts regardless of date: add `?gbp=all` to the page URL or `data-show="all"`.

See CLAUDE.md for rules and roadmap.
