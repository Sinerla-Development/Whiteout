const assert = require('assert');
const V = require('../ui/validate.js');

let failures = 0, count = 0;
const test = (name, fn) => {
  count++;
  try { fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + ': ' + e.message); }
};
const level = (r) => (r ? r.level : null);
const need = (label) => V.NEEDS.find((n) => n.label === label);

console.log('Validation rules');
test('needs inside their range pass', () => {
  for (const n of V.NEEDS) assert.strictEqual(V.checkRange(50, n), null, n.label);
  assert.strictEqual(V.checkRange(100, need('Health')), null);
});
test('a value that is not a number is an error', () => {
  assert.strictEqual(level(V.checkRange('abc', need('Thirst'))), 'error');
  assert.strictEqual(level(V.checkRange({ t: 'NaN' }, need('Thirst'))), 'error');
  assert.strictEqual(level(V.checkRange(undefined, need('Thirst'))), 'error');
  assert.strictEqual(level(V.checkRange({ t: 'Infinity' }, need('Fatigue'))), 'error');
});
test('needs outside the editor limits are errors', () => {
  assert.strictEqual(level(V.checkRange(-1, need('Health'))), 'error');
  assert.strictEqual(level(V.checkRange(100.5, need('Health'))), 'error');
  assert.strictEqual(level(V.checkRange(100001, need('Calories'))), 'error');
  assert.strictEqual(level(V.checkRange(101, need('Cold'))), 'error');
  assert.match(V.checkRange(-5, need('Fatigue')).msg, /negative/);
});
test('unusual needs are warnings', () => {
  assert.strictEqual(level(V.checkRange(0, need('Health'))), 'warning');
  assert.strictEqual(level(V.checkRange(3000, need('Calories'))), 'warning');
  assert.strictEqual(V.checkRange(2500, need('Calories')), null);
});
test('item condition', () => {
  assert.strictEqual(V.checkCondition(75), null);
  assert.strictEqual(V.checkCondition(0), null);
  assert.strictEqual(level(V.checkCondition(101)), 'warning');
  assert.strictEqual(level(V.checkCondition(-1)), 'error');
  assert.strictEqual(level(V.checkCondition(NaN)), 'error');
});
test('item amounts', () => {
  assert.strictEqual(V.checkQty(12, 'stack'), null);
  assert.strictEqual(level(V.checkQty(-1, 'stack')), 'error');
  assert.strictEqual(level(V.checkQty(2.5, 'stack')), 'error');
  assert.strictEqual(level(V.checkQty(NaN, 'liters')), 'error');
  assert.strictEqual(level(V.checkQty(5000, 'stack')), 'warning');
  assert.strictEqual(level(V.checkQty(50, 'liters')), 'warning');
  assert.strictEqual(V.checkQty(1.5, 'liters'), null);
  assert.strictEqual(level(V.checkQty(-10, 'kcal')), 'error');
  assert.strictEqual(level(V.checkQty(50000, 'kcal')), 'warning');
  assert.strictEqual(V.checkQty(5, 'unknown'), null);
});
test('time of day and day number', () => {
  assert.strictEqual(V.checkTimeOfDay(0), null);
  assert.strictEqual(V.checkTimeOfDay(0.9999), null);
  assert.strictEqual(level(V.checkTimeOfDay(1)), 'error');
  assert.strictEqual(level(V.checkTimeOfDay(-0.1)), 'error');
  assert.strictEqual(V.checkDay(4), null);
  assert.strictEqual(level(V.checkDay(0)), 'error');
  assert.strictEqual(level(V.checkDay(2.5)), 'error');
  assert.strictEqual(level(V.checkDay(9000)), 'warning');
});
test('weather and aurora values', () => {
  assert.strictEqual(V.checkWeather('Clear', 'Blizzard', 'm_WeatherStageProxy'), null);
  assert.strictEqual(level(V.checkWeather('Clear', 3, 'm_WeatherStageProxy')), 'error');
  assert.strictEqual(V.checkWeather(-3, -10, 'm_TempHighProxy'), null);
  assert.strictEqual(level(V.checkWeather(-3, 'cold', 'm_TempLowProxy')), 'error');
  assert.strictEqual(V.checkFlag(true), null);
  assert.strictEqual(level(V.checkFlag('yes')), 'error');
  assert.strictEqual(V.checkAuroraHours(8), null);
  assert.strictEqual(level(V.checkAuroraHours(-1)), 'error');
  assert.strictEqual(level(V.checkAuroraHours(48)), 'warning');
});
test('duplicates of unique items', () => {
  assert.strictEqual(V.duplicateIssue('Note', 0, 1), null);
  assert.strictEqual(level(V.duplicateIssue('Note', 1, 2)), 'warning');
  assert.strictEqual(V.duplicateIssue('Note', 3, 3), null, 'old duplicates are not reported again');
  assert.match(V.duplicateIssue('Hank\'s Journal', 0, 2).msg, /2 copies of Hank's Journal/);
});
test('values are shown in a readable form', () => {
  assert.strictEqual(V.fmt(12.3456), '12.35');
  assert.strictEqual(V.fmt(true), 'on');
  assert.strictEqual(V.fmt(undefined), 'none');
  assert.strictEqual(V.fmt({ t: 'NaN' }), 'NaN');
});

console.log(failures ? failures + ' of ' + count + ' failed' : 'all ' + count + ' passed');
process.exit(failures ? 1 : 0);
