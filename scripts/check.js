// Usage: node scripts/check.js amex   -> validates out/<id>/posts.json against businesses/<id>.json rules
import { readFileSync } from 'node:fs';
import { findDuplicates } from '../src/similarity.js';
const id = process.argv[2] || 'amex';
const biz = JSON.parse(readFileSync(`businesses/${id}.json`, 'utf8'));
const { posts } = JSON.parse(readFileSync(`out/${id}/posts.json`, 'utf8'));
const r = biz.post_rules;
let errors = 0;
const texts = posts.map(p => `${p.title} ${p.text}`);
const pk = biz.primary_keyword.toLowerCase(), sk = biz.secondary_keyword.toLowerCase();
texts.forEach((t, i) => {
  if (t.length < r.min_chars - (r.length_tolerance||0) || t.length > r.max_chars + (r.length_tolerance||0)) { console.log(`post ${i + 1}: length ${t.length} outside ${r.min_chars}-${r.max_chars}`); errors++; }
  if (!t.toLowerCase().includes(pk) && !t.toLowerCase().includes(sk)) { console.log(`post ${i + 1}: no keyword`); errors++; }
});
const dups = findDuplicates(texts, r.max_similarity);
dups.forEach(d => { console.log(`posts ${d.i + 1} & ${d.j + 1}: similarity ${d.s}`); errors++; });
const dates = new Set(posts.map(p => p.date));
if (dates.size !== posts.length) { console.log('duplicate dates'); errors++; }
console.log(`${posts.length} posts, ${errors} problem(s)`);
process.exit(errors ? 1 : 0);
