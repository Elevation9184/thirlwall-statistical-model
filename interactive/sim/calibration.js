import { createRng } from './random.js';
import { gamma, poisson } from './distributions.js';

export const CALIBRATION_PATHS = 50000;
export const CALIBRATION_MONTHS = 120;
export const CUSUM_TARGETS = Object.freeze({ E10: .10, E50: .02 });
const CALIBRATION_LN2 = Math.log(2);
const thresholdCache = new Map();

export function calibrationKey(seed, type, mean, cv, target) {
  return JSON.stringify([seed, type, mean, cv, target]);
}

function pathSeed(seed, type, mean, cv, stream) {
  let hash = 2166136261;
  for (const character of JSON.stringify([seed, type, mean, cv, stream])) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// One gamma rate per year and twelve Poisson months from that rate. The
// path-major Float32Array holds only the increments used by every bisection.
export function makeNullIncrements(mean, cv, seed, type, paths = CALIBRATION_PATHS,
  months = CALIBRATION_MONTHS, stream = 'calibration') {
  if (months % 12 || !(paths > 0) || !(mean > 0) || !(cv > 0)) throw new RangeError('Invalid CUSUM path inputs');
  const rng = createRng(pathSeed(seed, type, mean, cv, stream));
  const increments = new Float32Array(paths * months);
  const yearlyMeans = new Float64Array(months / 12);
  const shape = 1 / (cv * cv);
  for (let unit = 0; unit < paths; unit++) {
    for (let year = 0; year < yearlyMeans.length; year++)
      yearlyMeans[year] = mean * gamma(rng, shape, 1 / shape) / 12;
    const offset = unit * months;
    for (let month = 0; month < months; month++) {
      const monthlyMean = yearlyMeans[Math.floor(month / 12)];
      increments[offset + month] = poisson(rng, monthlyMean) * CALIBRATION_LN2 - monthlyMean;
    }
  }
  return increments;
}

export function crossingTotal(increments, threshold, months = CALIBRATION_MONTHS) {
  if (increments.length % months || !(threshold > 0)) throw new RangeError('Invalid CUSUM crossing inputs');
  let total = 0;
  for (let offset = 0; offset < increments.length; offset += months) {
    let statistic = 0;
    for (let month = 0; month < months; month++) {
      statistic += increments[offset + month];
      if (statistic < 0) statistic = 0;
      if (statistic >= threshold) { total++; statistic = 0; }
    }
  }
  return total;
}

export function crossingRate(increments, threshold, months = CALIBRATION_MONTHS) {
  return crossingTotal(increments, threshold, months) / (increments.length / 12);
}

export function bisectThreshold(increments, target, months = CALIBRATION_MONTHS) {
  let lower = Math.log(.05), upper = Math.log(60);
  for (let iteration = 0; iteration < 30; iteration++) {
    const midpoint = (lower + upper) / 2;
    if (crossingRate(increments, Math.exp(midpoint), months) > target) lower = midpoint;
    else upper = midpoint;
  }
  return Math.exp(upper);
}

export function calibrateUnit(seed, type, mean, cv = .25, options = {}) {
  const paths = options.paths ?? CALIBRATION_PATHS;
  const months = options.months ?? CALIBRATION_MONTHS;
  const stream = options.stream ?? 'calibration';
  const cached = options.cachedThresholds || {};
  const keys = Object.fromEntries(Object.entries(CUSUM_TARGETS).map(([rule, target]) =>
    [rule, calibrationKey(seed, type, mean, cv, target)]));
  const reusable = paths === CALIBRATION_PATHS && months === CALIBRATION_MONTHS && stream === 'calibration';
  const thresholds = {};
  const missing = [];
  for (const rule of Object.keys(CUSUM_TARGETS)) {
    const value = reusable ? thresholdCache.get(keys[rule]) ?? cached[keys[rule]] : undefined;
    if (value > 0) thresholds[rule] = value;
    else missing.push(rule);
  }
  const started = performance.now();
  if (missing.length) {
    const increments = makeNullIncrements(mean, cv, seed, type, paths, months, stream);
    for (const rule of missing) {
      thresholds[rule] = bisectThreshold(increments, CUSUM_TARGETS[rule], months);
      if (reusable) thresholdCache.set(keys[rule], thresholds[rule]);
    }
  }
  return { type, mean, cv, seed, thresholds, keys, elapsedMs: performance.now() - started,
    cached: missing.length === 0, paths, months };
}
