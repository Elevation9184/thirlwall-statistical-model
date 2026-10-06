import { TYPES } from '../derive.js';

const CHANCE_ROTA = ['s_avg', 's_own', 's_adj', 'flag_ep', 'flag_distinct', 'med_top'];
const CHANCE_SIGNIFICANCE = ['s_avg', 's_own', 's_adj', 'flag_ep', 'flag_distinct'];
const CHANCE_ALL = ['alpha', 'ep', 'rev', ...CHANCE_ROTA, 'med_k'];
const DET_ROTA = ['flag_off', 'flag_any', 'flag_off_adj', 'flag_any_adj'];
const DET_ALL = ['d', 'bg', ...DET_ROTA];
const RULES_ALARM_LINE = new Set(['A', 'B', 'C']);

export function normalCDF(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + .3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-z * z);
  return (1 + Math.sign(x) * erf) / 2;
}

export function alarmQuantiles(sd) {
  const quantile = value => value === 2 ? .977 : value === 3 ? .9987 : normalCDF(value);
  return { A: quantile(sd), B: quantile(sd + 1), C: quantile(sd) };
}

export function isPaperMode(state, reference) {
  return state.alarmSD === 2 && state.significance === .05 && [4, 7].includes(state.expectedExtraDeaths)
    && TYPES.every(type => state.deathsPerYear[type] === reference.inputs.types[type].mean
      && state.staffPerRoster[type] === reference.inputs.types[type].staff);
}

export function ruleEUnavailable(state, reference, type) {
  return state.deathsPerYear[type] !== reference.inputs.types[type].mean;
}

export function simulationPlan(state, reference) {
  const paperMode = isPaperMode(state, reference);
  const chanceFields = {}, detectionFields = {}, jobs = [];
  if (paperMode) return { paperMode, chanceFields, detectionFields, jobs };
  const alarmChanged = state.alarmSD !== 2;
  const sigChanged = state.significance !== .05;
  const effectChanged = ![4, 7].includes(state.expectedExtraDeaths);
  for (const rule of reference.inputs.rules) for (const type of TYPES) {
    const meanChanged = ruleEUnavailable(state, reference, type);
    const rosterChanged = state.staffPerRoster[type] !== reference.inputs.types[type].staff;
    const lineChanged = alarmChanged && RULES_ALARM_LINE.has(rule);
    const unavailable = rule.startsWith('E') && meanChanged;
    const chance = unavailable ? CHANCE_ALL : meanChanged || lineChanged ? CHANCE_ALL
      : rosterChanged ? CHANCE_ROTA : sigChanged ? CHANCE_SIGNIFICANCE : [];
    const detection = unavailable ? DET_ALL : meanChanged || lineChanged ? DET_ALL
      : effectChanged ? ['d', ...DET_ROTA] : rosterChanged || sigChanged ? DET_ROTA
        : state.rotaTest === 'adj' ? ['flag_off_adj', 'flag_any_adj'] : [];
    if (chance.length) chanceFields[`${rule}|${type}`] = { fields: chance, unavailable };
    if (detection.length) detectionFields[`${state.expectedExtraDeaths}|${rule}|${type}`] = { fields: detection, unavailable };
    if (!unavailable && chance.length) jobs.push({ kind: 'chance', rule, type });
    if (!unavailable && detection.length) jobs.push({ kind: 'detection', effect: state.expectedExtraDeaths, rule, type });
  }
  jobs.sort((a, b) => {
    const score = job => (job.rule === state.rule ? 4 : 0) + (job.type === state.unitType ? 2 : 0)
      + (job.kind === (state.activeTab === 3 || state.activeTab === 4 || state.activeTab === 5 ? 'detection' : 'chance') ? 1 : 0);
    return score(b) - score(a);
  });
  return { paperMode, chanceFields, detectionFields, jobs };
}

export function simulationOptions(state, reference, plan) {
  return {
    seed: state.seed,
    unitTypes: Object.fromEntries(TYPES.map(type => [type, { ...reference.inputs.types[type], mean: state.deathsPerYear[type], staff: state.staffPerRoster[type] }])),
    significance: state.significance,
    quantiles: alarmQuantiles(state.alarmSD),
    jobs: plan.jobs,
    chanceReps: reference.inputs.reps,
    detectionReps: reference.inputs.det_reps
  };
}

export function effectiveReference(state, reference, plan, results = { chance: {}, detection: {} }, previous = null) {
  const chance = {}, detection = {};
  const effect = String(state.expectedExtraDeaths);
  for (const rule of reference.inputs.rules) {
    chance[rule] = {};
    for (const type of TYPES) {
      const base = reference.chance[rule][type];
      const spec = plan.chanceFields[`${rule}|${type}`];
      const sim = results.chance?.[rule]?.[type];
      const stale = previous?.chance?.[rule]?.[type];
      const cell = { ...base, _source: {}, _pending: Boolean(spec && !spec.unavailable && !sim) };
      for (const key of CHANCE_ALL) {
        cell._source[key] = spec?.unavailable ? 'unavailable' : spec?.fields.includes(key) ? sim ? 'simulated' : 'pending' : 'paper';
        if (spec?.unavailable) cell[key] = null;
        else if (sim && spec?.fields.includes(key)) cell[key] = sim[key];
        else if (stale && spec?.fields.includes(key)) cell[key] = stale[key];
      }
      if (sim) cell.counts = sim.counts;
      chance[rule][type] = cell;
    }
  }
  detection[effect] = {};
  for (const rule of reference.inputs.rules) {
    detection[effect][rule] = {};
    for (const type of TYPES) {
      const base = reference.detection[effect]?.[rule]?.[type] || reference.detection['4'][rule][type];
      const spec = plan.detectionFields[`${effect}|${rule}|${type}`];
      const sim = results.detection?.[effect]?.[rule]?.[type];
      const stale = previous?.detection?.[effect]?.[rule]?.[type];
      const cell = { ...base, _source: {}, _pending: Boolean(spec && !spec.unavailable && !sim) };
      for (const key of DET_ALL) {
        cell._source[key] = spec?.unavailable ? 'unavailable' : spec?.fields.includes(key) ? sim ? 'simulated' : 'pending' : 'paper';
        if (spec?.unavailable) cell[key] = null;
        else if (sim && spec?.fields.includes(key)) cell[key] = sim[key];
        else if (stale && spec?.fields.includes(key)) cell[key] = stale[key];
      }
      if (sim) cell.counts = sim.counts;
      detection[effect][rule][type] = cell;
    }
  }
  return { ...reference,
    inputs: { ...reference.inputs,
      types: Object.fromEntries(TYPES.map(type => [type, { ...reference.inputs.types[type], staff: state.staffPerRoster[type], mean: state.deathsPerYear[type] }])) },
    chance, detection };
}
