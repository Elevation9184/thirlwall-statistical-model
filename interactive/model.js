import { SWEEP } from './reference/figure2-data.js';

export const PREVALENCE_MIN = .1;
export const PREVALENCE_MAX = 30;

export function sliderToPrevalence(position) {
  const logMin = Math.log10(PREVALENCE_MIN);
  const logMax = Math.log10(PREVALENCE_MAX);
  return 10 ** (logMin + (Number(position) / 100) * (logMax - logMin));
}

export function prevalenceToSlider(prevalence) {
  return Math.round(100 * (Math.log10(prevalence) - Math.log10(PREVALENCE_MIN)) /
    (Math.log10(PREVALENCE_MAX) - Math.log10(PREVALENCE_MIN)));
}

export function calculatePoint(row, prevalencePer10k, unitType) {
  if (!(prevalencePer10k > 0) || !row.detection[unitType]) throw new RangeError('Invalid model state');
  // Figure 2 uses false CUSUM crossings on fixed null paths as the numerator.
  // Detected offender-years scale linearly with prevalence. The .1 reference
  // has more printed digits than the 1 reference, so it is the arithmetic anchor.
  const falsePerTrue = row.ratioAtPoint1 * .1 / prevalencePer10k;
  const falseCrossingsPerYear = 175 / row.interval;
  const trueDetectionsPerYear = falseCrossingsPerYear / falsePerTrue;
  return {
    interval: row.interval,
    detectionProbability: row.detection[unitType],
    falsePerTrue,
    falseCrossingsPerYear,
    trueDetectionsPerYear,
    yearsPerDetection: 1 / trueDetectionsPerYear,
    byUnit: row.detection
  };
}

export function calculate(state) {
  if (!Number.isInteger(state.thresholdIndex) || state.thresholdIndex < 0 || state.thresholdIndex >= SWEEP.length) {
    throw new RangeError('Invalid threshold index');
  }
  const curve = SWEEP.map(row => calculatePoint(row, state.prevalencePer10k, state.unitType));
  return {
    curve,
    selected: curve[state.thresholdIndex],
    neonatalCurve: SWEEP.map(row => calculatePoint(row, 1, state.unitType)),
    nationalCurve: SWEEP.map(row => calculatePoint(row, .1, state.unitType))
  };
}
