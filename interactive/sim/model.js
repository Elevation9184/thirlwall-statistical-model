import { createRng } from './random.js';
import { gamma, poisson, binomial, poissonQuantile, binomialTail, binomialCDF } from './distributions.js';

const LN2 = Math.log(2);
const cutoffCache = new Map();

function poissonCutoff(q, baseline) {
  const key = `${q}|${baseline}`;
  if (!cutoffCache.has(key)) cutoffCache.set(key, poissonQuantile(q, baseline));
  return cutoffCache.get(key);
}

function drawRoster(rng, staff, exposure, mix, offender = false, offenderShare = .21) {
  const roster = new Float64Array(staff);
  const ordinary = staff - Number(offender);
  for (let nurse = 0; nurse < ordinary; nurse++) {
    const u = rng.uniform();
    let category = 0, cumulative = mix[0];
    while (u >= cumulative && category < exposure.length - 1) cumulative += mix[++category];
    roster[nurse] = exposure[category];
  }
  if (offender) roster[staff - 1] = offenderShare;
  return roster;
}

export function simulateUnit(rng, mean, cv, preMonths, monitorMonths, extra = 0) {
  const total = preMonths + monitorMonths;
  const yearCount = Math.ceil(total / 12);
  const shape = 1 / (cv * cv);
  const monthlyMeans = new Float64Array(yearCount);
  for (let year = 0; year < yearCount; year++) monthlyMeans[year] = mean * gamma(rng, shape, 1 / shape) / 12;
  const bg = new Uint16Array(total);
  for (let month = 0; month < total; month++) bg[month] = poisson(rng, monthlyMeans[Math.floor(month / 12)]);
  const off = extra ? new Uint16Array(total) : null;
  if (off) for (let month = preMonths; month < preMonths + 12; month++) off[month] = poisson(rng, extra / 12);
  return { bg, off, monthlyMeans };
}

export function alarmChecks(path, rule, type, monitorMonths, inputs, cusumH, quantiles = { A: .977, B: .9987, C: .977 }) {
  const pre = inputs.pre_months;
  const annual = rule === 'A' || rule === 'B';
  const length = annual ? Math.floor(monitorMonths / 12) : monitorMonths;
  const month = new Int16Array(length), alarm = new Uint8Array(length);
  const start = new Int16Array(length), end = new Int16Array(length);
  if (rule === 'A' || rule === 'B' || rule === 'C' || rule === 'D') {
    const cumulative = new Int32Array(pre + monitorMonths + 1);
    for (let t = 0; t < pre + monitorMonths; t++) cumulative[t + 1] = cumulative[t] + path.bg[t] + (path.off ? path.off[t] : 0);
    for (let index = 0; index < length; index++) {
      const t1 = annual ? pre + 12 * (index + 1) : pre + index + 1;
      const count = cumulative[t1] - cumulative[t1 - 12];
      const baseline = Math.max((cumulative[t1 - 12] - cumulative[t1 - 48]) / 3, .5);
      month[index] = annual ? 12 * index + 11 : index;
      start[index] = t1 - 12;
      end[index] = t1;
      alarm[index] = rule === 'D'
        ? Number(count >= 2 * baseline && count >= 4)
        : Number(count > poissonCutoff(quantiles[rule], baseline));
    }
  } else {
    const h = cusumH[`${rule}|${type}`];
    if (!(h > 0)) throw new RangeError(`Missing CUSUM threshold for ${rule}|${type}`);
    let statistic = 0, windowStart = pre;
    for (let index = 0; index < length; index++) {
      const t = pre + index;
      statistic = Math.max(0, statistic + path.bg[t] * LN2 + (path.off ? path.off[t] * LN2 : 0) - path.monthlyMeans[Math.floor(t / 12)]);
      if (statistic === 0) windowStart = t + 1;
      const hit = statistic >= h;
      month[index] = index;
      alarm[index] = Number(hit);
      start[index] = hit ? windowStart : -1;
      end[index] = t + 1;
      if (hit) { statistic = 0; windowStart = t + 1; }
    }
  }
  return { month, alarm, start, end };
}

export function alarmEpisodes(checks) {
  const result = [];
  let previous = false;
  for (let index = 0; index < checks.alarm.length; index++) {
    const hit = checks.alarm[index] === 1;
    if (hit && !previous) result.push([checks.month[index], checks.start[index], checks.end[index]]);
    previous = hit;
  }
  return result;
}

export function reviewRota(rng, roster, deaths, significance = .05) {
  const attendance = new Uint16Array(roster.length);
  let firstTop = 0, top = -1, shareSum = 0;
  for (let nurse = 0; nurse < roster.length; nurse++) {
    shareSum += roster[nurse];
    attendance[nurse] = binomial(rng, deaths, roster[nurse]);
    if (attendance[nurse] > top) { top = attendance[nurse]; firstTop = nurse; }
  }
  const averageTail = binomialTail(top, deaths, shareSum / roster.length);
  const ownTail = binomialTail(top, deaths, roster[firstTop]);
  let allBelow = 1;
  for (let nurse = 0; nurse < roster.length; nurse++) allBelow *= binomialCDF(top - 1, deaths, roster[nurse]);
  const adjustedTail = 1 - allBelow;
  return { nurse: firstTop, top, averagePass: averageTail < significance,
    ownPass: ownTail < significance, adjustedPass: adjustedTail < significance };
}

function median(values) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function chanceCell(rng, rule, type, reference, reps, settings) {
  const inputs = settings.inputs;
  const unit = settings.unitTypes[type];
  const years = inputs.monitor_months / 12;
  let alarmingUnitYears = 0, episodeCount = 0, reviewedAlarms = 0;
  let avgPasses = 0, ownPasses = 0, adjustedPasses = 0, distinctNurses = 0;
  const reviewedDeaths = [], topAttendance = [];
  for (let unitIndex = 0; unitIndex < reps; unitIndex++) {
    const path = simulateUnit(rng, unit.mean, settings.cv, inputs.pre_months, inputs.monitor_months);
    const roster = drawRoster(rng, unit.staff, inputs.exposure, inputs.exposure_mix);
    const checks = alarmChecks(path, rule, type, inputs.monitor_months, inputs, reference.cusum_h, settings.quantiles);
    let lastAlarmingYear = -1;
    for (let index = 0; index < checks.alarm.length; index++) {
      if (!checks.alarm[index]) continue;
      const year = Math.floor(checks.month[index] / 12);
      if (year !== lastAlarmingYear) { alarmingUnitYears++; lastAlarmingYear = year; }
    }
    const flagged = new Uint8Array(unit.staff);
    for (const [, start, end] of alarmEpisodes(checks)) {
      episodeCount++;
      let deaths = 0;
      for (let month = start; month < end; month++) deaths += path.bg[month];
      if (deaths < 2) continue;
      const review = reviewRota(rng, roster, deaths, settings.significance);
      reviewedAlarms++;
      avgPasses += Number(review.averagePass);
      ownPasses += Number(review.ownPass);
      adjustedPasses += Number(review.adjustedPass);
      reviewedDeaths.push(deaths);
      topAttendance.push(review.top);
      if (review.ownPass) flagged[review.nurse] = 1;
    }
    for (const selected of flagged) distinctNurses += selected;
  }
  const unitYears = reps * years;
  return {
    alpha: alarmingUnitYears / unitYears, ep: episodeCount / unitYears, rev: reviewedAlarms / unitYears,
    s_avg: avgPasses / Math.max(reviewedAlarms, 1), s_own: ownPasses / Math.max(reviewedAlarms, 1),
    s_adj: adjustedPasses / Math.max(reviewedAlarms, 1), flag_ep: ownPasses / unitYears,
    flag_distinct: distinctNurses / unitYears, med_k: median(reviewedDeaths), med_top: median(topAttendance),
    counts: { units: reps, unitYears, alarmingUnitYears, episodes: episodeCount, reviewedAlarms,
      avgPasses, ownPasses, adjustedPasses, distinctNurses, reviewedDeaths, topAttendance }
  };
}

function detectionCell(rng, effect, rule, type, reference, reps, settings) {
  const inputs = settings.inputs;
  const unit = settings.unitTypes[type];
  let hits = 0, backgroundHits = 0, reviewedHits = 0, offenderIdentifications = 0, anyNurseFlags = 0;
  let offenderIdentificationsAdjusted = 0, anyNurseFlagsAdjusted = 0;
  for (let unitIndex = 0; unitIndex < reps; unitIndex++) {
    const path = simulateUnit(rng, unit.mean, settings.cv, inputs.pre_months, inputs.monitor_months, effect);
    const roster = drawRoster(rng, unit.staff, inputs.exposure, inputs.exposure_mix, true, inputs.offender_f);
    const checks = alarmChecks(path, rule, type, 12, inputs, reference.cusum_h, settings.quantiles);
    let first = -1;
    for (let index = 0; index < checks.alarm.length; index++) if (checks.alarm[index]) { first = index; break; }
    if (first >= 0 && checks.month[first] < 12) {
      hits++;
      let backgroundDeaths = 0, offenderDeaths = 0;
      for (let month = checks.start[first]; month < checks.end[first]; month++) {
        backgroundDeaths += path.bg[month];
        offenderDeaths += path.off[month];
      }
      const deaths = backgroundDeaths + offenderDeaths;
      if (deaths >= 2) {
        reviewedHits++;
        const attendance = new Uint16Array(unit.staff);
        for (let nurse = 0; nurse < unit.staff; nurse++) attendance[nurse] = binomial(rng, backgroundDeaths, roster[nurse]);
        for (let nurse = 0; nurse < unit.staff; nurse++) attendance[nurse] += binomial(rng, offenderDeaths, roster[nurse]);
        attendance[unit.staff - 1] = binomial(rng, backgroundDeaths, inputs.offender_f) + offenderDeaths;
        let top = 0;
        for (const count of attendance) if (count > top) top = count;
        let tied = 0, passing = 0, offenderPasses = 0;
        for (let nurse = 0; nurse < unit.staff; nurse++) {
          if (attendance[nurse] !== top) continue;
          tied++;
          const passes = binomialTail(top, deaths, roster[nurse]) < settings.significance;
          passing += Number(passes);
          if (nurse === unit.staff - 1 && passes) offenderPasses++;
        }
        anyNurseFlags += passing / tied;
        offenderIdentifications += offenderPasses / tied;
        let allBelow = 1;
        for (let nurse = 0; nurse < unit.staff; nurse++) allBelow *= binomialCDF(top - 1, deaths, roster[nurse]);
        if (1 - allBelow < settings.significance) {
          anyNurseFlagsAdjusted++;
          if (attendance[unit.staff - 1] === top) offenderIdentificationsAdjusted += 1 / tied;
        }
      }
    }
  }
  for (let unitIndex = 0; unitIndex < reps; unitIndex++) {
    const path = simulateUnit(rng, unit.mean, settings.cv, inputs.pre_months, inputs.monitor_months);
    const checks = alarmChecks(path, rule, type, 12, inputs, reference.cusum_h, settings.quantiles);
    backgroundHits += Number(checks.alarm.includes(1));
  }
  return { d: hits / reps, bg: backgroundHits / reps,
    flag_off: offenderIdentifications / Math.max(hits, 1), flag_any: anyNurseFlags / Math.max(hits, 1),
    flag_off_adj: offenderIdentificationsAdjusted / Math.max(hits, 1),
    flag_any_adj: anyNurseFlagsAdjusted / Math.max(hits, 1),
    counts: { units: reps, hits, backgroundUnits: reps, backgroundHits, reviewedHits,
      offenderIdentifications, anyNurseFlags, offenderIdentificationsAdjusted, anyNurseFlagsAdjusted } };
}

export function runSimulation(reference, options = {}, onProgress = () => {}) {
  const inputs = reference.inputs;
  const settings = {
    inputs, unitTypes: options.unitTypes || inputs.types, cv: options.cv ?? inputs.cv,
    significance: options.significance ?? .05,
    quantiles: options.quantiles || { A: .977, B: .9987, C: .977 }
  };
  const seed = options.seed ?? reference.seed;
  const rng = createRng(seed);
  const chanceReps = options.chanceReps ?? inputs.reps;
  const detectionReps = options.detectionReps ?? inputs.det_reps;
  const rules = options.rules || inputs.rules;
  const types = options.types || Object.keys(inputs.types);
  const effects = options.effects || [4, 7];
  const jobs = options.jobs || [
    ...rules.flatMap(rule => types.map(type => ({ kind: 'chance', rule, type }))),
    ...effects.flatMap(effect => rules.flatMap(rule => types.map(type => ({ kind: 'detection', effect, rule, type }))))
  ];
  if (options.priority) {
    const { rule, type, effect } = options.priority;
    jobs.sort((a, b) => Number(b.rule === rule && b.type === type && (b.kind === 'chance' || b.effect === effect))
      - Number(a.rule === rule && a.type === type && (a.kind === 'chance' || a.effect === effect)));
  }
  const chance = {}, detection = {};
  let completed = 0;
  for (const job of jobs) {
    let value;
    if (job.kind === 'chance') {
      value = chanceCell(rng, job.rule, job.type, reference, chanceReps, settings);
      (chance[job.rule] ||= {})[job.type] = value;
    } else {
      value = detectionCell(rng, job.effect, job.rule, job.type, reference, detectionReps, settings);
      ((detection[job.effect] ||= {})[job.rule] ||= {})[job.type] = value;
    }
    onProgress({ ...job, completed: ++completed, total: jobs.length, value });
  }
  return { chance, detection, metadata: { seed, chanceReps, detectionReps, rules, types, effects } };
}
