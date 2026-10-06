const LOG_FACTORIAL = [0];

function logFactorial(n) {
  for (let i = LOG_FACTORIAL.length; i <= n; i++) LOG_FACTORIAL[i] = LOG_FACTORIAL[i - 1] + Math.log(i);
  return LOG_FACTORIAL[n];
}

export function gamma(rng, shape, scale = 1) {
  if (!(shape > 0) || !(scale > 0)) throw new RangeError('Gamma shape and scale must be positive');
  if (shape < 1) return gamma(rng, shape + 1, scale) * rng.uniform() ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = rng.normal();
    const root = 1 + c * x;
    if (root <= 0) continue;
    const v = root * root * root;
    const u = rng.uniform();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < x * x / 2 + d * (1 - v + Math.log(v))) return scale * d * v;
  }
}

export function poisson(rng, mean) {
  if (!(mean >= 0) || !Number.isFinite(mean)) throw new RangeError('Poisson mean must be finite and nonnegative');
  if (mean === 0) return 0;
  if (mean < 30) {
    let remaining = rng.uniform();
    let probability = Math.exp(-mean);
    let count = 0;
    while (remaining > probability) {
      remaining -= probability;
      count++;
      probability *= mean / count;
    }
    return count;
  }
  // Hörmann's PTRS transformed rejection method for larger means.
  const b = 0.931 + 2.53 * Math.sqrt(mean);
  const a = -0.059 + 0.02483 * b;
  const inverseAlpha = 1.1239 + 1.1328 / (b - 3.4);
  const vr = 0.9277 - 3.6224 / (b - 2);
  for (;;) {
    const u = rng.uniform() - 0.5;
    const v = rng.uniform();
    const us = 0.5 - Math.abs(u);
    const count = Math.floor((2 * a / us + b) * u + mean + 0.43);
    if (us >= 0.07 && v <= vr) return count;
    if (count < 0 || (us < 0.013 && v > us)) continue;
    if (Math.log(v) + Math.log(inverseAlpha) - Math.log(a / (us * us) + b)
        <= -mean + count * Math.log(mean) - logFactorial(count)) return count;
  }
}

export function binomial(rng, trials, probability) {
  if (!Number.isInteger(trials) || trials < 0 || !(probability >= 0 && probability <= 1)) throw new RangeError('Invalid binomial parameters');
  if (trials === 0 || probability === 0) return 0;
  if (probability === 1) return trials;
  if (probability > 0.5) return trials - binomial(rng, trials, 1 - probability);
  let remaining = rng.uniform();
  if (trials < 64) {
    let mass = (1 - probability) ** trials;
    let count = 0;
    while (remaining > mass && count < trials) {
      remaining -= mass;
      count++;
      mass *= (trials - count + 1) / count * probability / (1 - probability);
    }
    return count;
  }
  // Exact mode-centred chop-down: visit binomial masses from the mode outward.
  const mode = Math.floor((trials + 1) * probability);
  const modeMass = Math.exp(logFactorial(trials) - logFactorial(mode) - logFactorial(trials - mode)
    + mode * Math.log(probability) + (trials - mode) * Math.log1p(-probability));
  remaining -= modeMass;
  if (remaining <= 0) return mode;
  let left = mode, right = mode, leftMass = modeMass, rightMass = modeMass;
  for (;;) {
    if (left > 0) {
      leftMass *= left / (trials - left + 1) * (1 - probability) / probability;
      left--;
      remaining -= leftMass;
      if (remaining <= 0) return left;
    }
    if (right < trials) {
      rightMass *= (trials - right) / (right + 1) * probability / (1 - probability);
      right++;
      remaining -= rightMass;
      if (remaining <= 0) return right;
    }
    if (left === 0 && right === trials) return right;
  }
}

export function poissonQuantile(q, mean) {
  if (!(q > 0 && q < 1) || !(mean >= 0)) throw new RangeError('Invalid Poisson quantile parameters');
  let mass = Math.exp(-mean);
  let cumulative = mass;
  let count = 0;
  while (cumulative < q) {
    count++;
    mass *= mean / count;
    cumulative += mass;
  }
  return count;
}

export function binomialCDF(atMost, trials, probability) {
  if (atMost < 0) return 0;
  if (atMost >= trials) return 1;
  if (probability === 0) return 1;
  if (probability === 1) return 0;
  let mass = (1 - probability) ** trials;
  let cumulative = mass;
  for (let k = 1; k <= atMost; k++) {
    mass *= (trials - k + 1) / k * probability / (1 - probability);
    cumulative += mass;
  }
  return Math.min(1, cumulative);
}

export function binomialTail(atLeast, trials, probability) {
  if (atLeast <= 0) return 1;
  if (atLeast > trials) return 0;
  if (probability === 0) return 0;
  if (probability === 1) return 1;
  let mass = Math.exp(logFactorial(trials) - logFactorial(atLeast) - logFactorial(trials - atLeast)
    + atLeast * Math.log(probability) + (trials - atLeast) * Math.log1p(-probability));
  let total = mass;
  for (let k = atLeast + 1; k <= trials; k++) {
    mass *= (trials - k + 1) / k * probability / (1 - probability);
    total += mass;
  }
  return Math.min(1, total);
}
