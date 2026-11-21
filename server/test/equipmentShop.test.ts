import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoodsItem } from '../src/shared/shop.ts';
import { ItemsModel, ItemEquipType } from '../src/shared/items.ts';
import { equipmentPurchaseAllowed, permanentEquipmentGoods } from '../src/shared/equipmentShop.ts';
import { requiredLevel, playerLevel, weaponType } from '../../src/lobby/equipment/rules.ts';

function good(id: number, priceGold: number, priceCash: number, count = 86400): GoodsItem {
  const g = new GoodsItem(); g.id = id * 100 + count; g.item = new ItemsModel(id, 'Rifle (24 hours)', ItemEquipType.Durable, count);
  g.priceGold = priceGold; g.priceCash = priceCash; g.authType = 2; return g;
}
test('equipment has one permanent Credit offer and no cash charge or period', () => {
  const variants = [good(103001, 2500, 0), good(103001, 9500, 0, 604800), good(103002, 0, 800), good(103003, 1, 0)];
  const offers = permanentEquipmentGoods(variants);
  assert.deepEqual(offers.map(g => [g.item.id, g.priceGold, g.priceCash, g.item.equip, g.item.count]), [[103001, 9500, 0, 3, 1], [103002, 800, 0, 3, 1]]);
  assert.ok(offers.every(g => g.authType === 3 && !g.item.name.includes('hours')));
});
test('real gold pricing takes precedence over legacy cash tiers; non-equipment stays intact', () => {
  const coupon = good(1800006, 0, 500);
  const offers = permanentEquipmentGoods([good(103001, 0, 20000), good(103001, 4000, 0), coupon]);
  assert.equal(offers[0].priceGold, 4000); assert.equal(offers[1], coupon); assert.equal(coupon.priceCash, 500);
});
test('server rejects level-locked equipment, duplicate carts and permanent items already owned', () => {
  const sniper = permanentEquipmentGoods([good(105001, 9500, 0)])[0];
  assert.equal(requiredLevel(sniper.item.id), 10);
  assert.equal(playerLevel(8), 9);
  assert.equal(equipmentPurchaseAllowed(8, [sniper], []), false);
  assert.equal(equipmentPurchaseAllowed(9, [sniper], []), true);
  assert.equal(equipmentPurchaseAllowed(9, [sniper, sniper], []), false);
  assert.equal(equipmentPurchaseAllowed(9, [sniper], [{ id: 105001, equip: ItemEquipType.Permanent }]), false);
  assert.equal(equipmentPurchaseAllowed(9, [sniper], [{ id: 105001, equip: ItemEquipType.Temporary }]), true);
});
test('weapon filters and progression cover melee, sidearms and primary weapon types', () => {
  assert.deepEqual([103001,104001,105001,106001,108001,202001,301001,407001].map(weaponType), ['rifle','smg','sniper','shotgun','machinegun','sidearm','melee','tactical']);
  assert.equal(requiredLevel(301001), 1); assert.equal(requiredLevel(601001), 1);
});
