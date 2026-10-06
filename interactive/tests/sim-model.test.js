import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alarmChecks, alarmEpisodes, runSimulation } from '../sim/model.js';

const reference = JSON.parse(readFileSync(new URL('../reference/reference.json', import.meta.url)));

test('rolling alarm episodes review the first window of a consecutive run', () => {
  const bg = new Uint16Array(168);
  bg[48] = 4;
  const path = { bg, off: null, monthlyMeans: new Float64Array(14).fill(.1) };
  const checks = alarmChecks(path, 'D', 'SCU', 12, reference.inputs, reference.cusum_h);
  assert.equal(checks.alarm.reduce((sum, hit) => sum + hit, 0), 12);
  assert.deepEqual(alarmEpisodes(checks), [[0, 37, 49]]);
  const cusum = alarmChecks(path, 'E10', 'SCU', 12, reference.inputs, reference.cusum_h);
  assert.equal(cusum.alarm[0], 1);
  assert.deepEqual(alarmEpisodes(cusum)[0], [0, 48, 49]);
});

test('seeded output covers every reference cell and retains its denominators', () => {
  const options = { seed: 77, chanceReps: 8, detectionReps: 12 };
  const first = runSimulation(reference, options);
  const second = runSimulation(reference, options);
  assert.deepEqual(first, second);
  for (const rule of reference.inputs.rules) for (const type of Object.keys(reference.inputs.types)) {
    const chance = first.chance[rule][type];
    assert.equal(chance.counts.units, 8);
    assert.equal(chance.counts.unitYears, 80);
    assert.equal(chance.alpha, chance.counts.alarmingUnitYears / 80);
    assert.equal(chance.flag_ep, chance.counts.ownPasses / 80);
    for (const effect of [4, 7]) {
      const detection = first.detection[effect][rule][type];
      assert.equal(detection.counts.units, 12);
      assert.equal(detection.d, detection.counts.hits / 12);
      assert.equal(detection.bg, detection.counts.backgroundHits / 12);
    }
  }
});

test('selected cell is reported first and every cell reports progress', () => {
  const progress = [];
  runSimulation(reference, { seed: 9, chanceReps: 2, detectionReps: 2,
    priority: { rule: 'E50', type: 'SCU', effect: 7 } }, item => progress.push(item));
  assert.equal(progress.length, 54);
  assert.equal(progress[0].rule, 'E50');
  assert.equal(progress[0].type, 'SCU');
  assert.equal(progress.at(-1).completed, 54);
});
