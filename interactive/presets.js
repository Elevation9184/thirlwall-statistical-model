export const PAPER_DEFAULT = Object.freeze({
  activeTab: 1,
  rule: 'C',
  rotaTest: 'own',
  thresholdIndex: 1,              // E10, one of the paper's two tabulated settings
  prevalencePer10k: 1,            // neonatal reference scenario
  unitType: 'LNU',                 // Figure 2 uses local-unit detection on x-axis
  expectedExtraDeaths: 4,
  alarmSD: 2,
  significance: .05,
  seed: 20261007,
  riskAllocation: 'staff',
  q: 1,
  investigationMonths: 18,
  mechanismRoster: 40,
  mechanismDeaths: 8,
  figureOpen: false,
  worldOpen: false,
  unitCounts: Object.freeze({ NICU: 45, LNU: 85, SCU: 45 }),
  deathsPerYear: Object.freeze({ NICU: 20, LNU: 4, SCU: 1 }),
  staffPerRoster: Object.freeze({ NICU: 100, LNU: 40, SCU: 20 }),
  annualBackgroundDeaths: Object.freeze({ NICU: 20, LNU: 4, SCU: 1 }),
  caseMixCV: .25
});

export const UNIT_NAMES = Object.freeze({ NICU: 'Intensive care unit', LNU: 'Local unit', SCU: 'Special care unit' });
