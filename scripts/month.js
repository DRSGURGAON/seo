// Generate next month's GBP posts with Gemini, ready to paste into the <id>_posts tab of the sheet.
// Usage: npm run month -- amex 2026-12          (needs GEMINI_API_KEY in .env or the environment)
//        npm run month -- amex 2026-12 --from 2026-12-22
// Writes out/<id>/<YYYY-MM>.posts.csv (gitignored). The sheet stays the source of truth: import the
// CSV there, review, then `npm run sync`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { geminiJson } from '../src/gemini.js';
import { generateMonth, monthDates, dayAfter, POST_SCHEMA, toCsv } from '../src/month.js';
import { POST_COLUMNS } from '../src/sheet.js';

const args = process.argv.slice(2);
const [id, month] = args.filter(a => !a.startsWith('--') && !/^\d{4}-\d{2}-\d{2}$/.test(a));
const fromArg = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
try { process.loadEnvFile('.env'); } catch {}
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

async function main() {
  if (!id || !/^\d{4}-\d{2}$/.test(month || '')) { console.error('Usage: npm run month -- <id> <YYYY-MM> [--from YYYY-MM-DD]'); process.exitCode = 1; return; }
  if (!apiKey) { console.error('GEMINI_API_KEY missing. Add it to .env (local) or as a GitHub Actions secret.'); process.exitCode = 1; return; }
  const biz = JSON.parse(readFileSync(`businesses/${id}.json`, 'utf8'));
  const existing = existsSync(`out/${id}/posts.json`) ? JSON.parse(readFileSync(`out/${id}/posts.json`, 'utf8')).posts : [];
  const photos = existsSync(`out/${id}/photos.json`) ? JSON.parse(readFileSync(`out/${id}/photos.json`, 'utf8')) : [];
  const lastDate = existing.length ? existing[existing.length - 1].date.slice(0, 10) : null;
  const from = fromArg || (lastDate && lastDate.slice(0, 7) >= month ? dayAfter(lastDate) : null);
  const dates = monthDates(month, from);
  if (!dates.length) { console.log(`${id}: ${month} already covered (last post ${lastDate}). Nothing to do.`); return; }

  console.log(`${id}: generating ${dates.length} posts for ${dates[0]} .. ${dates.at(-1)} with ${model}`);
  const rows = await generateMonth({
    biz, existing, photos, dates, log: console.log,
    generate: prompt => geminiJson({ apiKey, model, prompt, schema: POST_SCHEMA }),
  });
  mkdirSync(`out/${id}`, { recursive: true });
  const file = `out/${id}/${month}.posts.csv`;
  writeFileSync(file, toCsv(rows, POST_COLUMNS));
  console.log(`\n${rows.length}/${dates.length} posts passed the checks -> ${file}`);
  if (rows.length < dates.length) {
    console.log(`${dates.length - rows.length} day(s) still empty after retries: run again with --from ${dates[rows.length]}`);
    process.exitCode = 1;
  }
}
await main().catch(e => { console.error(e.message); process.exitCode = 1; });
