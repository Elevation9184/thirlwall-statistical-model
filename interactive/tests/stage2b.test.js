import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAPER_DEFAULT } from '../presets.js';
import { TYPES, chanceForRule, deriveAll, falseTrue, mechanismProbability, posterior } from '../derive.js';

const reference = JSON.parse(readFileSync(fileURLToPath(new URL('../reference/reference.json', import.meta.url)), 'utf8'));
const printed = readFileSync(fileURLToPath(new URL('../../example_output.txt', import.meta.url)), 'utf8');
const rules = reference.inputs.rules;
const counts = Object.fromEntries(TYPES.map(type => [type, reference.inputs.types[type].n]));
const fmt = (value, digits) => Number(value).toFixed(digits);
const section = number => printed.split(`=== ${number}.`)[1]?.split(`=== ${number + 1}.`)[0] || '';
const lineFor = (block, rule) => block.split(/\r?\n/).find(line => new RegExp(`^${rule}\\s`).test(line));

test('reference inputs and every printed chance-alarm field agree with blocks 1 and 2', () => {
  const block1 = section(1);
  const block2 = section(2);
  for (const type of TYPES) {
    assert.equal(reference.inputs.types[type].n, PAPER_DEFAULT.unitCounts[type]);
  }
  for (const rule of rules) {
    const result = chanceForRule(rule, counts, reference);
    const alarmLine = lineFor(block1, rule);
    const alarm = /alarm unit-yrs\s+([\d.]+)\s+episodes\s+([\d.]+)/.exec(alarmLine);
    assert.ok(alarm, `missing block 1 ${rule}`);
    assert.equal(fmt(result.alarmUnitYears, 1), alarm[1]);
    assert.equal(fmt(result.episodes, 1), alarm[2]);
    const shareLine = block1.split(/\r?\n/)[block1.split(/\r?\n/).indexOf(alarmLine) + 1];
    for (const type of TYPES) {
      const match = new RegExp(`${type} ([\\d.]+)`).exec(shareLine);
      assert.equal(fmt(result.byType[type].alpha, 3), match[1]);
    }

    const rotaLine = lineFor(block2, rule);
    const rota = /avg-exp ([\d.]+)\s+own-exp ([\d.]+)\s+max-adj ([\d.]+)\s+\| flag episodes\/yr\s+([\d.]+)\s+distinct nurses\/yr\s+([\d.]+)/.exec(rotaLine);
    assert.ok(rota, `missing block 2 ${rule}`);
    assert.equal(fmt(result.shares.avg, 2), rota[1]);
    assert.equal(fmt(result.shares.own, 2), rota[2]);
    assert.equal(fmt(result.shares.adj, 3), rota[3]);
    assert.equal(fmt(result.flags.own, 1), rota[4]);
    assert.equal(fmt(result.distinctOwn, 1), rota[5]);
    const rows = block2.split(/\r?\n/);
    const start = rows.indexOf(rotaLine);
    for (let index = 0; index < 3; index++) {
      const type = TYPES[index];
      const row = rows[start + index + 1];
      const values = new RegExp(`${type}: avg-exp ([\\d.]+) own-exp ([\\d.]+) max-adj ([\\d.]+).*median deaths reviewed (\\d+), median top-nurse attendance (\\d+)`).exec(row);
      assert.ok(values, `missing block 2 ${rule} ${type}`);
      const cell = result.byType[type];
      assert.equal(fmt(cell.s_avg, 2), values[1]);
      assert.equal(fmt(cell.s_own, 2), values[2]);
      assert.equal(fmt(cell.s_adj, 3), values[3]);
      assert.equal(fmt(cell.med_k, 0), values[4]);
      assert.equal(fmt(cell.med_top, 0), values[5]);
    }
  }
  for (const type of TYPES) {
    for (const rule of ['E10', 'E50']) {
      const match = new RegExp(`${type}.*${rule}=([\\d.]+)`).exec(block1);
      assert.equal(fmt(reference.cusum_h[`${rule}|${type}`], 2), match[1]);
    }
  }
});

test('all printed detection fields and Figure 2 sweep values agree with blocks 3 and 9', () => {
  const block3 = section(3);
  for (const effect of [4, 7]) {
    for (const rule of rules) {
      const line = block3.split(/\r?\n/).find(row => row.startsWith(`+${effect} ${rule} `));
      assert.ok(line, `missing block 3 +${effect} ${rule}`);
      for (const type of TYPES) {
        const match = new RegExp(`${type}: ([\\d.]+) \\[bg ([\\d.]+)\\] \\(offender identified ([\\d.]+)\\)`).exec(line);
        const cell = reference.detection[String(effect)][rule][type];
        assert.equal(fmt(cell.d, 2), match[1]);
        assert.equal(fmt(cell.bg, 2), match[2]);
        assert.equal(fmt(cell.flag_off, 2), match[3]);
      }
    }
  }
  const sweepLines = section(9).split(/\r?\n/).filter(line => /^\s*1 in\s/.test(line));
  assert.equal(sweepLines.length, reference.sweep.length);
  for (let index = 0; index < sweepLines.length; index++) {
    const row = reference.sweep[index];
    const match = /^\s*1 in\s+(\d+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*(\d+):1\s+(\d+)\s*\|\s*(\d+):1\s+(\d+)/.exec(sweepLines[index]);
    assert.equal(1 / row.target, Number(match[1]));
    assert.equal(fmt(row.alarms_per_year, 2), match[2]);
    TYPES.forEach((type, i) => assert.equal(fmt(row.detection[type], 3), match[i + 3]));
    assert.equal(fmt(row.background.LNU, 3), match[6]);
    for (const [rate, ratioIndex, yearsIndex] of [[.1, 7, 8], [1, 9, 10]]) {
      const p = rate / 10000;
      const trueDetections = TYPES.reduce((sum, type) => sum + counts[type] * p * reference.weights.staff[type] * row.detection[type], 0);
      assert.equal(fmt(row.alarms_per_year / trueDetections, 0), match[ratioIndex]);
      assert.equal(fmt(1 / trueDetections, 0), match[yearsIndex]);
    }
  }
});

test('derived ratios and posterior recreate every printed block 4 and 5 cell', () => {
  for (const [allocation, heading] of [['staff', 'main case'], ['equal', 'sensitivity']]) {
    for (const [number, expectedCells] of [[4, 5], [5, 5]]) {
      const lines = section(number).split(/\r?\n/);
      const headingIndex = lines.findIndex(line => line.includes(heading));
      assert.ok(headingIndex >= 0);
      for (let index = 0; index < rules.length; index++) {
        const rule = rules[index];
        const line = lines[headingIndex + index + 1];
        assert.match(line, new RegExp(`^${rule}\\s`));
        const cells = number === 4
          ? [...line.matchAll(/p=([\d.]+):\s*(\d+):1 \(\s*(\d+)y\)/g)]
          : [...line.matchAll(/p=([\d.]+):\s*([\d.]+)%/g)];
        assert.equal(cells.length, expectedCells);
        for (const cell of cells) {
          const rate = Number(cell[1]);
          if (number === 4) {
            const derived = falseTrue(rule, rate, 4, allocation, counts, reference);
            assert.equal(fmt(derived.ratio, 0), cell[2], `${rule} ${allocation} p=${rate} ratio`);
            assert.equal(fmt(derived.years, 0), cell[3], `${rule} ${allocation} p=${rate} years`);
          } else {
            assert.equal(fmt(posterior(rule, rate, 4, allocation, counts, reference) * 100, 3), cell[2], `${rule} ${allocation} p=${rate} posterior`);
          }
        }
      }
    }
  }
});

test('derived own-exposure flags recreate every block 6 value and distinct count', () => {
  const block6 = section(6);
  for (const rule of rules) {
    const line = lineFor(block6, rule);
    const cells = [...line.matchAll(/q=([\d.]+):\s*([\d.]+) \(([\d.]+)\)/g)];
    assert.equal(cells.length, 4);
    const chance = chanceForRule(rule, counts, reference);
    for (const cell of cells) {
      const q = Number(cell[1]);
      assert.equal(fmt(chance.flags.own * q, 1), cell[2]);
      assert.equal(fmt(chance.distinctOwn * q, 1), cell[3]);
    }
  }
});

test('maximum-adjusted flags are summed from reviewed alarms and adjusted shares', () => {
  for (const rule of rules) {
    const derived = chanceForRule(rule, counts, reference).flags.adj;
    const direct = TYPES.reduce((total, type) => total + counts[type] * reference.chance[rule][type].rev * reference.chance[rule][type].s_adj, 0);
    assert.equal(derived, direct);
  }
});

test('q, base rate and unit count invariants hold', () => {
  const paper = deriveAll(PAPER_DEFAULT, reference);
  const halfQ = deriveAll({ ...PAPER_DEFAULT, q: .5 }, reference);
  assert.equal(paper.posteriors.C, halfQ.posteriors.C);
  assert.equal(halfQ.flags.C.current, paper.flags.C.current / 2);
  const rare = deriveAll({ ...PAPER_DEFAULT, prevalencePer10k: .1 }, reference);
  assert.deepEqual(paper.detection.C, rare.detection.C);
  const expanded = deriveAll({ ...PAPER_DEFAULT, unitCounts: { NICU: 80, LNU: 120, SCU: 70 } }, reference);
  assert.deepEqual(paper.chance.C.byType, expanded.chance.C.byType);
  assert.deepEqual(paper.detection.C, expanded.detection.C);
});

test('exact independent-attendance mechanism matches the four benchmark cases', () => {
  for (const [nurses, deaths, percent] of [[20, 3, 38], [40, 8, 49], [100, 28, 89], [200, 28, 99]]) {
    assert.ok(Math.abs(mechanismProbability(nurses, deaths, reference) * 100 - percent) <= 1);
  }
});

test('switching C to B propagates to Tabs 2, 4 and 5 printed quantities', () => {
  const before = deriveAll(PAPER_DEFAULT, reference);
  const after = deriveAll({ ...PAPER_DEFAULT, rule: 'B' }, reference);
  assert.equal(fmt(before.chance.C.flags.own, 1), '16.7');
  assert.equal(fmt(after.chance.B.flags.own, 1), '1.8');
  assert.equal(fmt(before.ratio.C.current.ratio, 0), '3648');
  assert.equal(fmt(after.ratio.B.current.ratio, 0), '1128');
  assert.equal(fmt(before.flags.C.current, 1), '16.7');
  assert.equal(fmt(after.flags.B.current, 1), '1.8');
  assert.equal(fmt(before.posteriors.C * 100, 3), '0.013');
  assert.equal(fmt(after.posteriors.B * 100, 3), '0.084');
});
