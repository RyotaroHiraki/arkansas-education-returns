/**
 * Transparent education-investment arithmetic, in constant purchasing-power dollars.
 * This is a scenario model of an observed earnings gap, not a causal estimator.
 *
 * Timing: s costs occur at t = 0,...,s-1; n benefits occur at t = s,...,s+n-1.
 * The first benefit is one period after the final study cost. Growth starts with
 * the second post-completion benefit. All rates are decimals, not percentages.
 */

function finiteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return value;
}

function nonnegative(value, name) {
  finiteNumber(value, name);
  if (value < 0) throw new RangeError(`${name} must be nonnegative.`);
  return value;
}

function boundedInteger(value, name, lower, upper) {
  finiteNumber(value, name);
  if (!Number.isInteger(value) || value < lower || value > upper) {
    throw new RangeError(`${name} must be an integer from ${lower} to ${upper}.`);
  }
  return value;
}

function validateRate(value, name) {
  finiteNumber(value, name);
  if (value <= -1) throw new RangeError(`${name} must be greater than -1.`);
  return value;
}

function safeFinite(value, label) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} exceeds the finite numerical range.`);
  return value;
}

function normalizeFlows(cashflows) {
  if (!Array.isArray(cashflows) || cashflows.length === 0) {
    throw new TypeError('cashflows must be a nonempty array of {year, net}.');
  }
  // Combine simultaneous flows before counting sign changes.
  const byYear = new Map();
  for (const flow of cashflows) {
    if (!flow || typeof flow !== 'object') throw new TypeError('Each cashflow must contain year and net.');
    nonnegative(flow.year, 'cashflow.year');
    finiteNumber(flow.net, 'cashflow.net');
    byYear.set(flow.year, safeFinite((byYear.get(flow.year) ?? 0) + flow.net, 'Combined cashflow'));
  }
  return [...byYear].sort(([a], [b]) => a - b).map(([year, net]) => ({year, net}));
}

// Scale every term by its largest log magnitude. The resulting sign remains
// meaningful even where direct discounting would overflow near r = -1.
function scaledNPV(flows, logRate) {
  const terms = flows.filter(flow => flow.net !== 0).map(flow => ({
    sign: Math.sign(flow.net),
    log: Math.log(Math.abs(flow.net)) - flow.year * logRate,
  }));
  if (!terms.length) return {sum: 0, scale: 0};
  const scale = Math.max(...terms.map(term => term.log));
  let sum = 0;
  let error = 0;
  for (const term of terms) {
    const next = term.sign * Math.exp(term.log - scale) - error;
    const total = sum + next;
    error = (total - sum) - next;
    sum = total;
  }
  return {sum, scale};
}

/** Net present value at t=0 for timed cashflows; input is never modified. */
export function netPresentValue(cashflows, rate) {
  validateRate(rate, 'rate');
  const {sum, scale} = scaledNPV(normalizeFlows(cashflows), Math.log1p(rate));
  if (sum === 0) return 0;
  return safeFinite(Math.sign(sum) * Math.exp(Math.log(Math.abs(sum)) + scale), 'NPV');
}

/**
 * Solve only a conventional investment: negative flows followed by positive
 * flows, with exactly one sign change. Other patterns receive a reason rather
 * than an arbitrarily selected root. Solve in log(1+r), using scaled NPV signs.
 */
export function solveIRR(cashflows) {
  const flows = normalizeFlows(cashflows).filter(flow => flow.net !== 0);
  if (!flows.length) return {irr: null, reason: 'all-zero'};
  const negative = flows.some(flow => flow.net < 0);
  const positive = flows.some(flow => flow.net > 0);
  if (!negative) return {irr: null, reason: 'no-investment'};
  if (!positive) return {irr: null, reason: 'no-benefit'};
  let changes = 0;
  for (let i = 1; i < flows.length; i += 1) {
    if (Math.sign(flows[i].net) !== Math.sign(flows[i - 1].net)) changes += 1;
  }
  if (changes !== 1) return {irr: null, reason: 'multiple-sign-changes'};
  if (flows[0].net > 0) return {irr: null, reason: 'nonstandard-cashflows'};

  // Move the first nonzero date to zero; this preserves every finite IRR and
  // avoids very small common discount factors for late-starting cashflows.
  const origin = flows[0].year;
  const shifted = flows.map(flow => ({year: flow.year - origin, net: flow.net}));
  const signAt = logRate => scaledNPV(shifted, logRate).sum;
  const zeroValue = signAt(0);
  if (Math.abs(zeroValue) < 1e-14) return {irr: 0, reason: null};

  let low = -1;
  let high = 1;
  while (signAt(low) <= 0 && low > -700) low = Math.max(-700, low * 2);
  while (signAt(high) >= 0 && high < 700) high = Math.min(700, high * 2);
  if (signAt(low) <= 0 || signAt(high) >= 0) {
    return {irr: null, reason: 'outside-numerical-range'};
  }
  for (let i = 0; i < 120; i += 1) {
    const mid = (low + high) / 2;
    const value = signAt(mid);
    if (value > 0) low = mid;
    else high = mid;
    if (high - low < 1e-13) break;
  }
  const irr = Math.expm1((low + high) / 2);
  if (!Number.isFinite(irr) || irr <= -1) {
    return {irr: null, reason: 'outside-numerical-range'};
  }
  return {irr, reason: null};
}

function discountedAmount(net, year, rate) {
  if (net === 0) return 0;
  return safeFinite(
    Math.sign(net) * Math.exp(Math.log(Math.abs(net)) - year * Math.log1p(rate)),
    'Discounted cashflow',
  );
}

/**
 * Costs are incremental private costs, not all living expenses or loan balances.
 * benefitShare (0..1) scales an observed wage gap for sensitivity analysis only.
 * inStudyEarnings may exceed baselineEarnings: this permits a negative net study
 * cost, but then the conventional investment shortcut may be undefined.
 *
 * paybackYears is the first scheduled cashflow date at which cumulative net
 * cashflow recovers the investment; it does not interpolate between dates.
 * The shortcut and its finite-horizon correction ignore growth and cost timing.
 */
export function calculateReturns(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object.');
  }
  const inputs = {
    baselineEarnings: nonnegative(options.baselineEarnings, 'baselineEarnings'),
    graduateEarnings: nonnegative(options.graduateEarnings, 'graduateEarnings'),
    studyYears: boundedInteger(options.studyYears, 'studyYears', 1, 10),
    annualCost: nonnegative(options.annualCost ?? 0, 'annualCost'),
    inStudyEarnings: nonnegative(options.inStudyEarnings ?? 0, 'inStudyEarnings'),
    workYears: boundedInteger(options.workYears, 'workYears', 1, 50),
    growthRate: validateRate(options.growthRate ?? 0, 'growthRate'),
    discountRate: validateRate(options.discountRate ?? 0.03, 'discountRate'),
    benefitShare: finiteNumber(options.benefitShare ?? 1, 'benefitShare'),
  };
  if (inputs.benefitShare < 0 || inputs.benefitShare > 1) {
    throw new RangeError('benefitShare must be between 0 and 1.');
  }
  const {baselineEarnings, graduateEarnings, studyYears, annualCost,
    inStudyEarnings, workYears, growthRate, discountRate, benefitShare} = inputs;
  const rawAnnualPremium = safeFinite(graduateEarnings - baselineEarnings, 'Earnings gap');
  const annualPremium = safeFinite(rawAnnualPremium * benefitShare, 'Scaled earnings gap');
  const annualOpportunityCost = baselineEarnings - inStudyEarnings;
  const annualInvestment = safeFinite(annualOpportunityCost + annualCost, 'Annual investment');
  const investment = safeFinite(studyYears * annualInvestment, 'Total investment');
  const shortcut = investment > 0 ? safeFinite(annualPremium / investment, 'Shortcut return') : null;
  const finiteHorizonShortcut = shortcut !== null && shortcut > 0
    ? shortcut * -Math.expm1(-workYears * Math.log1p(shortcut))
    : null;

  let cumulativeNet = 0;
  let cumulativeDiscountedNet = 0;
  let paybackYears = null;
  let discountedPaybackYears = null;
  const cashflows = [];
  for (let year = 0; year < studyYears + workYears; year += 1) {
    const studying = year < studyYears;
    const benefitIndex = year - studyYears;
    const cost = studying ? annualInvestment : 0;
    const benefit = studying ? 0 : safeFinite(annualPremium * (1 + growthRate) ** benefitIndex, 'Annual benefit');
    const net = benefit - cost;
    const discountedNet = discountedAmount(net, year, discountRate);
    cumulativeNet = safeFinite(cumulativeNet + net, 'Cumulative cashflow');
    cumulativeDiscountedNet = safeFinite(cumulativeDiscountedNet + discountedNet, 'Cumulative discounted cashflow');
    cashflows.push({
      year, period: year + 1, phase: studying ? 'study' : 'work',
      yearsAfterCompletion: studying ? 0 : benefitIndex + 1,
      cost, benefit, net, discountedNet, cumulativeNet, cumulativeDiscountedNet,
    });
    const tolerance = Math.max(1, Math.abs(investment)) * 1e-12;
    if (investment > 0 && !studying && paybackYears === null && cumulativeNet >= -tolerance) {
      paybackYears = year;
    }
    if (investment > 0 && !studying && discountedPaybackYears === null && cumulativeDiscountedNet >= -tolerance) {
      discountedPaybackYears = year;
    }
  }
  const {irr, reason: irrReason} = solveIRR(cashflows);
  return {
    inputs, rawAnnualPremium, annualPremium, annualOpportunityCost,
    annualInvestment, investment, shortcut,
    shortcutReason: shortcut === null ? 'nonpositive-investment' : null,
    finiteHorizonShortcut,
    finiteHorizonShortcutReason: finiteHorizonShortcut === null ? 'nonpositive-shortcut' : null,
    irr, irrReason, npv: netPresentValue(cashflows, discountRate),
    paybackYears, discountedPaybackYears, cashflows,
    totalBenefits: cashflows.reduce((sum, flow) => sum + flow.benefit, 0),
    lifetimeNet: cumulativeNet,
    timing: 'Costs at t=0…s−1; benefits at t=s…s+n−1.',
  };
}
