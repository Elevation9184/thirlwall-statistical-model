import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAPER_DEFAULT } from '../presets.js';
import { simulationPlan, simulationOptions, effectiveReference, isPaperMode, alarmQuantiles } from '../sim/scenario.js';
import { directInterval, derivedIntervals } from '../sim/intervals.js';
import { runSimulation } from '../sim/model.js';
import { deriveAll } from '../derive.js';
import { renderTab1 } from '../tabs/tab1.js';
import { renderTab2 } from '../tabs/tab2.js';
import { renderTab3 } from '../tabs/tab3.js';
import { renderTab4 } from '../tabs/tab4.js';
import { renderTab5 } from '../tabs/tab5.js';

const reference = JSON.parse(readFileSync(new URL('../reference/reference.json', import.meta.url)));
const obsoleteLabel = 'Needs recalibration (Stage 3c)';
const world = patch => ({ ...PAPER_DEFAULT, deathsPerYear: { ...PAPER_DEFAULT.deathsPerYear },
  staffPerRoster: { ...PAPER_DEFAULT.staffPerRoster }, ...patch });
const source = (state, result = {}) => effectiveReference(state, reference, simulationPlan(state, reference), result);
const job = (kind, rule, type, effect) => [{ kind, rule, type, ...(effect === undefined ? {} : { effect }) }];
const chance = (rule, type, options = {}) => runSimulation(reference, { seed: 55, chanceReps: 400,
  jobs: job('chance', rule, type), ...options }).chance[rule][type];
const detection = (rule, type, effect, options = {}) => runSimulation(reference, { seed: 55,
  detectionReps: 1000, jobs: job('detection', rule, type, effect), ...options }).detection[effect][rule][type];

test('paper-value round trip, including +7, restores the exact reference values', () => {
  for (const patch of [
    { deathsPerYear: { NICU: 20, LNU: 8, SCU: 1 } },
    { staffPerRoster: { NICU: 100, LNU: 80, SCU: 20 } },
    { alarmSD: 2.5 }, { significance: .01 }, { expectedExtraDeaths: 5 }
  ]) {
    assert.equal(isPaperMode(world(patch), reference), false);
    assert.equal(isPaperMode(world(), reference), true);
    assert.deepEqual(deriveAll(world(), reference), deriveAll(PAPER_DEFAULT, reference));
  }
  assert.equal(isPaperMode(world({ expectedExtraDeaths: 7 }), reference), true);
  assert.deepEqual(alarmQuantiles(2), { A: .977, B: .9987, C: .977 });
});

test('source masks re-simulate only dependent cells', () => {
  let result = source(world({ deathsPerYear: { NICU: 20, LNU: 8, SCU: 1 } }));
  assert.equal(result.chance.A.LNU._source.alpha, 'pending');
  assert.equal(result.detection[4].A.LNU._source.d, 'pending');
  assert.equal(result.chance.A.NICU._source.alpha, 'paper');
  assert.equal(result.chance.E10.LNU._source.alpha, 'pending');
  assert.equal(result.chance.E10.NICU._source.alpha, 'paper');
  result = source(world({ staffPerRoster: { NICU: 100, LNU: 80, SCU: 20 } }));
  assert.equal(result.chance.C.LNU._source.alpha, 'paper');
  assert.equal(result.chance.C.LNU._source.s_own, 'pending');
  assert.equal(result.chance.C.LNU._source.med_top, 'pending');
  assert.equal(result.detection[4].C.LNU._source.d, 'paper');
  assert.equal(result.detection[4].C.LNU._source.flag_off, 'pending');
  assert.notEqual(deriveAll(world({ staffPerRoster: { NICU: 100, LNU: 80, SCU: 20 } }), result).ratio.C.current.weights.LNU,
    deriveAll(PAPER_DEFAULT, reference).ratio.C.current.weights.LNU);
  result = source(world({ significance: .01 }));
  assert.equal(result.chance.C.LNU._source.alpha, 'paper');
  assert.equal(result.chance.C.LNU._source.med_top, 'paper');
  assert.equal(result.chance.C.LNU._source.s_own, 'pending');
  assert.equal(result.detection[4].C.LNU._source.bg, 'paper');
  result = source(world({ alarmSD: 2.5 }));
  for (const rule of ['A', 'B', 'C']) assert.equal(result.chance[rule].LNU._source.alpha, 'pending');
  for (const rule of ['D', 'E10', 'E50']) assert.equal(result.chance[rule].LNU._source.alpha, 'paper');
  result = source(world({ expectedExtraDeaths: 5 }));
  assert.equal(result.chance.C.LNU._source.alpha, 'paper');
  assert.equal(result.detection[5].C.LNU._source.d, 'pending');
  assert.equal(result.detection[5].C.LNU._source.bg, 'paper');
});

test('rule E is scheduled for recalibration exactly where deaths change', () => {
  for (const type of ['NICU', 'LNU', 'SCU']) {
    const deathsPerYear = { ...PAPER_DEFAULT.deathsPerYear, [type]: PAPER_DEFAULT.deathsPerYear[type] + 1 };
    const plan = simulationPlan(world({ deathsPerYear }), reference);
    for (const rule of ['E10', 'E50']) {
      assert.equal(plan.chanceFields[`${rule}|${type}`].fields.includes('alpha'), true);
      assert.equal(plan.jobs.some(item => item.rule === rule && item.type === type && item.kind === 'chance'), true);
      assert.equal(plan.jobs.some(item => item.rule === rule && item.type === type && item.kind === 'detection'), true);
      for (const other of ['NICU', 'LNU', 'SCU'].filter(item => item !== type))
        assert.equal(plan.chanceFields[`${rule}|${other}`], undefined);
    }
  }
});

test('recalibrated rule E cells propagate through every table and Figure 2 retains paper scope', () => {
  const state = world({ rule: 'E10', deathsPerYear: { NICU: 20, LNU: 8, SCU: 1 } });
  const result = { chance: { E10: { LNU: { ...reference.chance.E10.LNU, alpha: .2 } } },
    detection: {}, calibration: { LNU: { thresholds: { E10: 4.21, E50: 5.9 } } } };
  const effective = source(state, result);
  const live = deriveAll(state, effective);
  const paper = deriveAll(state, reference);
  const views = [renderTab1, renderTab2, renderTab3, renderTab4, renderTab5]
    .map(render => render(state, live, paper, reference, { simMode: true, reference: effective }));
  for (const [index, view] of views.entries())
    assert.ok(!view.table.includes(obsoleteLabel), `Table ${index + 1} has no unavailable cell`);
  assert.ok(!views[3].graph.includes(obsoleteLabel), 'Tab 4 chart has no unavailable label');
  assert.ok(views[0].working.includes('4.21 (recalibrated)'));
  assert.ok(views[3].extra.includes("Figure 2 shows the paper's settings; it is not recalculated in simulation mode."));
  for (const view of views) assert.ok(view.takeaway.startsWith('In the paper’s setting: '));
  const paperView = renderTab5({ ...PAPER_DEFAULT, rotaTest: 'adj' }, deriveAll({ ...PAPER_DEFAULT, rotaTest: 'adj' }, reference), paper, reference);
  assert.ok(paperView.table.includes('not computed'));
  assert.ok(!paperView.takeaway.startsWith('In the paper’s setting: '));
});

test('direction checks exceed Monte Carlo noise with reduced repetitions', () => {
  for (const rule of ['A', 'C']) assert.ok(
    chance(rule, 'LNU', { quantiles: alarmQuantiles(1.5) }).alpha
      > chance(rule, 'LNU', { quantiles: alarmQuantiles(3.5) }).alpha + .08);
  assert.ok(chance('C', 'NICU', { significance: .1 }).s_own
    > chance('C', 'NICU', { significance: .01 }).s_own + .4);
  const small = { ...reference.inputs.types, LNU: { ...reference.inputs.types.LNU, staff: 20 } };
  const large = { ...reference.inputs.types, LNU: { ...reference.inputs.types.LNU, staff: 150 } };
  assert.ok(chance('C', 'LNU', { unitTypes: large }).s_own
    > chance('C', 'LNU', { unitTypes: small }).s_own + .3);
  assert.ok(detection('C', 'LNU', 12).d > detection('C', 'LNU', 2).d + .4);
  const more = { ...reference.inputs.types, LNU: { ...reference.inputs.types.LNU, mean: 12 } };
  assert.ok(detection('C', 'LNU', 4).d > detection('C', 'LNU', 4, { unitTypes: more }).d + .08);
});

test('simulated cell intervals contain their point estimates and narrow with larger samples', () => {
  const original = chance('C', 'LNU');
  const cell = { ...original, _source: { alpha: 'simulated', s_own: 'simulated' } };
  const short = directInterval(cell, 'alpha');
  assert.ok(short[0] <= cell.alpha && cell.alpha <= short[1]);
  const enlarged = { ...cell, counts: { ...cell.counts, unitYears: cell.counts.unitYears * 10 } };
  const narrow = directInterval(enlarged, 'alpha');
  assert.ok(narrow[1] - narrow[0] < (short[1] - short[0]) / 3);
  const zero = directInterval({ ...cell, alpha: 0 }, 'alpha');
  assert.equal(zero[0], 0);
  assert.ok(zero[1] > 0, 'zero observed alarms do not imply zero uncertainty');
  const state = world({ significance: .1 });
  const result = { chance: { C: { LNU: original } }, detection: {} };
  const effective = effectiveReference(state, reference, simulationPlan(state, reference), result);
  const derived = deriveAll(state, effective);
  const intervals = derivedIntervals(state, effective, derived, false);
  const lowPrecision = intervals['baseFlags|C|own'];
  const largerCell = { ...original, counts: { ...original.counts,
    units: original.counts.units * 10, unitYears: original.counts.unitYears * 10,
    reviewedAlarms: original.counts.reviewedAlarms * 10 } };
  const largerResult = { chance: { C: { LNU: largerCell } }, detection: {} };
  const largerReference = effectiveReference(state, reference, simulationPlan(state, reference), largerResult);
  const highPrecision = derivedIntervals(state, largerReference, deriveAll(state, largerReference), false)['baseFlags|C|own'];
  assert.ok(highPrecision[1] - highPrecision[0] < (lowPrecision[1] - lowPrecision[0]) / 2);
  assert.equal(intervals['ratio|C|1'], undefined, 'paper-sourced ratio has no simulated interval');
  const mortality = world({ deathsPerYear: { NICU: 20, LNU: 8, SCU: 1 } });
  const mortalityResult = { chance: { C: { LNU: chance('C', 'LNU', { unitTypes: { ...reference.inputs.types,
    LNU: { ...reference.inputs.types.LNU, mean: 8 } } }) } },
  detection: { 4: { C: { LNU: detection('C', 'LNU', 4, { unitTypes: { ...reference.inputs.types,
    LNU: { ...reference.inputs.types.LNU, mean: 8 } } }) } } } };
  const mortalityReference = effectiveReference(mortality, reference, simulationPlan(mortality, reference), mortalityResult);
  const mortalityDerived = deriveAll(mortality, mortalityReference);
  const ratio = mortalityDerived.ratio.C.current.ratio;
  const bounds = derivedIntervals(mortality, mortalityReference, mortalityDerived, false)['ratio|C|1'];
  assert.ok(bounds[0] <= ratio && ratio <= bounds[1]);
});

test('maximum-adjusted posterior is available only with simulated detection counts', () => {
  const state = world({ significance: .1, rotaTest: 'adj' });
  const plan = simulationPlan(state, reference);
  assert.ok(plan.jobs.some(item => item.kind === 'detection'));
  const options = { ...simulationOptions(state, reference, plan), chanceReps: 80, detectionReps: 500,
    jobs: plan.jobs.filter(item => item.rule === 'C') };
  const result = runSimulation(reference, options);
  const effective = effectiveReference(state, reference, plan, result);
  const derived = deriveAll(state, effective, { adjustedPosterior: true });
  assert.ok(derived.posteriors.C > 0 && derived.posteriors.C < 1);
  assert.equal(deriveAll(PAPER_DEFAULT, reference).detection.C.LNU.flag_off_adj, undefined);
});
