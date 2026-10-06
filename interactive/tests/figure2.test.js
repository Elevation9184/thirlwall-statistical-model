import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SWEEP } from '../reference/figure2-data.js';
import { PAPER_DEFAULT } from '../presets.js';
import { calculate, calculatePoint, prevalenceToSlider, sliderToPrevalence } from '../model.js';
import { makeBundle } from '../build.mjs';

const outputPath = fileURLToPath(new URL('../../example_output.txt', import.meta.url));
const output = readFileSync(outputPath, 'utf8');
const block9 = output.split('=== 9.')[1]?.split('Total elapsed')[0];
assert.ok(block9, 'Python output block 9 must be present');

const pattern = /^\s*1 in\s+(\d+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*(\d+):1\s+(\d+)\s*\|\s*(\d+):1\s+(\d+)/gm;
const referenceRows = [...block9.matchAll(pattern)].map(match => ({
  interval: Number(match[1]), alarmsPerYear: Number(match[2]),
  detection: { NICU: Number(match[3]), LNU: Number(match[4]), SCU: Number(match[5]) },
  backgroundLnu: Number(match[6]), ratioAtPoint1: Number(match[7]), yearsAtPoint1: Number(match[8]),
  ratioAt1: Number(match[9]), yearsAt1: Number(match[10])
}));

function close(actual, expected, relative = .005) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1, expected * relative), `${actual} differs from ${expected}`);
}

test('all 11 browser sweep rows match the published Python output', () => {
  assert.equal(referenceRows.length, 11);
  assert.deepEqual(SWEEP, referenceRows);
});

test('paper E10 and E50 points reproduce both reference base-rate columns', () => {
  for (const index of [1, 3]) {
    const row = referenceRows[index];
    for (const [rate, ratio, years] of [[.1, row.ratioAtPoint1, row.yearsAtPoint1], [1, row.ratioAt1, row.yearsAt1]]) {
      const point = calculatePoint(row, rate, 'LNU');
      close(point.falsePerTrue, ratio);
      close(point.yearsPerDetection, years);
      close(point.falseCrossingsPerYear, row.alarmsPerYear, .04); // published alarms are rounded to 2 decimals
      assert.equal(point.detectionProbability, row.detection.LNU);
    }
  }
});

test('prevalence changes the false:true ratio but not detection sensitivity', () => {
  const low = calculate({ ...PAPER_DEFAULT, prevalencePer10k: .1 }).selected;
  const high = calculate({ ...PAPER_DEFAULT, prevalencePer10k: 1 }).selected;
  assert.equal(low.detectionProbability, high.detectionProbability);
  close(low.falsePerTrue / high.falsePerTrue, 10, .000001);
  close(low.yearsPerDetection / high.yearsPerDetection, 10, .000001);
});

test('changing the displayed unit changes only the horizontal detection coordinate', () => {
  const local = calculate({ ...PAPER_DEFAULT, unitType: 'LNU' }).selected;
  const intensive = calculate({ ...PAPER_DEFAULT, unitType: 'NICU' }).selected;
  assert.notEqual(local.detectionProbability, intensive.detectionProbability);
  assert.equal(local.falsePerTrue, intensive.falsePerTrue);
});

test('log slider round trips the two paper base-rate presets', () => {
  for (const value of [.1, 1, 30]) {
    const recovered = sliderToPrevalence(prevalenceToSlider(value));
    assert.ok(Math.abs(Math.log10(recovered / value)) < .013);
  }
});

test('the delivered file-open browser script matches the tested source modules', async () => {
  const delivered = readFileSync(fileURLToPath(new URL('../app.js', import.meta.url)), 'utf8');
  assert.equal(delivered, await makeBundle());
});
