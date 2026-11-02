import test from 'node:test';
import assert from 'node:assert/strict';
import {overallPath, initialPath, defaultStudyYears, preferredBaseline} from '../dist/data-model.mjs';

const campus = {
  id: '106397', name: 'University of Arkansas', state: 'AR', operating: true,
  predominantCredential: 3, overallEarnings: 61800, overallEarningsCount: 4567,
  overallEarningsStatus: 'reported', overallEarningsCountStatus: 'reported',
  opeidInstitutionIds: ['106397', '999999'], opeidStates: ['AR'],
};

test('overall uses the official institution outcome and preserves its distinct cohort and grouping', () => {
  const path = overallPath(campus);
  assert.equal(path.earnings, 61800);
  assert.equal(path.earningsCount, 4567);
  assert.equal(path.earningsMetric, 'MD_EARN_WNE_4YR');
  assert.equal(path.kind, 'overall');
  assert.equal(path.credential, 0);
  assert.equal(path.cip, null);
  assert.deepEqual(path.relatedInstitutionIds, ['106397']);
  assert.deepEqual(path.earningsGroupInstitutionIds, ['106397', '999999']);
  path.earningsGroupInstitutionIds.push('another');
  assert.deepEqual(campus.opeidInstitutionIds, ['106397', '999999']);
});

test('suppressed or missing overall outcomes never fall back to program earnings', () => {
  const suppressed = overallPath({...campus, overallEarnings: null, overallEarningsStatus: 'suppressed', programs: [{earnings: 80000}, {earnings: 40000}]});
  assert.equal(suppressed.earnings, null);
  assert.equal(suppressed.earningsStatus, 'suppressed');
  const missing = overallPath({id: 'new', operating: true});
  assert.equal(missing.earnings, null);
  assert.equal(missing.earningsCount, null);
  assert.equal(missing.earningsStatus, 'unavailable');
  assert.equal(overallPath({...campus, overallEarnings: 0}).earnings, 0);
});

test('initial overall selection includes operating institutions without program records or earnings', () => {
  const other = {...campus, id: 'other', name: 'Another college'};
  const unreported = {...campus, overallEarnings: null};
  assert.equal(initialPath([other, unreported]).institutionId, campus.id);
  assert.equal(initialPath([other, {...campus, operating: false}]).institutionId, 'other');
  assert.equal(initialPath([{...campus, operating: false}]), null);
  assert.equal(initialPath([]), null);
});

test('overall duration uses predominant undergraduate award while program duration stays credential-specific', () => {
  const overall = overallPath(campus);
  assert.equal(defaultStudyYears(overall, campus), 4);
  assert.equal(defaultStudyYears(overall, {...campus, predominantCredential: 2}), 2);
  assert.equal(defaultStudyYears(overall, {...campus, predominantCredential: 1}), 1);
  assert.equal(defaultStudyYears(overall, {...campus, predominantCredential: 0}), 4);
  assert.equal(defaultStudyYears({credential: 5}, campus), 2);
  assert.equal(defaultStudyYears({credential: 6}, campus), 5);
});

test('overall path does not select a graduate-program bachelor baseline', () => {
  assert.equal(preferredBaseline(overallPath(campus), [{credential: 3, cip: null, earnings: 50000, operating: true, institutionId: campus.id}]), null);
});
