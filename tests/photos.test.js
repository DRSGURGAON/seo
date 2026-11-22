import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { aiStatus, buildPhotoPrompt, pickTargets, reviewRow, applyApproved, AI_TAB } from '../src/photos.js';
import { buildTemplate, parseWorkbook, postsTab } from '../src/sheet.js';

const biz = JSON.parse(readFileSync('businesses/amex.json', 'utf8'));
const offer = { id: 'amex-offer-20261202', date: '2026-12-02T12:02:00+05:30', title: 'Early December offer', text: 'Moving this winter? We pack well. More text.', image: '', type: 'offer' };
const daily = { id: 'amex-20261202', date: '2026-12-02T11:00:00+05:30', title: 'Daily', text: 'x.', image: '' };
const old = { ...offer, id: 'amex-offer-20261101', date: '2026-11-01T10:00:00+05:30' };

test('aiStatus understands approve/reject words', () => {
  assert.deepEqual(['Approve', 'approved', 'yes', 'reject', 'No', '', 'maybe'].map(aiStatus), ['approve', 'approve', 'approve', 'reject', 'reject', '', '']);
});

test('prompt names the topic and season and forbids text, logos and faces', () => {
  const p = buildPhotoPrompt(biz, offer, 'show boxes, not a truck');
  assert.match(p, /Early December offer/);
  assert.match(p, /winter/);
  assert.match(p, /no text/);
  assert.match(p, /no recognisable faces/);
  assert.match(p, /show boxes, not a truck/);
});

test('pickTargets: upcoming, no image, filter by type, skip pending/approved, redo rejected with notes', () => {
  const posts = [old, daily, offer, { ...offer, id: 'o2' }, { ...offer, id: 'o3' }, { ...offer, id: 'o4', image: 'u' }];
  const aiRows = [{ post_id: 'o2', status: '' }, { post_id: 'o3', status: 'reject', notes: 'too dark' }];
  const t = pickTargets({ posts, aiRows, today: '2026-11-22', only: 'offer' });
  assert.deepEqual(t.map(x => [x.post.id, x.feedback]), [['amex-offer-20261202', ''], ['o3', 'too dark']]);
  assert.deepEqual(pickTargets({ posts, aiRows, today: '2026-11-22', only: 'post' }).map(x => x.post.id), ['amex-20261202']);
  assert.equal(pickTargets({ posts, aiRows, today: '2026-11-22', limit: 1 }).length, 1);
});

test('review row has an IMAGE preview; approved photos fill only empty images', () => {
  assert.equal(reviewRow({ bizId: 'amex', post: offer, url: 'https://x/y.png', prompt: 'p', created: 'c' }).preview, '=IMAGE("https://x/y.png")');
  const out = applyApproved([offer, { ...daily, image: 'keep' }], [{ post_id: offer.id, url: 'ai.png', status: 'approve' }, { post_id: daily.id, url: 'no.png', status: 'approve' }]);
  assert.equal(out[0].image, 'ai.png');
  assert.equal(out[1].image, 'keep');
});

test('sync reads the AI_Photos tab: approved photo lands on the post, pending is reported', async () => {
  const wb = buildTemplate([{ biz, feed: { posts: [] } }]);
  wb.getWorksheet(postsTab('amex')).addRow({ id: offer.id, date: '2026-12-02', time: '12:02', title: 'T', text: 'X', type: 'offer', offer_end: '2026-12-07' });
  wb.getWorksheet(postsTab('amex')).addRow({ id: 'amex-20261203', date: '2026-12-03', title: 'T2', text: 'Y' });
  const ai = wb.getWorksheet(AI_TAB);
  ai.addRow({ business_id: 'amex', post_id: offer.id, status: 'approve', url: 'https://x/a.png' });
  ai.addRow({ business_id: 'amex', post_id: 'amex-20261203', status: '', url: 'https://x/b.png' });
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  const { businesses, warnings } = parseWorkbook(back);
  const [p1, p2] = businesses[0].posts;
  assert.equal(p1.image, 'https://x/a.png');
  assert.equal(p2.image, '');
  assert.match(warnings.join('\n'), /1 AI photo\(s\) .* waiting/);
});
