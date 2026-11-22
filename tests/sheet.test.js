import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { buildTemplate, parseWorkbook, feedHeader, parseDate, parseTime, tzOffset, postsTab } from '../src/sheet.js';

const biz = JSON.parse(readFileSync('businesses/amex.json', 'utf8'));
const feed = JSON.parse(readFileSync('out/amex/posts.json', 'utf8'));

// Write + read back through a real .xlsx buffer, like a Google Sheets export.
async function roundTrip(wb) {
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  return back;
}

test('template round-trips to the same posts.json and config', async () => {
  const wb = await roundTrip(buildTemplate([{ biz, feed }]));
  const { businesses, errors } = parseWorkbook(wb);
  assert.deepEqual(errors, []);
  assert.deepEqual(businesses[0].biz, biz);
  assert.deepEqual({ ...feedHeader(businesses[0].biz), posts: businesses[0].posts }, feed);
});

test('cells typed in Google Sheets (real dates, times, DD/MM/YYYY) are understood', () => {
  assert.equal(parseDate(new Date(Date.UTC(2026, 11, 25))), '2026-12-25');
  assert.equal(parseDate('25/12/2026'), '2026-12-25');
  assert.equal(parseDate(46381), '2026-12-25');
  assert.equal(parseTime(new Date(Date.UTC(1899, 11, 30, 11, 0))), '11:00');
  assert.equal(parseTime(11 / 24), '11:00');
  assert.equal(parseTime('6:30 pm'), '18:30');
  assert.equal(tzOffset('Asia/Kolkata', '2026-12-25'), '+05:30');
});

test('drafts are left out, photo ids resolve, bad rows are reported', async () => {
  const wb = buildTemplate([{ biz, feed: { posts: feed.posts.slice(0, 2) } }]);
  const ws = wb.getWorksheet(postsTab('amex'));
  ws.getCell('H2').value = 'draft';
  ws.addRow({ date: 'kal', title: 'x', text: 'y' });
  const { businesses, errors, warnings } = parseWorkbook(await roundTrip(wb));
  assert.equal(businesses[0].posts.length, 1);
  assert.equal(businesses[0].posts[0].image, feed.posts[1].image);
  assert.match(errors.join('\n'), /date "kal" not understood/);
  assert.match(warnings.join('\n'), /1 draft/);
});

test('inactive rows are skipped and missing fields are named', async () => {
  const wb = buildTemplate([{ biz, feed }, { biz: { id: 'drs', name: 'DRS', active: false } }, { biz: { id: 'sw', name: 'SW' } }]);
  const { businesses, errors } = parseWorkbook(await roundTrip(wb));
  assert.deepEqual(businesses.map(b => b.biz.id), ['amex']);
  assert.match(errors[0], /\(sw\): fill phone, primary_keyword/);
});
