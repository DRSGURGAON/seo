import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { bannerLines, validity, addBanner } from '../src/banner.js';

const offer = { title: 'Early December offer', text: 'We are giving 10% off on local shifting charges this week.', date: '2026-12-02T12:02:00+05:30', offer_start: '2026-12-02', offer_end: '2026-12-07' };

test('validity covers same month, two months and two years', () => {
  assert.equal(validity('2026-12-02', '2026-12-07'), 'Valid 2–7 Dec 2026');
  assert.equal(validity('2026-11-16', '2026-12-03'), 'Valid 16 Nov – 3 Dec 2026');
  assert.equal(validity('2026-12-28', '2027-01-03'), 'Valid 28 Dec 2026 – 3 Jan 2027');
});

test('banner headline comes from the banner cell, else from the offer text', () => {
  assert.equal(bannerLines(offer).headline, '10% OFF LOCAL SHIFTING');
  assert.equal(bannerLines({ ...offer, text: 'Save 15% off this month.' }).headline, '15% OFF');
  assert.equal(bannerLines({ ...offer, text: 'No number here.' }).headline, 'SPECIAL OFFER');
  assert.equal(bannerLines({ ...offer, banner: 'Flat 10% off packing' }).headline, 'FLAT 10% OFF PACKING');
  assert.equal(bannerLines(offer, { name: 'Test Movers' }).brand, 'Test Movers');
});

test('addBanner returns a 1200x900 JPEG whatever the input size', async () => {
  const src = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#888' } }).png().toBuffer();
  const out = await addBanner(src, { ...bannerLines(offer), brand: 'A & B <Movers>' });
  const meta = await sharp(out).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 1200, 900]);
});
