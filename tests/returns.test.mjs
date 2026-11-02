import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateReturns, netPresentValue, solveIRR} from '../dist/returns.mjs';

const approx = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};
const base = {
  baselineEarnings: 60000, graduateEarnings: 80000,
  studyYears: 2, annualCost: 10000, inStudyEarnings: 0,
  workYears: 30, growthRate: 0, discountRate: 0.03, benefitShare: 1,
};

test('one-year investment with one benefit has a known 10% IRR', () => {
  const result = calculateReturns({baselineEarnings: 100, graduateEarnings: 210, studyYears: 1, workYears: 1, discountRate: 0.1});
  approx(result.irr, 0.1);
  approx(result.npv, 0, 1e-10);
  assert.equal(result.shortcut, 1.1);
  assert.equal(result.paybackYears, 1);
  assert.deepEqual(result.cashflows.map(({year, net}) => ({year, net})), [{year: 0, net: -100}, {year: 1, net: 110}]);
});

test('multi-year costs use their actual dates, with a known 10% root', () => {
  // -100 - 100/1.1 + 231/1.1^2 = 0.
  const flows = [{year: 0, net: -100}, {year: 1, net: -100}, {year: 2, net: 231}];
  approx(solveIRR(flows).irr, 0.1);
  approx(netPresentValue(flows, 0.1), 0, 1e-10);
});

test('positive premium can give negative exact IRR and positive shortcut correction', () => {
  const result = calculateReturns({...base, annualCost: 0, graduateEarnings: 65000, workYears: 20});
  assert.ok(result.irr < 0);
  assert.ok(result.shortcut > 0);
  assert.ok(result.finiteHorizonShortcut > 0);
  assert.equal(result.paybackYears, null);
  approx(netPresentValue(result.cashflows, result.irr), 0, 1e-5);
});

test('IRR handles a very negative rate without direct-discount overflow', () => {
  const {irr, reason} = solveIRR([{year: 0, net: -1e12}, {year: 1, net: 1}]);
  assert.equal(reason, null);
  approx(irr, -0.999999999999, 1e-15);
});

test('zero undiscounted total gives zero IRR rather than a fake positive root', () => {
  const result = calculateReturns({baselineEarnings: 100, graduateEarnings: 110, studyYears: 1, workYears: 10, discountRate: 0});
  assert.equal(result.irr, 0);
  approx(result.npv, 0, 1e-10);
  assert.equal(result.paybackYears, 10);
});

test('no premium, negative premium, and zero outlay are explicitly undefined IRR cases', () => {
  const noPremium = calculateReturns({...base, graduateEarnings: base.baselineEarnings});
  assert.equal(noPremium.irr, null);
  assert.equal(noPremium.irrReason, 'no-benefit');
  assert.equal(noPremium.shortcut, 0);
  assert.equal(noPremium.paybackYears, null);
  const negative = calculateReturns({...base, graduateEarnings: 50000});
  assert.equal(negative.irrReason, 'no-benefit');
  assert.ok(negative.shortcut < 0);
  assert.equal(negative.finiteHorizonShortcut, null);
  const zeroOutlay = calculateReturns({...base, annualCost: 0, inStudyEarnings: 60000});
  assert.equal(zeroOutlay.shortcut, null);
  assert.equal(zeroOutlay.irr, null);
  assert.equal(zeroOutlay.irrReason, 'no-investment');
  assert.equal(zeroOutlay.paybackYears, null);
  assert.equal(solveIRR([{year: 0, net: 0}]).reason, 'all-zero');
  const reverse = calculateReturns({...base, annualCost: 0, inStudyEarnings: 80000, graduateEarnings: 50000});
  assert.equal(reverse.shortcut, null);
  assert.equal(reverse.irrReason, 'nonstandard-cashflows');
});

test('ambiguous multiple roots and a reverse investment never return a selected IRR', () => {
  assert.equal(solveIRR([{year: 0, net: -100}, {year: 1, net: 230}, {year: 2, net: -132}]).reason, 'multiple-sign-changes');
  assert.equal(solveIRR([{year: 0, net: 100}, {year: 1, net: -110}]).reason, 'nonstandard-cashflows');
});

test('simultaneous cashflows combine before counting signs; input is not mutated', () => {
  const flows = [{year: 1, net: 120}, {year: 0, net: -100}, {year: 1, net: -10}];
  const original = structuredClone(flows);
  approx(solveIRR(flows).irr, 0.1);
  assert.deepEqual(flows, original);
});

test('cashflow length, opportunity cost, and growth begin in the specified periods', () => {
  const inputs = {...base, annualCost: 12000, inStudyEarnings: 20000, workYears: 3, growthRate: 0.1, benefitShare: 0.5};
  const result = calculateReturns(inputs);
  assert.equal(result.cashflows.length, 5);
  assert.equal(result.annualOpportunityCost, 40000);
  assert.equal(result.annualInvestment, 52000);
  assert.equal(result.investment, 104000);
  assert.equal(result.rawAnnualPremium, 20000);
  assert.equal(result.annualPremium, 10000);
  assert.deepEqual(result.cashflows.map(flow => flow.phase), ['study', 'study', 'work', 'work', 'work']);
  assert.deepEqual(result.cashflows.map(flow => flow.yearsAfterCompletion), [0, 0, 1, 2, 3]);
  for (const [index, expected] of [-52000, -52000, 10000, 11000, 12100].entries()) {
    approx(result.cashflows[index].net, expected);
  }
  approx(result.lifetimeNet, -70900);
  approx(result.cashflows.at(-1).cumulativeDiscountedNet, result.npv, 1e-8);
  assert.equal(inputs.annualCost, 12000);
});

test('payback uses the first actual cashflow date, including the study period', () => {
  const result = calculateReturns({baselineEarnings: 60, graduateEarnings: 90, studyYears: 2, workYears: 5, discountRate: 0});
  assert.equal(result.paybackYears, 5);
  assert.equal(result.discountedPaybackYears, 5);
});

test('longer careers improve conventional IRR; discount rate changes NPV, not IRR', () => {
  const short = calculateReturns({...base, workYears: 10});
  const long = calculateReturns(base);
  assert.ok(long.irr > short.irr);
  assert.ok(long.npv > short.npv);
  const highDiscount = calculateReturns({...base, discountRate: 0.1});
  approx(highDiscount.irr, long.irr);
  assert.ok(highDiscount.npv < long.npv);
});

test('invalid amounts, periods, rates, and sensitivity shares fail clearly', () => {
  for (const patch of [
    {annualCost: -1}, {baselineEarnings: -1}, {graduateEarnings: -1}, {inStudyEarnings: -1},
    {studyYears: 0}, {studyYears: 11}, {studyYears: 1.5}, {workYears: 0}, {workYears: 51},
    {growthRate: -1}, {discountRate: -1}, {benefitShare: -0.1}, {benefitShare: 1.1},
  ]) assert.throws(() => calculateReturns({...base, ...patch}), RangeError);
  for (const patch of [{annualCost: NaN}, {graduateEarnings: Infinity}, {studyYears: '2'}]) {
    assert.throws(() => calculateReturns({...base, ...patch}), TypeError);
  }
  assert.throws(() => calculateReturns(), TypeError);
  assert.throws(() => netPresentValue([], 0.03), TypeError);
  assert.throws(() => netPresentValue([{year: -1, net: 10}], 0.03), RangeError);
});
