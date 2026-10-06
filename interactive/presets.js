export const PAPER_DEFAULT = Object.freeze({
  thresholdIndex: 1,              // E10, one of the paper's two tabulated settings
  prevalencePer10k: 1,            // neonatal reference scenario
  unitType: 'LNU',                 // Figure 2 uses local-unit detection on x-axis
  expectedExtraDeaths: 4,
  riskAllocation: 'staff-proportional',
  unitCounts: Object.freeze({ NICU: 45, LNU: 85, SCU: 45 }),
  annualBackgroundDeaths: Object.freeze({ NICU: 20, LNU: 4, SCU: 1 }),
  caseMixCV: .25
});

export const UNIT_NAMES = Object.freeze({ NICU: 'intensive unit', LNU: 'local unit', SCU: 'special care unit' });
