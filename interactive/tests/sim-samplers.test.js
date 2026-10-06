import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/random.js';
import { gamma, poisson, binomial, poissonQuantile, binomialTail, binomialCDF } from '../sim/distributions.js';

function moments(draw, n = 100000) {
  let sum = 0, squares = 0;
  for (let i = 0; i < n; i++) { const value = draw(); sum += value; squares += value * value; }
  const mean = sum / n;
  return { mean, variance: squares / n - mean * mean };
}

test('seeded generator is reproducible and its uniform and normal moments are correct', () => {
  const a = createRng(20261002), b = createRng(20261002);
  assert.deepEqual(Array.from({ length: 20 }, () => a.nextUint()), Array.from({ length: 20 }, () => b.nextUint()));
  const uniform = moments(() => createUniform.uniform());
  assert.ok(Math.abs(uniform.mean - .5) < .004);
  assert.ok(Math.abs(uniform.variance - 1 / 12) < .004);
  const normal = moments(() => createNormal.normal());
  assert.ok(Math.abs(normal.mean) < .02);
  assert.ok(Math.abs(normal.variance - 1) < .03);
});

const createUniform = createRng(17);
const createNormal = createRng(18);

test('Marsaglia–Tsang gamma sampler has the known mean and variance', () => {
  const rng = createRng(19);
  const draw = moments(() => gamma(rng, 16, 1 / 16));
  assert.ok(Math.abs(draw.mean - 1) < .006, JSON.stringify(draw));
  assert.ok(Math.abs(draw.variance - 1 / 16) < .003, JSON.stringify(draw));
});

test('Poisson inversion and large-mean PTRS match their means and variances', () => {
  for (const [mean, seed, meanTolerance, varianceTolerance] of [[2.5, 20, .04, .08], [40, 21, .2, .8]]) {
    const rng = createRng(seed);
    const draw = moments(() => poisson(rng, mean));
    assert.ok(Math.abs(draw.mean - mean) < meanTolerance, JSON.stringify(draw));
    assert.ok(Math.abs(draw.variance - mean) < varianceTolerance, JSON.stringify(draw));
  }
});

test('binomial inversion and mode-centred chop-down match their means and variances', () => {
  for (const [trials, p, seed, meanTolerance, varianceTolerance] of [[20, .21, 22, .05, .1], [200, .27, 23, .2, .8]]) {
    const rng = createRng(seed);
    const draw = moments(() => binomial(rng, trials, p));
    assert.ok(Math.abs(draw.mean - trials * p) < meanTolerance, JSON.stringify(draw));
    assert.ok(Math.abs(draw.variance - trials * p * (1 - p)) < varianceTolerance, JSON.stringify(draw));
  }
});

test('Poisson quantile and binomial tails use inclusive exact definitions', () => {
  assert.equal(poissonQuantile(.977, 4), 8);
  assert.ok(Math.abs(binomialTail(3, 5, .2) - .05792) < 1e-12);
  assert.ok(Math.abs(binomialCDF(2, 5, .2) - .94208) < 1e-12);
});
