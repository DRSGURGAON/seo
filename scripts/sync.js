// Pull the Google Sheet and rebuild businesses/<id>.json, out/<id>/posts.json and out/<id>/photos.json.
// Usage: npm run sync                       (uses GBP_SHEET_ID from .env)
//        npm run sync -- --file my.xlsx     (use a downloaded .xlsx instead)
//        npm run sync -- --dry              (show what would change, write nothing)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadWorkbook, parseWorkbook, feedHeader } from '../src/sheet.js';
import { checkPosts, checkAcrossProfiles } from '../src/check.js';

const args = process.argv.slice(2);
const file = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
const dry = args.includes('--dry');
try { process.loadEnvFile('.env'); } catch {}
const sheetId = process.env.GBP_SHEET_ID;
if (!file && !sheetId) {
  console.error('GBP_SHEET_ID missing. Add it to .env (see .env.example) or pass --file <path.xlsx>.');
  process.exit(1);
}

// Exit via process.exitCode, not process.exit(): exiting while fetch is closing sockets crashes Node on Windows.
async function main() {
  let wb;
  try { wb = await loadWorkbook({ file, sheetId }); } catch (e) { console.error(e.message); process.exitCode = 1; return; }
  const { businesses, errors, warnings } = parseWorkbook(wb);
  warnings.forEach(w => console.log(`note: ${w}`));
  if (errors.length) {
    errors.forEach(e => console.log(`ERROR ${e}`));
    console.log(`\n${errors.length} error(s) in the sheet. Nothing written, fix the sheet and run again.`);
    process.exitCode = 1;
    return;
  }

  const writeIfChanged = (path, data) => {
    const text = JSON.stringify(data, null, path.includes('posts.json') ? 1 : 2) + '\n';
    if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
    if (!dry) { mkdirSync(path.replace(/[\\/][^\\/]+$/, ''), { recursive: true }); writeFileSync(path, text); }
    return true;
  };

  let problems = 0;
  for (const { biz, posts, photos } of businesses) {
    const changed = [];
    if (writeIfChanged(`businesses/${biz.id}.json`, biz)) changed.push(`businesses/${biz.id}.json`);
    if (posts) {
      if (writeIfChanged(`out/${biz.id}/posts.json`, { ...feedHeader(biz), posts })) changed.push(`out/${biz.id}/posts.json`);
    }
    if (photos.length && writeIfChanged(`out/${biz.id}/photos.json`, photos)) changed.push(`out/${biz.id}/photos.json`);
    const issues = posts ? checkPosts(biz, posts) : [];
    problems += issues.length;
    console.log(`\n${biz.id}: ${posts ? posts.length : 0} posts, ${issues.length} problem(s)` +
      (changed.length ? `, ${dry ? 'would update' : 'updated'} ${changed.join(', ')}` : ', no changes'));
    issues.forEach(i => console.log(`  ${i}`));
  }
  const across = checkAcrossProfiles(businesses);
  if (across.length) {
    console.log(`\n${across.length} post pair(s) too similar between profiles (rewrite one of each pair):`);
    across.forEach(i => console.log(`  ${i}`));
  }
  problems += across.length;
  process.exitCode = problems ? 1 : 0;
}
await main();
