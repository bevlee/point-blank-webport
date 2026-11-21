import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrossStage } from '../slide.ts';

test('shop and inventory switch immediately and leave no old windows enabled', () => {
  const sounds: string[] = [], stage = new CrossStage(s => sounds.push(s));
  for (const step of ['inventory', 'shop', 'inventory', null] satisfies ('inventory' | 'shop' | null)[]) {
    stage.snap({ phase: 'lobby', step });
    assert.equal(stage.input(step ?? 'lobby'), true);
    assert.equal(stage.slides[step ?? 'lobby'].state, 0);
    assert.deepEqual([...stage.enabled], [step ?? 'lobby']);
    assert.equal(stage.slides[step === 'inventory' ? 'shop' : 'inventory'].state, 1);
  }
  assert.deepEqual(sounds, []);
});

test('returning from equipment keeps ordinary phase navigation working', () => {
  const stage = new CrossStage(() => {});
  stage.snap({ phase: 'lobby', step: null });
  stage.want({ phase: 'room', step: null });
  for (let i = 0; i < 120; i++) stage.frame(1 / 60, 1024, 768);
  assert.equal(stage.input('room'), true);
  assert.equal(stage.input('lobby'), false);
});
