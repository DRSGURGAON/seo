// Generate a month of WEBSITE blog articles with Gemini, ready to paste into the <id>_blogs tab of the sheet.
// Usage: npm run blogs -- amex 2026-12                 (needs GEMINI_API_KEY in .env or the environment)
//        npm run blogs -- amex 2026-12 --count 4       (default: blogs_per_month from the Businesses tab, else 8)
//        npm run blogs -- amex 2026-12 --from 2026-12-15
// Writes out/<id>/<YYYY-MM>.blogs.csv (gitignored). Import it into <id>_blogs, review, then `npm run sync`.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { geminiJson } from '../src/gemini.js';
import { generateBlogs, spreadDates, blogsPerMonth, fetchSitePages, BLOG_SCHEMA, blogSummary } from '../src/blogs.js';
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
  const dates = spreadDates(month, count, opt('--from'));
  if (!dates.length) { console.log(`${id}: no blog dates for ${month} (count ${count}).`); return; }

  const sitePages = await fetchSitePages(biz.website);
  console.log(`${id}: ${dates.length} blogs for ${dates.join(', ')} with ${model} (${sitePages.length} existing website pages avoided, ${existing.length} earlier blogs)`);
  const rows = await generateBlogs({
    biz, existing, photos, sitePages, dates, log: console.log,
    generate: prompt => geminiJson({ apiKey, model, prompt, schema: BLOG_SCHEMA, temperature: 0.8 }),
  });
  mkdirSync(`out/${id}`, { recursive: true });
  const file = `out/${id}/${month}.blogs.csv`;
  writeFileSync(file, toCsv(rows, BLOG_COLUMNS));
  console.log(`\n${rows.length}/${dates.length} blogs passed the checks -> ${file}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, blogSummary(rows, { id, month }));
  if (rows.length < dates.length) {
    console.log(`${dates.length - rows.length} blog(s) missing after retries: run again with --count ${dates.length - rows.length}`);
    process.exitCode = 1;
  }
}
await main().catch(e => { console.error(e.message); process.exitCode = 1; });
