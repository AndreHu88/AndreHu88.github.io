const test = require('node:test');
const assert = require('node:assert/strict');
const tools = require('../assets/js/tool-calculations.js');

test('Base64 round-trips Unicode text', () => {
  const source = 'Jack Hu · 中文 🚀';
  assert.equal(tools.base64ToUtf8(tools.utf8ToBase64(source)), source);
  assert.throws(() => tools.base64ToUtf8('%%%'));
});

test('text statistics count code points and UTF-8 bytes', () => {
  const result = tools.countText('你好 Jack\n🚀');
  assert.equal(result.characters, 9);
  assert.equal(result.han, 2);
  assert.equal(result.words, 1);
  assert.equal(result.lines, 2);
  assert.equal(result.bytes, 16);
});

test('URL and JSON helpers report invalid input', () => {
  assert.equal(tools.decodeUrl(tools.encodeUrl('a=b 中文', true), true), 'a=b 中文');
  assert.throws(() => tools.decodeUrl('%E0%A4%A', true));
  assert.equal(tools.formatJson('{"a":1}', false), '{\n  "a": 1\n}');
  assert.throws(() => tools.formatJson('{a:1}', false));
});

test('hash helper matches the standard SHA-256 vector', async () => {
  assert.equal(
    await tools.hashText('abc', 'SHA-256'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('timestamp helper recognizes seconds, milliseconds and invalid input', () => {
  assert.equal(tools.parseTimestamp('0').toISOString(), '1970-01-01T00:00:00.000Z');
  assert.equal(tools.parseTimestamp('1772942400000').getTime(), 1772942400000);
  assert.throws(() => tools.parseTimestamp('not-a-date'));
});

test('color conversion supports HEX, RGB and HSL', () => {
  assert.deepEqual(tools.colorFormats('#3366FF'), {
    hex: '#3366FF', rgb: 'rgb(51, 102, 255)', hsl: 'hsl(225, 100%, 60%)'
  });
  assert.equal(tools.colorFormats('hsl(0, 100%, 50%)').hex, '#FF0000');
  assert.throws(() => tools.colorFormats('not-a-color'));
});

test('mortgage handles zero rate and mixed terms', () => {
  const zeroRate = tools.mortgagePlan([{ principal: 120000, annualRate: 0, months: 12 }], 'equal-payment');
  assert.equal(Math.round(zeroRate.schedule[0].payment), 10000);
  assert.equal(Math.round(zeroRate.totalInterest), 0);
  const mixed = tools.mortgagePlan([
    { principal: 100000, annualRate: 3, months: 12 },
    { principal: 200000, annualRate: 4, months: 24 }
  ], 'equal-principal');
  assert.equal(mixed.schedule.length, 24);
  assert.ok(mixed.schedule[0].payment > mixed.schedule[12].payment);
});

test('compound, CAGR and recurring investment calculations cover boundaries', () => {
  assert.equal(Math.round(tools.compoundInterest(10000, 0, 10, 12).finalAmount), 10000);
  assert.ok(tools.compoundInterest(10000, 12, 1, 12).finalAmount > tools.compoundInterest(10000, 12, 1, 1).finalAmount);
  assert.ok(Math.abs(tools.cagr(100, 121, 730.485) - 10) < 0.01);
  assert.ok(tools.cagr(100, 81, 730.485) < 0);
  assert.equal(tools.cagr(100, 0, 365.2425), -100);
  assert.throws(() => tools.cagr(0, 100, 365.2425));
  assert.throws(() => tools.cagr(100, 120, 0));
  assert.throws(() => tools.cagr(100, 120, -365));
  const ending = tools.recurringInvestment(1000, 6, 1, 12, 'ending');
  const beginning = tools.recurringInvestment(1000, 6, 1, 12, 'beginning');
  assert.equal(ending.contributed, 12000);
  assert.ok(beginning.finalAmount > ending.finalAmount);
});

test('date difference handles inclusivity and reversed dates', () => {
  assert.equal(tools.dateDifference('2026-01-01', '2026-01-08', false).days, 7);
  assert.equal(tools.dateDifference('2026-01-01', '2026-01-08', true).days, 8);
  assert.deepEqual(tools.dateDifference('2026-01-31', '2026-02-28', false), {
    days: 28, weeks: 4, years: 0, months: 1, remainingDays: 0
  });
  assert.throws(() => tools.dateDifference('2026-02-01', '2026-01-01', false));
});
