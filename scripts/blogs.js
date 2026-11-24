// Generate a month of WEBSITE blog articles with Gemini, ready to paste into the <id>_blogs tab of the sheet.
// Usage: npm run blogs -- amex 2026-12                 (needs GEMINI_API_KEY in .env or the environment)
//        npm run blogs -- amex 2026-12 --count 4       (default: blogs_per_month from the Businesses tab, else 8)
//        npm run blogs -- amex 2026-12 --from 2026-12-15
// Writes out/<id>/<YYYY-MM>.blogs.csv (gitignored). Import it into <id>_blogs, review, then `npm run sync`.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { geminiJson } from '../src/gemini.js';
import { generateBlogs, spreadDates, blogsPerMonth, fetchSitePages, BLOG_SCHEMA, blogSummary, parseCsv } from '../src/blogs.js';
import { toCsv } from '../src/month.js';
import { BLOG_COLUMNS } from '../src/sheet.js';

const args = process.argv.slice(2);
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const [id, month] = args.filter((a, i) => !a.startsWith('--') && !['--from', '--count'].includes(args[i - 1]));
try { process.loadEnvFile('.env'); } catch {}
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

async function main() {
  if (!id || !/^\d{4}-\d{2}$/.test(month || '')) { console.error('Usage: npm run blogs -- <id> <YYYY-MM> [--count N] [--from YYYY-MM-DD]'); process.exitCode = 1; return; }
  if (!apiKey) { console.error('GEMINI_API_KEY missing. Add it to .env (local) or as a GitHub Actions secret.'); process.exitCode = 1; return; }
  const biz = JSON.parse(readFileSync(`businesses/${id}.json`, 'utf8'));
  const read = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  const existing = read(`out/${id}/blogs.json`)?.blogs || [];
  const photos = read(`out/${id}/photos.json`) || [];
  const count = opt('--count') ? Number(opt('--count')) : blogsPerMonth(biz);
  const allDates = spreadDates(month, count, opt('--from'));
  // Resume: blogs already in this month's CSV (from an earlier, half-finished run) are kept and not written again.
  const file = `out/${id}/${month}.blogs.csv`;
  const done = existsSync(file) ? parseCsv(readFileSync(file, 'utf8')).filter(r => r.date && r.body) : [];
  const dates = allDates.filter(d => !done.some(r => r.date === d));
  if (!dates.length) { console.log(`${id}: ${done.length ? `all ${done.length} blogs for ${month} already in ${file}` : `no blog dates for ${month} (count ${count})`}.`); return; }

  const sitePages = await fetchSitePages(biz.website);
  console.log(`${id}: ${dates.length} blogs for ${dates.join(', ')} with ${model} (${sitePages.length} existing website pages avoided, ${existing.length} earlier blogs${done.length ? `, ${done.length} already in ${file}` : ''})`);
  const rows = await generateBlogs({
    biz, existing: [...existing, ...done], photos, sitePages, dates, log: console.log,
    generate: prompt => geminiJson({ apiKey, model, prompt, schema: BLOG_SCHEMA, temperature: 0.8 }),
  });
  mkdirSync(`out/${id}`, { recursive: true });
  const all = [...done, ...rows].sort((a, b) => a.date.localeCompare(b.date));
  writeFileSync(file, toCsv(all, BLOG_COLUMNS));
  const have = allDates.filter(d => all.some(r => r.date === d)).length;
  console.log(`\n${rows.length}/${dates.length} new blogs passed the checks, ${have}/${allDates.length} for ${month} in total -> ${file}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, blogSummary(all, { id, month }));
  if (have < allDates.length) {
    console.log(`${allDates.length - have} blog(s) still missing${rows.stopped ? ' (Gemini unavailable)' : ''}: run the same command again to fill only those.`);
    process.exitCode = 1;
  }
}
await main().catch(e => { console.error(e.message); process.exitCode = 1; });
