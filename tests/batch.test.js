import test from 'node:test';
import assert from 'node:assert/strict';
import { planDates, checkBatch, sheetRows, toTsv, localoBody } from '../src/batch.js';

const biz = {
  id: 'x', primary_keyword: 'packers and movers in Gurugram', secondary_keyword: 'movers and packers in Gurugram',
  post_rules: { min_chars: 100, max_chars: 1000, length_tolerance: 0, max_similarity: 0.5, time: '11:00', cta: 'call' },
};
const post = (title, extra) => ({
  title, text: `Need packers and movers in Gurugram? ${extra} Call the movers and packers in Gurugram today for a free survey and quote.`,
});

test('planDates starts after the last daily post, ignores offers, never in the past', () => {
  const existing = [{ date: '2026-12-24T11:00:00+05:30' }, { date: '2026-12-30T09:00:00+05:30', type: 'offer' }];
  assert.deepEqual(planDates({ existing, count: 2, today: '2026-11-24' }), ['2026-12-25', '2026-12-26']);
  assert.deepEqual(planDates({ existing: [], count: 1, today: '2026-11-24' }), ['2026-11-25']);
  assert.equal(planDates({ existing, month: '2026-12', today: '2026-11-24' }).length, 7);
  assert.deepEqual(planDates({ existing, month: '2026-11', today: '2026-11-24' }), []);
});

test('checkBatch rejects repeats of existing or batch posts and taken dates', () => {
  const old = { ...post('Old one', 'We pack kitchens with care and label every box by room.'), date: '2026-12-24T11:00:00+05:30' };
  const fresh = post('Office moves on weekends', 'Desks, files and servers are tagged and moved over a weekend so work resumes on Monday.');
  assert.deepEqual(checkBatch(biz, [old], [fresh], ['2026-12-25']), []);
  const copy = { ...old };
  const probs = checkBatch(biz, [old], [fresh, copy], ['2026-12-25', '2026-12-24']);
  assert.equal(probs.length, 1);
  assert.match(probs[0], /too similar/);
  assert.match(probs[0], /title already used/);
  assert.match(probs[0], /already has a post/);
});

test('sheet rows and Localo body', () => {
  const rows = sheetRows(biz, [post('A\ttitle', 'x')], ['2026-12-25'], ['11:00'], 32);
  assert.equal(rows[0].chars, '=IF(E32="","",LEN(D32)+1+LEN(E32))');
  assert.equal(rows[0].status, 'scheduled');
  assert.equal(toTsv(rows).split('\t').length, 14);
  assert.equal(localoBody({ title: ' T ', text: ' body ' }), 'T\r\nbody');
});
