---
name: gbp-research
description: Keyword research and setup values for a new GBP client of any business type - "newclient research: Sharma Dental, Sector 56 Gurugram", "storagewale ke keywords dhundo". Finds primary/secondary keywords, services, areas and category from Google suggestions, Google Maps competitors and Localo rank, and proposes the Businesses-tab row. Use before the first posts for a new business or a new business type.
---

# Keyword research for a new business

Input: business name, type, city/area (address or Maps link if Pradeep has it). Output: a short Hinglish report plus the values for its Businesses row. Write nothing to the sheet until Pradeep approves.

## 1. Facts first
- Find the business's own Google profile (built-in browser, `https://www.google.com/maps/search/<name>+<city>`): exact name, address, primary category, rating, services listed. If there is none, say so: posts need a profile in Localo first.
- Ask only for what cannot be found (address, which city's profile, services they really offer). Never invent services.

## 2. What people search (free)
```
node scripts/suggest.js "<service> in <city>" "<service> near <area>" "<synonym> <city>" ...
```
Use 10-15 seeds: the main service, its synonyms (storage / self storage / storage space / warehouse), the main sub-services (household storage, furniture storage), and the city name both ways (gurgaon / gurugram). Phrases that come up for several seeds are the strongest. Drop off-topic ones (other cities, "how much", far-off meanings like cold storage for a household-storage business).

## 3. Who ranks now
Google Maps search for the top 2-3 phrases: note the top 5 competitors, their primary category, rating/review count and the words in their names and descriptions. Their primary category is usually the right one for this business too.

## 4. Where the business stands
In Localo: profile > Tracking (keywords and rank). Add the candidate phrases there if missing. Best primary keyword = clear search intent, the business really offers it, and the profile ranks roughly 5-30 (room to climb). A keyword where it is already top 3 is kept but not chosen as primary.

## 5. Pick and propose
- `category`: plain business type used in post prompts, e.g. "self storage", "packers and movers", "dental clinic".
- `primary_keyword`: "<main service> in <city>" (exact phrase people use, e.g. "storage in Gurgaon").
- `secondary_keyword`: a different, also searched phrase (a sub-service or synonym), never a copy of the primary.
- `services`: only what the business confirms, 4-8 items.
- `areas`: 8-15 sectors/localities within a few km of the address, plus the city.
- `plan`: 3500 (20 posts a month) or 5000 (30), as sold to the client.
Report in a table: keyword, why (suggestion count, competitor use, Localo rank), and the proposed row. After approval, fill the row in the Businesses tab (F2 then type per cell, as in the gbp skill) and create `<id>_posts` by duplicating a `*_posts` tab with only the header row.

Search volume numbers need Google Keyword Planner (Google Ads account); without it rely on suggestions + competitors + Localo rank, which is enough for local GBP posts.
