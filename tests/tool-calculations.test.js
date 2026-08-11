const test = require('node:test');
const assert = require('node:assert/strict');
const tools = require('../assets/js/tool-calculations.js');
const qrcode = require('../assets/js/vendor/qrcode-generator.js');

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);
}

function sequenceSource(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

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

test('mortgage adjustment keeps a zero-rate loan unchanged', () => {
  const result = tools.mortgageAdjustmentPlan([
    { principal: 120000, oldAnnualRate: 0, newAnnualRate: 0, months: 12 }
  ], 'equal-payment', 2);

  assert.equal(result.remainingPrincipal, 100000);
  assert.equal(result.oldNextPayment, 10000);
  assert.equal(result.newNextPayment, 10000);
  assert.equal(result.paymentChange, 0);
  assert.equal(result.oldRemainingInterest, 0);
  assert.equal(result.newRemainingInterest, 0);
  assert.equal(result.interestChange, 0);
  assert.equal(result.schedule.length, 10);
  assert.deepEqual(result.schedule[0], {
    month: 3,
    oldPayment: 10000,
    newPayment: 10000,
    paymentChange: 0,
    principal: 10000,
    interest: 0,
    remaining: 90000
  });
});

test('mortgage adjustment compares each equal-principal installment after a rate cut', () => {
  const result = tools.mortgageAdjustmentPlan([
    { principal: 120000, oldAnnualRate: 12, newAnnualRate: 6, months: 12 }
  ], 'equal-principal', 2);

  assert.equal(Math.round(result.remainingPrincipal), 100000);
  assert.equal(Math.round(result.oldNextPayment), 11000);
  assert.equal(Math.round(result.newNextPayment), 10500);
  assert.equal(Math.round(result.paymentChange), -500);
  assert.equal(Math.round(result.oldRemainingInterest), 5500);
  assert.equal(Math.round(result.newRemainingInterest), 2750);
  assert.equal(Math.round(result.interestChange), -2750);
  assert.equal(Math.round(result.schedule[9].paymentChange), -50);
});

test('mortgage adjustment rejects invalid loan progress and balances', () => {
  const loan = { principal: 120000, oldAnnualRate: 4, newAnnualRate: 3, months: 12 };

  assert.throws(() => tools.mortgageAdjustmentPlan([loan], 'equal-payment', -1));
  assert.throws(() => tools.mortgageAdjustmentPlan([loan], 'equal-payment', 1.5));
  assert.throws(() => tools.mortgageAdjustmentPlan([loan], 'equal-payment', 12));
  assert.throws(() => tools.mortgageAdjustmentPlan([
    { ...loan, remainingPrincipal: 130000 }
  ], 'equal-payment', 2));
  assert.throws(() => tools.mortgageAdjustmentPlan([
    { ...loan, principal: Infinity }
  ], 'equal-payment', 2), /有限数值/);
  assert.throws(() => tools.mortgageAdjustmentPlan([
    { ...loan, oldAnnualRate: Infinity }
  ], 'equal-payment', 2), /有限数值/);
  assert.throws(() => tools.mortgageAdjustmentPlan([
    { ...loan, remainingPrincipal: Infinity }
  ], 'equal-payment', 2), /有限数值/);
});

test('mortgage adjustment lowers equal-payment costs when a positive rate falls', () => {
  const result = tools.mortgageAdjustmentPlan([
    { principal: 120000, oldAnnualRate: 12, newAnnualRate: 6, months: 12 }
  ], 'equal-payment', 2);

  assert.ok(result.newNextPayment < result.oldNextPayment);
  assert.ok(result.paymentChange < 0);
  assert.ok(result.newRemainingInterest < result.oldRemainingInterest);
  assert.ok(result.interestChange < 0);
});

test('mortgage adjustment merges combination loans with different remaining terms', () => {
  const result = tools.mortgageAdjustmentPlan([
    { principal: 120000, oldAnnualRate: 0, newAnnualRate: 0, months: 12 },
    { principal: 120000, oldAnnualRate: 0, newAnnualRate: 0, months: 24 }
  ], 'equal-payment', 6);

  assert.equal(result.remainingPrincipal, 150000);
  assert.equal(result.oldNextPayment, 15000);
  assert.equal(result.newNextPayment, 15000);
  assert.equal(result.schedule.length, 18);
  assert.equal(result.schedule[0].month, 7);
  assert.equal(result.schedule[6].newPayment, 5000);
  assert.equal(result.schedule[17].remaining, 0);
});

test('mortgage adjustment changes combination components independently', () => {
  const result = tools.mortgageAdjustmentPlan([
    { principal: 120000, oldAnnualRate: 0, newAnnualRate: 0, months: 12 },
    { principal: 120000, oldAnnualRate: 6, newAnnualRate: 3, months: 24 }
  ], 'equal-payment', 6);

  assert.ok(result.paymentChange < 0);
  assert.ok(result.interestChange < 0);
  assert.equal(result.schedule.length, 18);
  assert.ok(result.schedule[6].newPayment < result.schedule[6].oldPayment);
});

test('mortgage adjustment honors a bank balance override and reports a rate increase', () => {
  const result = tools.mortgageAdjustmentPlan([
    { principal: 120000, oldAnnualRate: 0, newAnnualRate: 12, months: 12, remainingPrincipal: 60000 }
  ], 'equal-payment', 2);
  const repaidPrincipal = result.schedule.reduce((sum, row) => sum + row.principal, 0);

  assert.equal(result.remainingPrincipal, 60000);
  assert.equal(result.oldNextPayment, 6000);
  assert.ok(result.newNextPayment > result.oldNextPayment);
  assert.ok(result.paymentChange > 0);
  assert.ok(result.interestChange > 0);
  assert.ok(Math.abs(repaidPrincipal - 60000) < 0.01);
});

test('mortgage adjustment ignores a completed combination component', () => {
  const result = tools.mortgageAdjustmentPlan([
    { principal: 60000, oldAnnualRate: 5, newAnnualRate: 3, months: 6 },
    { principal: 120000, oldAnnualRate: 0, newAnnualRate: 0, months: 12 }
  ], 'equal-payment', 6);

  assert.equal(result.remainingPrincipal, 60000);
  assert.equal(result.schedule.length, 6);
  assert.equal(result.newNextPayment, 10000);
  assert.equal(result.paymentChange, 0);
});

test('mortgage adjustment supports the final remaining installment', () => {
  const result = tools.mortgageAdjustmentPlan([
    { principal: 12000, oldAnnualRate: 0, newAnnualRate: 0, months: 12 }
  ], 'equal-payment', 11);

  assert.equal(result.schedule.length, 1);
  assert.equal(result.schedule[0].month, 12);
  assert.equal(result.schedule[0].remaining, 0);
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

test('case conversion supports prose, naming formats and Unicode text', () => {
  assert.equal(tools.convertCase('Hello WORLD，中文', 'lower'), 'hello world，中文');
  assert.equal(tools.convertCase('hello_world example', 'camel'), 'helloWorldExample');
  assert.equal(tools.convertCase('hello-world example', 'pascal'), 'HelloWorldExample');
  assert.equal(tools.convertCase('HelloWorld example', 'snake'), 'hello_world_example');
  assert.equal(tools.convertCase('HelloWorld example', 'kebab'), 'hello-world-example');
  assert.equal(tools.convertCase('hello. WORLD! again', 'sentence'), 'Hello. World! Again');
  assert.throws(() => tools.convertCase('text', 'unknown'));
});

test('list cleaner trims, removes empty and duplicate lines, and sorts naturally', () => {
  const result = tools.cleanList('  苹果\n香蕉\n苹果\n\n项目10\n项目2', {
    trim: true,
    removeEmpty: true,
    dedupe: true,
    caseSensitive: false,
    sort: 'asc'
  });
  assert.deepEqual(result, {
    value: '苹果\n香蕉\n项目2\n项目10',
    originalLines: 6,
    lines: 4,
    removedEmpty: 1,
    removedDuplicates: 1
  });
  assert.equal(tools.cleanList('A\na\nB', {
    trim: false,
    removeEmpty: false,
    dedupe: true,
    caseSensitive: true,
    sort: 'reverse'
  }).value, 'B\na\nA');
});

test('discount and bill splitting preserve money boundaries', () => {
  assert.deepEqual(tools.discountPlan(100, 8, 15), {
    original: 100,
    beforeCoupon: 80,
    couponApplied: 15,
    finalPrice: 65,
    saved: 35,
    effectiveDiscount: 6.5
  });
  assert.equal(tools.discountPlan(100, 5, 80).finalPrice, 0);
  assert.throws(() => tools.discountPlan(100, 11, 0));

  const split = tools.billSplit(100, 3, 0, 0, 0);
  assert.equal(split.regularShare, 33.33);
  assert.equal(split.lastShare, 33.34);
  assert.equal(split.regularShare * 2 + split.lastShare, split.total);
  assert.throws(() => tools.billSplit(100, 0, 0, 0, 0));
});

test('unit price, percentage and savings calculations cover all modes', () => {
  const prices = tools.compareUnitPrices([
    { name: '小袋', price: 12, amount: 500, unit: 'g' },
    { name: '大袋', price: 20, amount: 1, unit: 'kg' }
  ], 'mass');
  assert.equal(prices.baseUnit, '千克');
  assert.equal(prices.items[0].name, '大袋');
  assert.equal(prices.items[0].unitPrice, 20);
  assertClose(prices.items[1].moreExpensive, 20);
  assert.throws(() => tools.compareUnitPrices([
    { price: 1, amount: 1, unit: 'kg' },
    { price: 1, amount: 1, unit: 'l' }
  ], 'mass'));

  assert.equal(tools.percentageCalculation('share', 25, 200).value, 12.5);
  assert.equal(tools.percentageCalculation('change', 80, 100).value, 25);
  assert.equal(tools.percentageCalculation('adjust', 200, 10, 'decrease').value, 180);
  assert.equal(tools.percentageCalculation('reverse', 90, 10, 'decrease').value, 100);
  assert.throws(() => tools.percentageCalculation('share', 1, 0));

  const zeroRate = tools.savingsGoal(12000, 0, 12, 0, 'ending');
  assert.equal(zeroRate.monthlyDeposit, 1000);
  const ending = tools.savingsGoal(20000, 1000, 12, 6, 'ending');
  const beginning = tools.savingsGoal(20000, 1000, 12, 6, 'beginning');
  assert.ok(beginning.monthlyDeposit < ending.monthlyDeposit);
  assert.equal(tools.savingsGoal(1000, 1200, 12, 3, 'ending').monthlyDeposit, 0);
});

test('exchange rates use a currency-only URL and validate mocked responses', async () => {
  let requestedUrl = '';
  const result = await tools.fetchExchangeRate('cny', 'usd', async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ date: '2026-08-08', rate: 0.1394 }) };
  });
  assert.deepEqual(result, { date: '2026-08-08', base: 'CNY', quote: 'USD', rate: 0.1394 });
  assert.equal(requestedUrl, 'https://api.frankfurter.dev/v2/rate/CNY/USD');
  assert.doesNotMatch(requestedUrl, /amount|100/);
  assert.equal((await tools.fetchExchangeRate('CNY', 'CNY')).rate, 1);
  await assert.rejects(() => tools.fetchExchangeRate('CN', 'USD'), /三位币种代码/);
  await assert.rejects(() => tools.fetchExchangeRate('CNY', 'USD', async () => ({
    ok: true,
    json: async () => ({ date: '2026-08-08' })
  })), /无法识别的数据/);
  await assert.rejects(() => tools.fetchExchangeRate('CNY', 'USD', async () => ({
    ok: false,
    status: 404
  })), /不支持这个币种组合/);
  await assert.rejects(() => tools.fetchExchangeRate('CNY', 'USD', (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  }), 5), /获取汇率超时/);
});

test('unit conversion handles reverse conversions and temperature limits', () => {
  assertClose(tools.convertUnit('length', 1, 'mile', 'km'), 1.609344);
  assertClose(tools.convertUnit('mass', tools.convertUnit('mass', 5, 'kg', 'lb'), 'lb', 'kg'), 5);
  assert.equal(tools.convertUnit('temperature', 0, 'c', 'f'), 32);
  assertClose(tools.convertUnit('temperature', 273.15, 'k', 'c'), 0);
  assert.equal(tools.convertUnit('data', 1, 'GiB', 'MiB'), 1024);
  assert.equal(tools.convertUnit('data', 1, 'GB', 'MB'), 1000);
  assert.throws(() => tools.convertUnit('temperature', -274, 'c', 'f'), /绝对零度/);
  assert.throws(() => tools.convertUnit('mass', 1, 'kg', 'l'));
});

test('age and timezone calculations handle leap birthdays and daylight saving', () => {
  const age = tools.ageCalculation('2000-02-29', '2023-02-28');
  assert.deepEqual({ years: age.years, months: age.months, days: age.days }, { years: 23, months: 0, days: 0 });
  assert.equal(age.nextBirthday, '2023-02-28');
  assert.throws(() => tools.ageCalculation('2026-01-02', '2026-01-01'));

  const conversion = tools.timezoneConversion('2026-01-01T12:00', 'Asia/Shanghai', 'America/New_York');
  assert.equal(conversion.targetValue, '2025-12-31 23:00');
  assert.equal(conversion.utc, '2026-01-01T04:00:00.000Z');
  assert.equal(conversion.dayDifference, -1);
  assert.equal(conversion.ambiguous, false);
  assert.throws(() => tools.zonedDateTimeToDate('2026-03-08T02:30', 'America/New_York'), /不存在/);
  assert.equal(tools.zonedDateTimeToDate('2026-11-01T01:30', 'America/New_York').ambiguous, true);
});

test('fuel, electricity and recipe calculations validate everyday inputs', () => {
  assert.deepEqual(tools.fuelCost(100, 8, 7.5, 2, true), {
    distance: 200,
    liters: 16,
    cost: 120,
    perKilometer: 0.6,
    perPerson: 60
  });
  const electricity = tools.electricityCost(1500, 'w', 2, 30, 0.6);
  assert.equal(electricity.dailyKwh, 3);
  assert.equal(electricity.totalKwh, 90);
  assertClose(electricity.dailyCost, 1.8);
  assertClose(electricity.totalCost, 54);
  assert.deepEqual(tools.scaleRecipe(2, 5, [{ name: '面粉', amount: 100, unit: '克' }]), {
    ratio: 2.5,
    ingredients: [{ name: '面粉', amount: 250, unit: '克' }]
  });
  assert.throws(() => tools.electricityCost(100, 'w', 25, 1, 1));
  assert.throws(() => tools.scaleRecipe(0, 2, []));
});

test('BMI categories use the adult 18.5, 25 and 30 boundaries', () => {
  assert.equal(tools.bmiCalculation(200, 73.99).category, '体重偏低');
  assert.equal(tools.bmiCalculation(200, 74).category, '正常范围');
  assert.equal(tools.bmiCalculation(200, 100).category, '超重范围');
  assert.equal(tools.bmiCalculation(200, 120).category, '肥胖范围');
  const result = tools.bmiCalculation(180, 70);
  assertClose(result.minimumWeight, 18.5 * 1.8 * 1.8);
  assertClose(result.maximumWeight, 24.9 * 1.8 * 1.8);
  assert.throws(() => tools.bmiCalculation(40, 70));
});

test('workday calculations respect inclusivity, holidays and working weekends', () => {
  const defaults = { includeStart: true, includeEnd: true, holidays: [], workingWeekends: [] };
  assert.equal(tools.countWorkdays('2026-08-03', '2026-08-09', defaults), 5);
  assert.equal(tools.countWorkdays('2026-08-03', '2026-08-09', {
    includeStart: true,
    includeEnd: true,
    holidays: ['2026-08-05'],
    workingWeekends: ['2026-08-08']
  }), 5);
  assert.equal(tools.countWorkdays('2026-08-03', '2026-08-07', {
    includeStart: false,
    includeEnd: false,
    holidays: [],
    workingWeekends: []
  }), 3);
  assert.equal(tools.addWorkdays('2026-08-07', 1, 'forward', defaults), '2026-08-10');
  assert.equal(tools.addWorkdays('2026-08-10', 1, 'backward', defaults), '2026-08-07');
  assert.throws(() => tools.countWorkdays('2026-08-02', '2026-08-01', defaults));
});

test('image resize math preserves aspect ratio and never enlarges images', () => {
  assert.deepEqual(tools.resizedDimensions(4000, 2000, 1000, 1000), { width: 1000, height: 500, scale: 0.25 });
  assert.deepEqual(tools.resizedDimensions(640, 480, 1920, 1080), { width: 640, height: 480, scale: 1 });
  assert.deepEqual(tools.resizedDimensions(100, 300, 100, 100), { width: 33, height: 100, scale: 1 / 3 });
  assert.throws(() => tools.resizedDimensions(0, 100, 100, 100));
});

test('random helpers use an injectable source and enforce no-replacement bounds', () => {
  assert.equal(tools.secureRandomBelow(10, () => 42), 2);
  const picked = tools.randomPick('甲\n乙\n甲\n丙', 2, true, sequenceSource([0, 1, 2]));
  assert.equal(picked.candidateCount, 3);
  assert.equal(new Set(picked.selected).size, 2);
  assert.equal(new Set(picked.shuffled).size, 3);

  const dice = tools.rollDice(3, 6, -2, sequenceSource([0, 1, 2]));
  assert.deepEqual(dice, { rolls: [1, 2, 3], subtotal: 6, modifier: -2, total: 4 });
  const integers = tools.randomIntegers(5, 8, 4, sequenceSource([0, 1, 2, 3]));
  assert.equal(integers.length, 4);
  assert.equal(new Set(integers).size, 4);
  integers.forEach((value) => assert.ok(value >= 5 && value <= 8));
  assert.throws(() => tools.randomIntegers(1, 2, 3, () => 0));
});

test('QR helpers escape Wi-Fi fields, enforce UTF-8 size and generate a matrix', () => {
  assert.equal(tools.qrPayload('url', { content: 'example.com/path' }), 'https://example.com/path');
  const wifi = tools.qrPayload('wifi', {
    ssid: '办公室;5G',
    password: 'a:b,c\\d',
    security: 'WPA',
    hidden: true
  });
  assert.equal(wifi, 'WIFI:T:WPA;S:办公室\\;5G;P:a\\:b\\,c\\\\d;H:true;;');
  assert.throws(() => tools.qrPayload('text', { content: '中'.repeat(667) }), /2000/);

  const code = qrcode(0, 'M');
  code.addData('中文 QR test', 'Byte');
  code.make();
  assert.ok(code.getModuleCount() > 0);
  assert.equal(typeof code.isDark(0, 0), 'boolean');
});
