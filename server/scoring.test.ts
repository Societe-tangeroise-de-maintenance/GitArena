import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyXpRates } from './scoring.js';

test('legacy overrides preserve zero and fall back to original rates', () => {
  assert.deepEqual(legacyXpRates({ commit: 10, prOpened: 20, prMerged: 30 }, { commit: 0, prMerged: 40 }),
    { commit: 0, prOpened: 20, prMerged: 40 });
});
test('missing or invalid rates cannot create NaN or corrupt migrated scores', () => {
  for (const commit of [undefined, NaN, Infinity, -1]) {
    assert.throws(() => legacyXpRates({ prOpened: 20, prMerged: 30, ...Object.fromEntries([['commit', commit]]) }), /invalid legacy XP rate/);
  }
});
