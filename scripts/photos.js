// Draw AI photos with Gemini for upcoming posts that have no photo, for review in the sheet.
// Usage: npm run photos -- amex                 (every upcoming post without a photo)
//        npm run photos -- amex --only offer    (only offer posts; also: --only post)
//        npm run photos -- amex --limit 3
//        npm run photos -- amex --file sheet.xlsx  (a downloaded copy of the sheet instead of GBP_SHEET_ID)
// Needs GEMINI_API_KEY and GBP_SHEET_ID (.env locally, secret/variable in Actions).
// Writes photos/ai/<post-id>-<stamp>.<ext> and out/<id>/photo-review.csv. The photos must be pushed to
// main (the Action does it) before the preview formulas in the sheet can show them.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { geminiImage } from '../src/gemini.js';
import { loadWorkbook, parseWorkbook } from '../src/sheet.js';
import { toCsv } from '../src/month.js';
import { AI_COLUMNS, buildPhotoPrompt, pickTargets, reviewRow, extFor } from '../src/photos.js';

const args = process.argv.slice(2);
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const file = opt('--file');
const id = args.find(a => !a.startsWith('--') && ![opt('--only'), opt('--limit'), file].includes(a));
const only = opt('--only') || 'all', limit = Number(opt('--limit')) || Infinity;
try { process.loadEnvFile('.env'); } catch {}
const { GEMINI_API_KEY: apiKey, GBP_SHEET_ID: sheetId } = process.env;
const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  return url.replace(/\.git$/, '').match(/github\.com[/:](.+\/[^/]+)$/)?.[1];
}

async function main() {
  if (!id || !['all', 'offer', 'post'].includes(only)) { console.error('Usage: npm run photos -- <id> [--only offer|post] [--limit N]'); process.exitCode = 1; return; }
  if (!apiKey) { console.error('GEMINI_API_KEY missing (.env locally, repository secret in Actions).'); process.exitCode = 1; return; }
  if (!sheetId && !file) { console.error('GBP_SHEET_ID missing: the sheet is needed to see the posts and the AI_Photos reviews.'); process.exitCode = 1; return; }
  const repo = repoSlug();
  if (!repo) { console.error('Could not tell the GitHub repository from git remote.'); process.exitCode = 1; return; }

  const { businesses, errors } = parseWorkbook(await loadWorkbook({ file, sheetId }));
  if (errors.length) { errors.forEach(e => console.log(`ERROR ${e}`)); console.log('Fix the sheet first.'); process.exitCode = 1; return; }
  const b = businesses.find(x => x.biz.id === id);
  if (!b?.posts) { console.error(`${id}: not found or no posts tab in the sheet.`); process.exitCode = 1; return; }

  const now = new Date(Date.now() + 5.5 * 3600e3).toISOString(); // IST
  const targets = pickTargets({ posts: b.posts, aiRows: b.aiRows, today: now.slice(0, 10), only, limit });
  if (!targets.length) { console.log(`${id}: no upcoming ${only === 'all' ? '' : only + ' '}posts need a photo.`); return; }
  console.log(`${id}: drawing ${targets.length} photo(s) with ${model}`);

  mkdirSync('photos/ai', { recursive: true });
  const rows = [];
  const stamp = now.slice(0, 16).replace(/\D/g, '');
  for (const { post, feedback } of targets) {
    const prompt = buildPhotoPrompt(b.biz, post, feedback);
    try {
      const img = await geminiImage({ apiKey, model, prompt });
      const file = `photos/ai/${post.id}-${stamp}.${extFor(img.mimeType)}`;
      writeFileSync(file, img.data);
      rows.push(reviewRow({ bizId: id, post, url: `https://raw.githubusercontent.com/${repo}/main/${file}`, prompt, created: now.slice(0, 16).replace('T', ' ') }));
      console.log(`  ${post.id}: ${file}${feedback ? ' (redo after reject)' : ''}`);
    } catch (e) {
      console.log(`  ${post.id}: FAILED ${e.message}`);
      if (/404|API key|permission|quota/i.test(e.message)) break;
    }
  }
  mkdirSync(`out/${id}`, { recursive: true });
  writeFileSync(`out/${id}/photo-review.csv`, toCsv(rows, AI_COLUMNS));
  console.log(`\n${rows.length}/${targets.length} photo(s) -> out/${id}/photo-review.csv (import into the AI_Photos tab, Append)`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    `## ${id}: ${rows.length} AI photo(s) to review`, '',
    'Download photo-review.csv (Artifacts, or out/' + id + '/photo-review.csv on main), import it into the AI_Photos tab (Append), then set status to approve or reject.', '',
    '| Post | Title | Photo |', '|---|---|---|',
    ...rows.map(r => `| ${r.post_id} | ${(b.posts.find(p => p.id === r.post_id)?.title || '').replace(/\|/g, '\\|')} | <img src="${r.url}" width="240"> |`), '',
  ].join('\n'));
  if (rows.length < targets.length) process.exitCode = 1;
}
await main().catch(e => { console.error(e.message); process.exitCode = 1; });
