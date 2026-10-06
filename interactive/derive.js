// Pure arithmetic on the Stage 2a Python export. No DOM, simulation, or random draws.
export const TYPES = Object.freeze(['NICU', 'LNU', 'SCU']);

export function riskWeights(counts, allocation, reference) {
  if (allocation === 'equal') return Object.fromEntries(TYPES.map(type => [type, 1]));
  const totalUnits = TYPES.reduce((sum, type) => sum + counts[type], 0);
  const totalStaff = TYPES.reduce((sum, type) => sum + counts[type] * reference.inputs.types[type].staff, 0);
  return Object.fromEntries(TYPES.map(type => [type, totalStaff ? reference.inputs.types[type].staff * totalUnits / totalStaff : 0]));
}

export function chanceForRule(rule, counts, reference) {
  const byType = reference.chance[rule];
  const sum = key => TYPES.reduce((total, type) => total + counts[type] * byType[type][key], 0);
  const reviewed = sum('rev');
  const weightedShare = key => reviewed ? TYPES.reduce((total, type) => total + counts[type] * byType[type].rev * byType[type][key], 0) / reviewed : null;
  return {
    byType,
    alarmUnitYears: sum('alpha'),
    episodes: sum('ep'),
    reviewed,
    shares: { avg: weightedShare('s_avg'), own: weightedShare('s_own'), adj: weightedShare('s_adj') },
    flags: {
      avg: TYPES.reduce((total, type) => total + counts[type] * byType[type].rev * byType[type].s_avg, 0),
      own: sum('flag_ep'),
      adj: TYPES.reduce((total, type) => total + counts[type] * byType[type].rev * byType[type].s_adj, 0)
    },
    distinctOwn: sum('flag_distinct')
  };
}

export function falseTrue(rule, baseRatePer10k, effect, allocation, counts, reference) {
  const p = baseRatePer10k / 10000;
  const weights = riskWeights(counts, allocation, reference);
  let falseFlagged = 0;
  let detected = 0;
  for (const type of TYPES) {
    const prevalence = p * weights[type];
    falseFlagged += counts[type] * (1 - prevalence) * reference.chance[rule][type].alpha;
    detected += counts[type] * prevalence * reference.detection[String(effect)][rule][type].d;
  }
  return { falseFlagged, detected, ratio: detected ? falseFlagged / detected : null,
    years: detected ? 1 / detected : null, weights };
}

export function posteriorParts(rule, baseRatePer10k, effect, allocation, counts, reference) {
  const p = baseRatePer10k / 10000;
  const weights = riskWeights(counts, allocation, reference);
  let offenderFlagged = 0;
  let anyFlaggedWithOffender = 0;
  let backgroundFlags = 0;
  for (const type of TYPES) {
    const prevalence = p * weights[type];
    const detection = reference.detection[String(effect)][rule][type];
    offenderFlagged += counts[type] * prevalence * detection.d * detection.flag_off;
    anyFlaggedWithOffender += counts[type] * prevalence * detection.d * detection.flag_any;
    backgroundFlags += counts[type] * (1 - prevalence) * reference.chance[rule][type].flag_ep;
  }
  const denominator = anyFlaggedWithOffender + backgroundFlags;
  return { offenderFlagged, anyFlaggedWithOffender, backgroundFlags, denominator,
    value: denominator ? offenderFlagged / denominator : null };
}

export function posterior(rule, baseRatePer10k, effect, allocation, counts, reference) {
  return posteriorParts(rule, baseRatePer10k, effect, allocation, counts, reference).value;
}

export function binomialTail(trials, from, probability) {
  let term = (1 - probability) ** trials;
  let tail = 0;
  for (let k = 0; k <= trials; k++) {
    if (k >= from) tail += term;
    if (k < trials) term *= (trials - k) / (k + 1) * probability / (1 - probability);
  }
  return tail;
}

export function mechanismProbability(rosterSize, deathsReviewed, reference, significance = .05) {
  // Each nurse independently draws a shift share from the paper's mixture.
  // The one-sided own-exposure test flags counts whose exact binomial tail is < 5%.
  const exposures = reference.inputs.exposure;
  const mix = reference.inputs.exposure_mix;
  let singleNurseFlag = 0;
  for (let i = 0; i < exposures.length; i++) {
    let chance = 0;
    for (let count = 0; count <= deathsReviewed; count++) {
      const tail = binomialTail(deathsReviewed, count, exposures[i]);
      if (tail < significance) { chance = tail; break; }
    }
    singleNurseFlag += mix[i] * chance;
  }
  return 1 - (1 - singleNurseFlag) ** rosterSize;
}

export function deriveAll(state, reference) {
  const rules = reference.inputs.rules;
  const counts = state.unitCounts;
  const chance = Object.fromEntries(rules.map(rule => [rule, chanceForRule(rule, counts, reference)]));
  const detection = Object.fromEntries(rules.map(rule => [rule, reference.detection[String(state.expectedExtraDeaths)][rule]]));
  const ratio = Object.fromEntries(rules.map(rule => [rule, {
    current: falseTrue(rule, state.prevalencePer10k, state.expectedExtraDeaths, state.riskAllocation, counts, reference),
    printedRates: Object.fromEntries(reference.inputs.base_rates.map(rate => [rate, falseTrue(rule, rate, state.expectedExtraDeaths, state.riskAllocation, counts, reference)]))
  }]));
  const posteriorDetails = Object.fromEntries(rules.map(rule => [rule, posteriorParts(rule, state.prevalencePer10k, state.expectedExtraDeaths, state.riskAllocation, counts, reference)]));
  const posteriors = Object.fromEntries(rules.map(rule => [rule, posteriorDetails[rule].value]));
  const flags = Object.fromEntries(rules.map(rule => [rule, {
    base: chance[rule].flags[state.rotaTest],
    current: chance[rule].flags[state.rotaTest] * state.q,
    offWards: chance[rule].flags[state.rotaTest] * state.q * state.investigationMonths / 12,
    byQ: Object.fromEntries(reference.inputs.q.map(q => [q, chance[rule].flags[state.rotaTest] * q]))
  }]));
  return { rules, counts, chance, detection, ratio, posteriors, posteriorDetails, flags,
    mechanism: { selected: mechanismProbability(state.mechanismRoster, state.mechanismDeaths, reference),
      curve: Array.from({ length: 21 }, (_, index) => ({ roster: index * 10, probability: mechanismProbability(index * 10, state.mechanismDeaths, reference) })) } };
}
