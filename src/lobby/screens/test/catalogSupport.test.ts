import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isItemComplete, setItemSupport } from '../../state/charaSupport.ts';

afterEach(() => setItemSupport(null));
test('supported coupon base covers its duration variants without allowing unrelated coupons', () => {
  setItemSupport({ complete: [1700001] });
  assert.equal(isItemComplete(1700001), true);
  assert.equal(isItemComplete(1701001), true, '1-day EXP coupon');
  assert.equal(isItemComplete(1730001), true, '30-day EXP coupon');
  assert.equal(isItemComplete(1701008), false, 'unsupported ammo coupon');
  assert.equal(isItemComplete(3200219), false, 'ID_FISH has no matching assets');
});
