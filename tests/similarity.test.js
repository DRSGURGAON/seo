import test from 'node:test';
import assert from 'node:assert/strict';
import { similarity, findDuplicates } from '../src/similarity.js';
test('identical texts score 1', () => assert.equal(similarity('a b c d e f', 'a b c d e f'), 1));
test('different texts score 0', () => assert.equal(similarity('one two three four five', 'six seven eight nine ten'), 0));
test('findDuplicates flags near copies', () => {
  const a = 'we pack glass and crockery with bubble wrap and soft paper every day';
  assert.equal(findDuplicates([a, a + ' today', 'totally different words about storage rooms and godown rates here']).length, 1);
});

test('checkAcrossProfiles flags near-identical posts on two profiles only', async () => {
  const { checkAcrossProfiles } = await import('../src/check.js');
  const rules = { post_rules: { max_similarity: 0.5 } };
  const text = 'the best packers in gurgaon pack every carton with care and deliver it safely to your new home on time';
  const a = { biz: { id: 'amex', ...rules }, posts: [{ id: 'a1', title: 'T', text }, { id: 'a2', title: 'T', text }] };
  const b = { biz: { id: 'amex81', ...rules }, posts: [{ id: 'b1', title: 'T', text }, { id: 'b2', title: 'Other', text: 'completely different words about storage rooms and monthly rent in sector eighty one' }] };
  const probs = checkAcrossProfiles([a, b]);
  assert.equal(probs.length, 2);
  assert.match(probs[0], /amex a1 & amex81 b1/);
  assert.deepEqual(checkAcrossProfiles([a, { biz: b.biz, posts: [] }]), []);
});
