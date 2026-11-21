import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialLoadouts, parseSavedLoadouts, availableKit } from '../loadouts.ts';
import { RespawnSelection, WEAPONS_FLAG, catalogFromWeapons } from '../../../game/respawnSelect.ts';
const current = { primary: 103004, secondary: 202022, melee: 301001, grenade: 407001, special: 508002 };

test('three named loadouts have independent equipment and validate names and slot ownership types', () => {
  const data = initialLoadouts(current); data.presets[1].kit.primary = 105003;
  assert.equal(data.presets[0].kit.primary, 103004);
  assert.equal(parseSavedLoadouts(data).presets[1].kit.primary, 105003);
  for (const invalid of [{ ...data, active: 3 }, { ...data, presets: [] }, { ...data, presets: [{ name: '', kit: current }, ...data.presets.slice(1)] }, { ...data, presets: [{ name: 'Bad', kit: { ...current, melee: 103004 } }, ...data.presets.slice(1)] }]) assert.throws(() => parseSavedLoadouts(invalid));
});
test('unavailable saved equipment falls back per slot while both tactical items survive', () => {
  const result = availableKit({ ...current, primary: 105003 }, new Set(Object.values(current)), current);
  assert.deepEqual(result, current); assert.equal(result.grenade, 407001); assert.equal(result.special, 508002);
});
const catalog = catalogFromWeapons([
  { id: 103004, slot: 1, className: 'Assault', name: 'K-2' }, { id: 105003, slot: 1, className: 'Sniper', name: 'SSG69' },
  { id: 202022, slot: 2, className: 'HandGun', name: 'Colt45' }, { id: 301001, slot: 3, className: 'Knife', name: 'M7' },
  { id: 407001, slot: 4, className: 'ThrowingGrenade', name: 'K400' }, { id: 508002, slot: 5, className: 'ThrowingGrenade', name: 'Flashbang' },
]);
const inv = { equipped: current, items: [...Object.values(current),105003].map(itemId => ({ itemId, objectId: itemId })) };
test('named loadout changes wait for respawn; cancellation preserves the equipped kit', () => {
  const selection = new RespawnSelection(catalog, inv);
  selection.open(); selection.selectKit({ ...current, primary: 105003 }); selection.close(false);
  assert.equal(selection.takeForRespawn().primary, current.primary);
  selection.open(); selection.selectKit({ ...current, primary: 105003 }); selection.close(true);
  assert.equal(selection.hasPending(), true); assert.equal(inv.equipped.primary, current.primary);
  const next = selection.takeForRespawn(); assert.equal(next.primary, 105003); assert.equal(next.grenade, 407001); assert.equal(next.special, 508002);
  selection.open(); selection.selectItem('primary', 999999); assert.equal(selection.current().primary, 105003);
});
test('saved kits obey sniper-only room rules and cannot restore restricted weapons', () => {
  const selection = new RespawnSelection(catalog, inv, WEAPONS_FLAG.primary | WEAPONS_FLAG.Sniper | WEAPONS_FLAG.melee);
  selection.open(); selection.selectKit(current); selection.close(true);
  const next = selection.takeForRespawn(); assert.equal(next.primary, 105003); assert.equal(next.secondary, 0); assert.equal(next.grenade, 0); assert.equal(next.special, 508002);
});
