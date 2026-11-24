// Make photos for upcoming posts that have no photo, for review in the sheet (AI_Photos tab).
// Offer posts get a banner ("10% OFF LOCAL SHIFTING / Valid 2-7 Dec 2026") drawn by code.
// Usage: npm run photos -- amex                 (every upcoming post without a photo, Gemini draws them)
//        npm run photos -- amex --source pool   (use the business's own photos from the Photos tab instead of Gemini)
//        npm run photos -- amex --no-banner
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
import { addBanner, bannerLines } from '../src/banner.js';

const args = process.argv.slice(2);
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const file = opt('--file');
const id = args.find(a => !a.startsWith('--') && ![opt('--only'), opt('--limit'), opt('--source'), file].includes(a));
const only = opt('--only') || 'all', limit = Number(opt('--limit')) || Infinity;
const source = opt('--source') || 'gemini', banner = !args.includes('--no-banner');
try { process.loadEnvFile('.env'); } catch {}
const { GEMINI_API_KEY: apiKey, GBP_SHEET_ID: sheetId } = process.env;
const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  return url.replace(/\.git$/, '').match(/github\.com[/:](.+\/[^/]+)$/)?.[1];
}

async function main() {
  if (!id || !['all', 'offer', 'post'].includes(only) || !['gemini', 'pool'].includes(source)) { console.error('Usage: npm run photos -- <id> [--only offer|post] [--source gemini|pool] [--limit N] [--no-banner]'); process.exitCode = 1; return; }
  if (source === 'gemini' && !apiKey) { console.error('GEMINI_API_KEY missing (.env locally, repository secret in Actions).'); process.exitCode = 1; return; }
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
  const pool = b.photos.filter(p => /^https?:\/\//.test(p.url));
  if (source === 'pool' && !pool.length) { console.error(`${id}: no photos with a full https URL in the Photos tab.`); process.exitCode = 1; return; }
  console.log(`${id}: making ${targets.length} photo(s) from ${source === 'pool' ? `the Photos tab (${pool.length} photos)` : model}${banner ? ', offers get a banner' : ''}`);

  const dir = source === 'pool' ? 'photos/offers' : 'photos/ai';
  mkdirSync(dir, { recursive: true });
  const rows = [];
  const stamp = now.slice(0, 16).replace(/\D/g, '');
  const start = b.aiRows.length; // move through the pool so offers don't all get the same photo
  for (const [i, { post, feedback }] of targets.entries()) {
    let prompt = buildPhotoPrompt(b.biz, post, feedback);
    try {
      let img;
      if (source === 'pool') {
        const ph = pool[(start + i) % pool.length];
        const res = await fetch(ph.url);
        if (!res.ok) throw new Error(`could not download photo ${ph.id} (HTTP ${res.status})`);
        img = { mimeType: res.headers.get('content-type') || 'image/jpeg', data: Buffer.from(await res.arrayBuffer()) };
        prompt = `Photos tab ${ph.id} (${ph.url})`;
      } else {
        img = await geminiImage({ apiKey, model, prompt });
      }
      if (banner && post.type === 'offer') {
        img = { mimeType: 'image/jpeg', data: await addBanner(img.data, { ...bannerLines(post, b.biz), color: b.biz.widget?.accent || '#9b1c2c' }) };
        prompt += ' + offer banner';
      }
      const file = `${dir}/${post.id}-${stamp}.${extFor(img.mimeType)}`;
      writeFileSync(file, img.data);
      rows.push(reviewRow({ bizId: id, post, url: `https://raw.githubusercontent.com/${repo}/main/${file}`, prompt, created: now.slice(0, 16).replace('T', ' ') }));
      console.log(`  ${post.id}: ${file}${feedback ? ' (redo after reject)' : ''}`);
    } catch (e) {
      console.log(`  ${post.id}: FAILED ${e.message}`);
      if (/404|429|API key|permission|quota/i.test(e.message)) break;
    }
  }
  if (!rows.length) { console.log('\nNo photos made, nothing to review.'); process.exitCode = 1; return; }
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
