// One-prompt GBP batch (used by the "gbp" Claude skill, .claude/skills/gbp/SKILL.md).
//   node scripts/batch.js plan  <id> --count 30        next 30 free days after the last post in the sheet
//   node scripts/batch.js plan  <id> --month 2027-01   the rest of that month
//   node scripts/batch.js stage <id> <posts.json>      check a written batch and build the sheet/Localo files
// Reads the live Google Sheet (GBP_SHEET_ID in .env or the environment). Writes only to out/<id>/batch/ (git-ignored).
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { loadWorkbook, parseWorkbook, postsTab, cellText } from '../src/sheet.js';
import { planDates, planTimes, checkBatch, sheetRows, toTsv, localoBody, worstSimilarity } from '../src/batch.js';
import { isOffer, seasonFor } from '../src/month.js';

const args = process.argv.slice(2);
const [cmd, id, file] = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a) && !/^\d{4}-\d{2}$/.test(a));
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
try { process.loadEnvFile('.env'); } catch {}
const dir = `out/${id}/batch`;
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

async function readSheet() {
  if (!process.env.GBP_SHEET_ID) throw new Error('GBP_SHEET_ID missing: add it to .env (see .env.example).');
  const wb = await loadWorkbook({ sheetId: process.env.GBP_SHEET_ID });
  const { businesses, errors } = parseWorkbook(wb);
  if (errors.length) throw new Error(`Sheet errors, fix them first:\n${errors.join('\n')}`);
  const found = businesses.find(b => b.biz.id === id);
  if (!found) throw new Error(`No business "${id}" in the Businesses tab. Ids: ${businesses.map(b => b.biz.id).join(', ')}`);
  const ws = wb.getWorksheet(postsTab(id));
  if (!ws) throw new Error(`No "${postsTab(id)}" tab. Duplicate an existing *_posts tab, name it ${postsTab(id)}, keep only the header row.`);
  // Every row with a title, drafts included, so a draft's date/title is never reused either.
  let lastRow = 1;
  const header = [];
  ws.getRow(1).eachCell((c, n) => { header[n] = cellText(c.value).toLowerCase(); });
  const tCol = header.indexOf('title'), dCol = header.indexOf('date');
  const raw = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const title = cellText(row.getCell(tCol).value);
    if (!title) return;
    lastRow = n;
    raw.push({ title, text: cellText(row.getCell(header.indexOf('text')).value), date: cellText(row.getCell(dCol).value) });
  });
  const posts = found.posts || [];
  const known = new Set(posts.map(p => p.title.trim().toLowerCase()));
  const existing = [...posts, ...raw.filter(r => !known.has(r.title.trim().toLowerCase()))];
  return { biz: found.biz, existing, nextRow: lastRow + 1 };
}

async function plan() {
  const count = Number(opt('--count')) || 0, month = opt('--month');
  if (!count && !month) throw new Error('Give --count N or --month YYYY-MM');
  const { biz, existing, nextRow } = await readSheet();
  const dates = planDates({ existing, count, month, today: istToday() });
  if (!dates.length) { console.log(`${id}: nothing to plan, ${month} is already covered.`); return; }
  const times = planTimes(biz, dates, existing);
  const daily = existing.filter(p => !isOffer(p));
  const p = {
    id, name: biz.name, localo_location: biz.localo_location || '', address: biz.address,
    primary_keyword: biz.primary_keyword, secondary_keyword: biz.secondary_keyword, services: biz.services, areas: biz.areas,
    rules: biz.post_rules, season: seasonFor(dates[0].slice(0, 7)),
    dates, times, nextRow, existing_count: existing.length, daily_count: daily.length,
    last_post: daily.length ? String(daily.at(-1).date).slice(0, 10) : null,
    avoid_titles: existing.map(e => e.title).slice(-80),
  };
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/plan.json`, JSON.stringify(p, null, 2));
  console.log(`${id} (${biz.name}): ${existing.length} posts in the sheet, last daily post ${p.last_post || 'none'}`);
  console.log(`plan: ${dates.length} posts ${dates[0]} .. ${dates.at(-1)}, sheet row ${nextRow} onwards -> ${dir}/plan.json`);
}

async function stage() {
  if (!file || !existsSync(file)) throw new Error('Usage: node scripts/batch.js stage <id> <posts.json>');
  const p = JSON.parse(readFileSync(`${dir}/plan.json`, 'utf8'));
  const posts = JSON.parse(readFileSync(file, 'utf8'));
  const { biz, existing, nextRow } = await readSheet();
  if (nextRow !== p.nextRow) throw new Error(`The sheet changed since the plan (next row ${nextRow}, plan said ${p.nextRow}). Run plan again.`);
  const problems = checkBatch(biz, existing, posts, p.dates);
  if (problems.length) {
    problems.forEach(x => console.log(`PROBLEM ${x}`));
    console.log(`\n${problems.length} problem(s). Rewrite those posts and stage again. Nothing built.`);
    process.exitCode = 1;
    return;
  }
  const rows = sheetRows(biz, posts, p.dates, p.times, p.nextRow);
  writeFileSync(`${dir}/sheet.tsv`, toTsv(rows));
  const localo = posts.map((post, i) => {
    const f = `${dir}/${String(i + 1).padStart(2, '0')}.txt`;
    writeFileSync(f, localoBody(post));
    return { n: i + 1, date: p.dates[i], time: p.times[i], title: post.title.trim(), chars: localoBody(post).length - 1, file: f };
  });
  writeFileSync(`${dir}/localo.json`, JSON.stringify(localo, null, 2));
  const sim = worstSimilarity(existing, posts);
  localo.forEach((l, i) => console.log(`${String(l.n).padStart(2)} ${l.date} ${l.time} ${l.chars}ch sim ${sim[i].toFixed(2)}  ${l.title}`));
  console.log(`\nAll ${posts.length} posts pass. Paste ${dir}/sheet.tsv at A${p.nextRow} of ${postsTab(id)}; Localo list: ${dir}/localo.json`);
}

const run = { plan, stage }[cmd];
if (!run || !id) { console.error('Usage: node scripts/batch.js plan <id> --count N | --month YYYY-MM\n       node scripts/batch.js stage <id> <posts.json>'); process.exitCode = 1; }
else await run().catch(e => { console.error(e.message); process.exitCode = 1; });
