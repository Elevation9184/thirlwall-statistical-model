import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAPER_DEFAULT } from '../presets.js';
import { deriveAll } from '../derive.js';
import { formatNumber, formatPosterior } from '../tabs/common.js';
import { renderTab1 } from '../tabs/tab1.js';
import { renderTab2 } from '../tabs/tab2.js';
import { renderTab3 } from '../tabs/tab3.js';
import { renderTab4 } from '../tabs/tab4.js';
import { renderTab5 } from '../tabs/tab5.js';

const reference = JSON.parse(readFileSync(fileURLToPath(new URL('../reference/reference.json', import.meta.url)), 'utf8'));
const printed = readFileSync(fileURLToPath(new URL('../../example_output.txt', import.meta.url)), 'utf8');
const paper = deriveAll(PAPER_DEFAULT, reference);
const rules = reference.inputs.rules;
const strip = html => html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const rowsOf = html => [...html.matchAll(/<tbody>[\s\S]*?<\/tbody>/g)].flatMap(body =>
  [...body[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(row =>
    [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell => cell[1])));
const cell = (row, index) => strip(row[index]);
const section = number => printed.split(`=== ${number}.`)[1]?.split(`=== ${number + 1}.`)[0] || '';
const printedLine = (block, rule) => block.split(/\r?\n/).find(line => new RegExp(`^${rule}\\s`).test(line));
const commas = digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// The browser uses percentages in Tables 2–3, while the Python console uses
// fractions. Shift the printed decimal point without recomputing a model value.
function printedPercent(fraction, places) {
  const [whole, decimals = ''] = fraction.split('.');
  const padded = decimals.padEnd(2 + places, '0');
  const integer = Number(whole) * 100 + Number(padded.slice(0, 2));
  return `${integer}${places ? `.${padded.slice(2, 2 + places)}` : ''}%`;
}

test('shared display formatter matches Python fixed-point rounding of binary floats', () => {
  assert.equal(formatNumber(reference.chance.E50.NICU.alpha, 3), '0.018');
  assert.equal(formatNumber(.125, 2), '0.12');
  assert.equal(formatNumber(2.5, 0), '2');
  assert.equal(formatNumber(3.5, 0), '4');
  assert.equal(formatNumber(-2.5, 0), '-2');
  assert.equal(formatNumber(36488, 0), '36,488');
});

test('rendered Table 1 cells reproduce block 1 printed strings', () => {
  const rows = rowsOf(renderTab1(PAPER_DEFAULT, paper, paper, reference).table);
  for (const [index, rule] of rules.entries()) {
    const line = printedLine(section(1), rule);
    const alarm = /alarm unit-yrs\s+([\d.]+)\s+episodes\s+([\d.]+)/.exec(line);
    const next = section(1).split(/\r?\n/);
    const shares = /NICU ([\d.]+)\s+LNU ([\d.]+)\s+SCU ([\d.]+)/.exec(next[next.indexOf(line) + 1]);
    assert.deepEqual([2, 3, 4, 5, 6].map(i => cell(rows[index], i)), [alarm[1], alarm[2], shares[1], shares[2], shares[3]], rule);
  }
});

test('rendered Table 2 cells reproduce block 2 medians, shares and flag episodes', () => {
  const rows = rowsOf(renderTab2(PAPER_DEFAULT, paper, paper).table);
  const lines = section(2).split(/\r?\n/);
  const system = printedLine(section(2), 'C');
  const start = lines.indexOf(system);
  for (let index = 0; index < 3; index++) {
    const match = /avg-exp ([\d.]+) own-exp ([\d.]+) max-adj ([\d.]+).*median deaths reviewed (\d+), median top-nurse attendance (\d+)/.exec(lines[start + index + 1]);
    assert.deepEqual([1, 2, 3, 4, 5].map(i => cell(rows[index], i)),
      [match[4], match[5], printedPercent(match[1], 0), printedPercent(match[2], 0), printedPercent(match[3], 1)]);
  }
  const weighted = /avg-exp ([\d.]+)\s+own-exp ([\d.]+)\s+max-adj ([\d.]+)\s+\| flag episodes\/yr\s+([\d.]+)/.exec(system);
  assert.deepEqual([3, 4, 5].map(i => cell(rows[3], i)), [printedPercent(weighted[1], 0), printedPercent(weighted[2], 0), printedPercent(weighted[3], 1)]);
  assert.equal(cell(rows[4], 1), weighted[4]);
});

test('rendered Table 3 cells reproduce block 3 detection and local identification', () => {
  const rows = rowsOf(renderTab3(PAPER_DEFAULT, paper, paper).table);
  for (const [index, rule] of rules.entries()) {
    const line = section(3).split(/\r?\n/).find(row => row.startsWith(`+4 ${rule} `));
    const values = [...line.matchAll(/(NICU|LNU|SCU): ([\d.]+) \[bg ([\d.]+)\] \(offender identified ([\d.]+)\)/g)];
    assert.deepEqual([1, 2, 3, 4, 5].map(i => cell(rows[index], i)),
      [values[0][2], values[1][2], values[2][2], values[1][4], values[1][3]].map(value => printedPercent(value, 0)), rule);
  }
});

test('rendered Table 4 cells reproduce block 4 ratios at all printed rates', () => {
  const rows = rowsOf(renderTab4(PAPER_DEFAULT, paper, paper, reference).table);
  for (const [index, rule] of rules.entries()) {
    const line = printedLine(section(4).split('sensitivity, equal risk per unit:')[0], rule);
    const ratios = [...line.matchAll(/p=[\d.]+:\s*(\d+):1/g)].map(match => `${commas(match[1])}:1`);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(i => cell(rows[index], i)), [...ratios, ratios[1]], rule);
  }
});

test('rendered Table 5 cells reproduce block 6 flags and distinct nurses, plus block 5 posterior precision', () => {
  const rows = rowsOf(renderTab5(PAPER_DEFAULT, paper, paper).table);
  for (const [index, rule] of rules.entries()) {
    const flags = [...printedLine(section(6), rule).matchAll(/q=[\d.]+:\s*([\d.]+) \(([\d.]+)\)/g)];
    for (let qIndex = 0; qIndex < 4; qIndex++) {
      const current = /<span class="live-value">([^<]+)<\/span>/.exec(rows[index][qIndex + 1]);
      const distinct = /<small class="distinct-value">([^<]+) distinct<\/small>/.exec(rows[index][qIndex + 1]);
      assert.equal(current[1], flags[qIndex][1], `${rule} q ${qIndex} flags`);
      assert.equal(distinct[1], flags[qIndex][2], `${rule} q ${qIndex} distinct`);
    }
    const posterior = /p=1:\s*([\d.]+)%/.exec(printedLine(section(5).split('sensitivity, equal risk per unit:')[0], rule));
    const percentage = /<small>([\d.]+%)<\/small>/.exec(rows[index][7]);
    assert.equal(percentage[1], `${posterior[1]}%`, `${rule} posterior`);
  }
  assert.equal(formatPosterior(paper.posteriors.C).odds, '1 in 7,400');
  assert.equal(formatPosterior(paper.posteriors.D).odds, '1 in 7,700');
});
