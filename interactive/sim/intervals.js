import { createRng } from './random.js';
import { TYPES, chanceForRule, falseTrue, posteriorParts } from '../derive.js';

const Z95 = 1.959963984540054;
const clamp = value => Math.min(1, Math.max(0, value));
const finite = value => Number.isFinite(value);

export function directInterval(cell, key) {
  if (!cell || cell._source?.[key] !== 'simulated' || !cell.counts) return null;
  const counts = cell.counts;
  if (key === 'med_k' || key === 'med_top') {
    const sorted = [...(key === 'med_k' ? counts.reviewedDeaths : counts.topAttendance) || []].sort((a, b) => a - b);
    if (!sorted.length) return null;
    const spread = .98 * Math.sqrt(sorted.length);
    return [sorted[Math.max(0, Math.floor(sorted.length / 2 - spread))],
      sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length / 2 + spread))]];
  }
  const rateKeys = new Set(['ep', 'rev', 'flag_ep', 'flag_distinct']);
  let n;
  if (key === 'alpha') n = counts.unitYears;
  else if (rateKeys.has(key)) n = counts.unitYears;
  else if (key.startsWith('s_')) n = counts.reviewedAlarms;
  else if (key === 'd' || key === 'bg') n = counts.units;
  else if (key.startsWith('flag_')) n = counts.hits;
  else return null;
  if (!n) return null;
  const value = cell[key];
  if (!rateKeys.has(key)) {
    // Wilson's binomial interval also gives a meaningful bound at 0 or 100%.
    const denominator = 1 + Z95 ** 2 / n;
    const center = (value + Z95 ** 2 / (2 * n)) / denominator;
    const half = Z95 * Math.sqrt(Math.max(0, value * (1 - value)) / n + Z95 ** 2 / (4 * n * n)) / denominator;
    return [value === 0 ? 0 : Math.max(0, center - half), value === 1 ? 1 : Math.min(1, center + half)];
  }
  if (value === 0) return [0, -Math.log(.05) / n];
  const sd = Math.sqrt(value / n);
  return [Math.max(0, value - Z95 * sd), value + Z95 * sd];
}

function sampleCell(cell, rng, chance) {
  const result = { ...cell };
  if (!cell.counts) return result;
  for (const [key, source] of Object.entries(cell._source || {})) {
    if (source !== 'simulated' || !finite(cell[key]) || key.startsWith('med_')) continue;
    let n;
    const rate = chance && ['ep', 'rev', 'flag_ep', 'flag_distinct'].includes(key);
    if (chance) n = key.startsWith('s_') ? cell.counts.reviewedAlarms : cell.counts.unitYears;
    else n = key.startsWith('flag_') ? cell.counts.hits : cell.counts.units;
    if (!n) continue;
    // Half-count variance avoids false certainty for an observed zero or one.
    const variancePoint = cell[key] === 0 || (!rate && cell[key] === 1)
      ? (n * cell[key] + .5) / (n + 1) : cell[key];
    const sd = rate ? Math.sqrt(variancePoint / n) : Math.sqrt(Math.max(0, variancePoint * (1 - variancePoint)) / n);
    result[key] = rate ? Math.max(0, cell[key] + sd * rng.normal()) : clamp(cell[key] + sd * rng.normal());
  }
  return result;
}

function percentile(values, point) {
  if (!finite(point) || !values.length) return null;
  values.sort((a, b) => a - b);
  const quantile = p => {
    const at = (values.length - 1) * p, lower = Math.floor(at);
    return values[lower] + (values[Math.min(values.length - 1, lower + 1)] - values[lower]) * (at - lower);
  };
  return [Math.min(point, quantile(.025)), Math.max(point, quantile(.975))];
}

export function derivedIntervals(state, reference, derived, adjustedPosterior, draws = 500) {
  const rng = createRng((state.seed ^ 0x4c957f2d) >>> 0);
  const observed = {};
  const effects = String(state.expectedExtraDeaths);
  const add = (key, value) => { if (finite(value)) (observed[key] ||= []).push(value); };
  for (let draw = 0; draw < draws; draw++) {
    const chance = {}, detection = { [effects]: {} };
    for (const rule of reference.inputs.rules) {
      chance[rule] = {};
      detection[effects][rule] = {};
      for (const type of TYPES) {
        chance[rule][type] = sampleCell(reference.chance[rule][type], rng, true);
        detection[effects][rule][type] = sampleCell(reference.detection[effects][rule][type], rng, false);
      }
    }
    const sampled = { ...reference, chance, detection };
    for (const rule of reference.inputs.rules) {
      const rates = chanceForRule(rule, state.unitCounts, sampled);
      for (const key of ['alarmUnitYears', 'episodes', 'reviewed', 'distinctOwn']) add(`${key}|${rule}`, rates[key]);
      for (const key of ['avg', 'own', 'adj']) {
        add(`share|${rule}|${key}`, rates.shares[key]);
        add(`baseFlags|${rule}|${key}`, rates.flags[key]);
      }
      for (const rate of [...reference.inputs.base_rates, state.prevalencePer10k]) {
        const ratio = falseTrue(rule, rate, state.expectedExtraDeaths, state.riskAllocation, state.unitCounts, sampled);
        add(`ratio|${rule}|${rate}`, ratio.ratio);
        add(`years|${rule}|${rate}`, ratio.years);
      }
      const base = rates.flags[state.rotaTest];
      if (finite(base)) {
        for (const q of [...reference.inputs.q, state.q]) add(`flags|${rule}|${q}`, base * q);
        add(`offWards|${rule}`, base * state.q * state.investigationMonths / 12);
      }
      const posterior = posteriorParts(rule, state.prevalencePer10k, state.expectedExtraDeaths,
        state.riskAllocation, state.unitCounts, sampled, adjustedPosterior ? 'adj' : 'own').value;
      add(`posterior|${rule}`, posterior);
    }
  }
  const result = {};
  for (const [key, values] of Object.entries(observed)) {
    const [kind, rule, detail] = key.split('|');
    let point;
    if (kind === 'ratio' || kind === 'years') point = detail === String(state.prevalencePer10k)
      ? derived.ratio[rule].current[kind] : derived.ratio[rule].printedRates[detail]?.[kind];
    else if (kind === 'flags') point = derived.flags[rule].base * Number(detail);
    else if (kind === 'offWards') point = derived.flags[rule].offWards;
    else if (kind === 'posterior') point = derived.posteriors[rule];
    else if (kind === 'share') point = derived.chance[rule].shares[detail];
    else if (kind === 'baseFlags') point = derived.chance[rule].flags[detail];
    else point = derived.chance[rule][kind];
    const bounds = percentile(values, point);
    if (bounds && bounds[1] > bounds[0]) result[key] = bounds;
  }
  return result;
}
