const test = require('node:test');
const assert = require('node:assert/strict');
const finance = require('../assets/js/tool-finance.js');

test('人民币大写保留金额精度并正确处理连续零', () => {
  assert.deepEqual(finance.rmbUppercase('0'), {
    numeric: '0.00',
    uppercase: '零元整'
  });
  assert.equal(finance.rmbUppercase('1001.01').uppercase, '壹仟零壹元零壹分');
  assert.equal(finance.rmbUppercase('100000001.10').uppercase, '壹亿零壹元壹角');
  assert.equal(
    finance.rmbUppercase('999999999999.99').uppercase,
    '玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元玖角玖分'
  );
});

test('人民币大写拒绝负数、科学计数法、超精度与超范围金额', () => {
  ['-1', '1e3', '0.001', '1000000000000', '', 'abc'].forEach((amount) => {
    assert.throws(() => finance.rmbUppercase(amount), /金额/);
  });
});

test('含税换算按输入方向拆分金额并保持分位守恒', () => {
  assert.deepEqual(finance.taxConversion('exclusive', 100, 13), {
    mode: 'exclusive',
    taxRate: 13,
    netAmount: 100,
    taxAmount: 13,
    grossAmount: 113
  });
  assert.deepEqual(finance.taxConversion('inclusive', 113, 13), {
    mode: 'inclusive',
    taxRate: 13,
    netAmount: 100,
    taxAmount: 13,
    grossAmount: 113
  });
  const rounded = finance.taxConversion('inclusive', 0.1, 13);
  assert.deepEqual(rounded, {
    mode: 'inclusive', taxRate: 13, netAmount: 0.09, taxAmount: 0.01, grossAmount: 0.1
  });
  assert.equal(Math.round((rounded.netAmount + rounded.taxAmount) * 100), Math.round(rounded.grossAmount * 100));
});

test('含税换算校验计算方向、金额和税率', () => {
  assert.throws(() => finance.taxConversion('unknown', 100, 13), /换算方式/);
  assert.throws(() => finance.taxConversion('exclusive', -1, 13), /金额/);
  assert.throws(() => finance.taxConversion('exclusive', 1, 101), /税率/);
});

test('旅行预算将四种计价范围归一为整趟费用', () => {
  const result = finance.travelBudget(2, 3, [
    { name: '往返交通', category: 'transport', scope: 'total', planned: 100, actual: 120 },
    { name: '住宿', category: 'accommodation', scope: 'per-day', planned: 200, actual: 180 },
    { name: '餐饮', category: 'food', scope: 'per-person-day', planned: 50, actual: 60 },
    { name: '门票', category: 'tickets', scope: 'per-person', planned: 80, actual: 80 }
  ]);

  assert.deepEqual(result.items.map((item) => [item.plannedTotal, item.actualTotal]), [
    [100, 120], [600, 540], [300, 360], [160, 160]
  ]);
  assert.deepEqual({
    plannedTotal: result.plannedTotal,
    actualTotal: result.actualTotal,
    balance: result.balance,
    plannedPerPerson: result.plannedPerPerson,
    plannedPerDay: result.plannedPerDay,
    actualPerPerson: result.actualPerPerson,
    actualPerDay: result.actualPerDay,
    actualItemCount: result.actualItemCount
  }, {
    plannedTotal: 1160,
    actualTotal: 1180,
    balance: -20,
    plannedPerPerson: 580,
    plannedPerDay: 386.67,
    actualPerPerson: 590,
    actualPerDay: 393.33,
    actualItemCount: 4
  });
  assert.deepEqual(result.categories.find((item) => item.category === 'food'), {
    category: 'food', planned: 300, actual: 360, plannedShare: 25.86, actualShare: 30.51,
    itemCount: 1, actualItemCount: 1
  });
  assert.equal(result.allActual, true);
});

test('旅行预算允许实际金额留空并校验人数、天数与费用行', () => {
  const result = finance.travelBudget(1, 2, [
    { name: '住宿', category: 'accommodation', scope: 'per-day', planned: 300, actual: null }
  ]);
  assert.equal(result.items[0].actualTotal, null);
  assert.equal(result.actualTotal, 0);
  assert.equal(result.actualItemCount, 0);
  assert.equal(result.allActual, false);
  assert.equal(result.categories[0].actualItemCount, 0);
  assert.throws(() => finance.travelBudget(0, 1, []), /人数/);
  assert.throws(() => finance.travelBudget(1, 0, []), /天数/);
  assert.throws(() => finance.travelBudget(1, 1, []), /费用/);
  assert.throws(() => finance.travelBudget(1, 1, [
    { category: 'food', scope: 'unknown', planned: 1, actual: null }
  ]), /计价范围/);
  assert.throws(() => finance.travelBudget(1, 1, [
    { category: 'food', scope: 'total', planned: -1, actual: null }
  ]), /计划金额/);
});
