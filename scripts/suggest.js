// Google autocomplete suggestions for keyword research (free, no key). Used by the gbp-research skill.
//   node scripts/suggest.js "storage in gurgaon" "self storage gurgaon" ...
// Prints each seed with its suggestions, then every suggestion that came up for 2+ seeds (the strongest phrases).
const seeds = process.argv.slice(2);
if (!seeds.length) { console.error('Usage: node scripts/suggest.js "<seed phrase>" ...'); process.exitCode = 1; }
const count = new Map();
for (const q of seeds) {
  const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=in&q=${encodeURIComponent(q)}`);
  const list = res.ok ? JSON.parse(await res.text())[1] : [];
  console.log(`# ${q}\n  ${list.join('\n  ') || '(none)'}`);
  list.forEach(s => count.set(s, (count.get(s) || 0) + 1));
}
const strong = [...count].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
if (strong.length) console.log(`\nCame up for 2+ seeds:\n${strong.map(([s, n]) => `  ${n}x ${s}`).join('\n')}`);
