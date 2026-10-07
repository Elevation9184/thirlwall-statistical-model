import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { calibrationKey, calibrateUnit, crossingRate, crossingTotal, makeNullIncrements } from '../sim/calibration.js';

test('CUSUM crossing counts every hit and resets after each crossing', () => {
  const increments = Float32Array.from([1, 1, 1, 1, 2, 2, 0, 0]);
  assert.equal(crossingTotal(increments, 1.5, 4), 4);
  assert.equal(crossingRate(increments, 1.5, 4), 6);
});

test('calibration paths are deterministic for a scenario and independent across streams', () => {
  const first = makeNullIncrements(4, .25, 123, 'LNU', 48, 120);
  const repeat = makeNullIncrements(4, .25, 123, 'LNU', 48, 120);
  const independent = makeNullIncrements(4, .25, 123, 'LNU', 48, 120, 'validation');
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, independent);
});

test('threshold cache includes type, mortality, CV, target and seed', () => {
  const seed = 321, type = 'SCU', mean = 2, cv = .25;
  const key10 = calibrationKey(seed, type, mean, cv, .1);
  const key50 = calibrationKey(seed, type, mean, cv, .02);
  assert.notEqual(key10, key50);
  assert.notEqual(key10, calibrationKey(seed + 1, type, mean, cv, .1));
  assert.notEqual(key10, calibrationKey(seed, type, mean + 1, cv, .1));
  const result = calibrateUnit(seed, type, mean, cv,
    { cachedThresholds: { [key10]: 1.5, [key50]: 2.5 } });
  assert.equal(result.cached, true);
  assert.deepEqual(result.thresholds, { E10: 1.5, E50: 2.5 });
});

test('the committed validation retains the exact Stage 3a 288-cell section', () => {
  const report = readFileSync(new URL('../sim/validation-report.md', import.meta.url), 'utf8');
  const cellSection = report.slice(report.indexOf('## Chance and rota cells'), report.indexOf('## Medians'));
  assert.equal(createHash('sha256').update(cellSection).digest('hex'),
    '743c73b399d1094bcff64abf8f3bfcb6ba70916399b308a1ec026a3ed496e164');
  assert.match(report, /Stage 3c calibration gate: \*\*PASS\*\*/);
});
