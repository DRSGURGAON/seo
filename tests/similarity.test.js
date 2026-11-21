import test from 'node:test';
import assert from 'node:assert/strict';
import { similarity, findDuplicates } from '../src/similarity.js';
test('identical texts score 1', () => assert.equal(similarity('a b c d e f', 'a b c d e f'), 1));
test('different texts score 0', () => assert.equal(similarity('one two three four five', 'six seven eight nine ten'), 0));
test('findDuplicates flags near copies', () => {
  const a = 'we pack glass and crockery with bubble wrap and soft paper every day';
  assert.equal(findDuplicates([a, a + ' today', 'totally different words about storage rooms and godown rates here']).length, 1);
});
