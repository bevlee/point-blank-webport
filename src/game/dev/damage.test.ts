import assert from "node:assert/strict";
import { test } from "node:test";
import { pbHitDamage, ZoneMultiplier } from "../damage.ts";

test("head, torso and limb hits use the agreed balance with integer rounding", () => {
  assert.equal(pbHitDamage({ base: 33, zone: "head" }).damage, 50);
  for (const zone of ["torso", "body"] as const) {
    assert.equal(pbHitDamage({ base: 33, zone }).damage, 33);
  }
  for (const zone of ["limb", "arm", "leg", "hand", "foot"] as const) {
    assert.equal(pbHitDamage({ base: 33, zone }).damage, 26);
  }
  assert.deepEqual(ZoneMultiplier, { head: 1.5, torso: 1, limb: 0.8 });
});

test("limb damage retains distance falloff", () => {
  assert.equal(pbHitDamage({ base: 40, zone: "limb", distance: 100, range: 100, dpdRate: 0.25 }).damage, 24);
});
