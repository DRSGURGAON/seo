import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthDates, dayAfter, pickPhotos, postProblems, generateMonth, toCsv } from '../src/month.js';

const biz = {
  id: 'amex', name: 'Test Movers', established: 2016, services: ['house shifting'], areas: ['Sector 56'],
  primary_keyword: 'best packers in Gurgaon', secondary_keyword: 'best movers in Gurgaon',
  post_rules: { min_chars: 100, max_chars: 400, length_tolerance: 0, max_similarity: 0.5, time: '11:00', cta: 'call' },
};
const filler = n => Array.from({ length: n }, (_, i) => `word${i}x${Math.random().toString(36).slice(2, 7)}`).join(' ');
const good = () => ({ topic: 't', title: 'Moving soon?', text: `Looking for the best packers in Gurgaon? ${filler(12)} Call the best movers in Gurgaon.` });

test('monthDates covers the month and respects from', () => {
  assert.equal(monthDates('2026-12').length, 31);
  assert.deepEqual(monthDates('2026-12', '2026-12-30'), ['2026-12-30', '2026-12-31']);
  assert.equal(monthDates('2027-02').length, 28);
});

test('dayAfter rolls over months', () => {
  assert.equal(dayAfter('2026-12-21T11:00:00+05:30'), '2026-12-22');
  assert.equal(dayAfter('2026-11-30'), '2026-12-01');
});

test('pickPhotos continues the rotation after the last used photo', () => {
  const photos = [{ id: 'p1', url: 'u1' }, { id: 'p2', url: 'u2' }, { id: 'p3', url: 'u3' }];
  assert.deepEqual(pickPhotos(photos, [{ image: 'u2' }], 4), ['p3', 'p1', 'p2', 'p3']);
  assert.deepEqual(pickPhotos(photos, [], 2), ['p1', 'p2']);
  assert.deepEqual(pickPhotos([], [], 2), ['', '']);
});

test('postProblems flags length, keywords, phone numbers and near-duplicates', () => {
  const p = good();
  assert.deepEqual(postProblems(biz, p, []), []);
  assert.match(postProblems(biz, { title: 'x', text: 'short' }, []).join(), /characters/);
  assert.match(postProblems(biz, { ...p, text: p.text + ' Call 9008590012 now.' }, []).join(), /phone/);
  assert.match(postProblems(biz, { ...p, text: p.text.replace('best movers in Gurgaon', 'us') }, []).join(), /best movers/);
  assert.match(postProblems(biz, p, [p]).join(), /similar/);
});

test('generateMonth sends failures back and fills every date', async () => {
  const prompts = [];
  let call = 0;
  const generate = async prompt => {
    prompts.push(prompt);
    call++;
    // first call: 2 good + 1 with a phone number; second call: the rewrite
    return call === 1 ? [good(), good(), { ...good(), text: good().text + ' 9008590012' }] : [good()];
  };
  const rows = await generateMonth({ biz, existing: [], photos: [{ id: 'p1', url: 'u1' }], dates: ['2026-12-22', '2026-12-23', '2026-12-24'], generate });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.date), ['2026-12-22', '2026-12-23', '2026-12-24']);
  assert.equal(rows[0].id, 'amex-20261222');
  assert.equal(rows[0].status, 'scheduled');
  assert.match(prompts[1], /phone number/);
});

test('generateMonth gives up after the retry budget instead of looping forever', async () => {
  const rows = await generateMonth({ biz, existing: [], photos: [], dates: ['2026-12-22'], generate: async () => [{ title: 'x', text: 'bad' }], extraTries: 2 });
  assert.equal(rows.length, 0);
});

test('toCsv quotes commas, quotes and newlines', () => {
  assert.equal(toCsv([{ a: 'x,y', b: 'say "hi"\nok' }], ['a', 'b']), 'a,b\n"x,y","say ""hi""\nok"\n');
});

test('toSummary renders a readable table and escapes pipes and newlines', async () => {
  const { toSummary } = await import('../src/month.js');
  const md = toSummary([{ date: '2026-12-22', title: 'A | B', text: 'line one\nline two', chars: 712 }], { id: 'amex', month: '2026-12' });
  assert.match(md, /## amex 2026-12: 1 posts/);
  assert.match(md, /\| 2026-12-22 \| A \\\| B \| line one line two \| 712 \|/);
});

test('buildPrompt tells Gemini the publish month and season, and forbids invented claims', async () => {
  const { buildPrompt, seasonFor } = await import('../src/month.js');
  const p = buildPrompt(biz, { count: 2, avoidTitles: [], month: '2026-12' });
  assert.match(p, /December 2026/);
  assert.match(p, /winter/);
  assert.match(p, /only in a post that is about insurance/);
  assert.match(p, /never included/);
  assert.match(seasonFor('2027-07'), /monsoon/);
  assert.match(seasonFor('2027-04'), /summer/);
  assert.match(seasonFor('2026-10'), /festive/);
});

test('pickTimes gives every date its own time inside the window, never :00 or :30, and is stable', async () => {
  const { pickTimes } = await import('../src/month.js');
  const dates = monthDates('2027-01');
  const t = pickTimes(dates, { window: '09:00-19:00', seed: 'amex' });
  assert.equal(new Set(t).size, dates.length);
  for (const x of t) {
    assert.ok(x >= '09:00' && x <= '19:00', x);
    assert.ok(!/:(00|30)$/.test(x), x);
  }
  assert.deepEqual(pickTimes(dates, { seed: 'amex' }), t);
  assert.deepEqual(pickTimes(['2027-01-01'], { window: '', fallback: '11:00' }), ['11:00']);
  assert.ok(!pickTimes(['2027-01-01'], { avoid: t.slice(0, 1), seed: 'amex' }).includes(t[0]));
});

test('generateMonth uses varied times unless the window is "fixed"', async () => {
  const dates = ['2027-01-01', '2027-01-02', '2027-01-03'];
  const generate = async () => [good(), good(), good()];
  const rows = await generateMonth({ biz, existing: [], photos: [], dates, generate });
  assert.equal(new Set(rows.map(r => r.time)).size, 3);
  assert.ok(!rows.some(r => r.time === '11:00'));
  const fixed = { ...biz, post_rules: { ...biz.post_rules, time_window: 'fixed' } };
  const rows2 = await generateMonth({ biz: fixed, existing: [], photos: [], dates, generate });
  assert.deepEqual(rows2.map(r => r.time), ['11:00', '11:00', '11:00']);
});

test('offer posts do not move the photo rotation', () => {
  const photos = [{ id: 'p1', url: 'u1' }, { id: 'p2', url: 'u2' }, { id: 'p3', url: 'u3' }];
  assert.deepEqual(pickPhotos(photos, [{ image: 'u1' }, { image: 'u3', type: 'offer' }], 1), ['p2']);
});
