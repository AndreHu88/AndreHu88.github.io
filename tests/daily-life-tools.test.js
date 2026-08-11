const test = require('node:test');
const assert = require('node:assert/strict');
const life = require('../assets/js/tool-life.js');

test('time calculator crosses month boundaries and describes reverse intervals', () => {
  const adjusted = life.adjustDateTime('2028-02-28T23:30:00', 'add', {
    days: 1,
    hours: 2,
    minutes: 45,
    seconds: 30
  });
  assert.equal(adjusted.localValue, '2028-03-01T02:15:30');
  assert.equal(adjusted.dayDifference, 2);

  const interval = life.dateTimeDifference('2026-08-12T12:00:00', '2026-08-10T09:30:00');
  assert.equal(interval.direction, 'before');
  assert.equal(interval.days, 2);
  assert.equal(interval.hours, 2);
  assert.equal(interval.minutes, 30);
  assert.equal(interval.totalHours, 50.5);
  assert.throws(() => life.adjustDateTime('invalid', 'add', { days: 1 }), /有效的日期时间/);
});

test('countdown handles elapsed events and annual leap-day events', () => {
  const elapsed = life.countdownStatus('出发', '2026-08-10T08:00:00', 'once', '2026-08-12T10:30:45');
  assert.equal(elapsed.status, 'elapsed');
  assert.deepEqual(
    { days: elapsed.days, hours: elapsed.hours, minutes: elapsed.minutes, seconds: elapsed.seconds },
    { days: 2, hours: 2, minutes: 30, seconds: 45 }
  );

  const annual = life.countdownStatus('纪念日', '2024-02-29T08:00:00', 'yearly', '2025-02-28T07:00:00');
  assert.equal(annual.status, 'upcoming');
  assert.equal(annual.adjustedLeapDay, true);
  assert.equal(annual.targetValue, '2025-02-28T08:00:00');
  assert.equal(annual.totalSeconds, 3600);
  assert.throws(() => life.countdownStatus('', '2026-08-12T10:00:00', 'once', '2026-08-12T09:00:00'), /事件名称/);
});

test('dimensional weight normalizes units and rounds each package before totaling', () => {
  const metric = life.dimensionalWeight([{
    name: '纸箱', quantity: 2, length: 50, width: 40, height: 30, actualWeight: 8
  }], { lengthUnit: 'cm', weightUnit: 'kg', divisor: 6000, rounding: 'none' });
  assert.equal(metric.items[0].volumetricWeightKg, 10);
  assert.equal(metric.items[0].chargeableWeightKg, 10);
  assert.equal(metric.totalActualWeightKg, 16);
  assert.equal(metric.totalChargeableWeightKg, 20);

  const imperial = life.dimensionalWeight([{
    name: '样品', quantity: 1, length: 10, width: 10, height: 10, actualWeight: 5
  }], { lengthUnit: 'in', weightUnit: 'lb', divisor: 6000, rounding: 'half' });
  assert.ok(Math.abs(imperial.items[0].actualWeightKg - 2.26796185) < 1e-8);
  assert.ok(Math.abs(imperial.items[0].volumetricWeightKg - 2.731177333333333) < 1e-9);
  assert.equal(imperial.items[0].chargeableWeightKg, 3);
  assert.throws(() => life.dimensionalWeight([], { divisor: 6000 }), /1 到 10/);
});

test('renovation estimator covers paint, flooring and wallpaper purchase units', () => {
  const paint = life.renovationEstimate('paint', {
    areaMode: 'room', length: 4, width: 3, height: 2.5, deductions: 5,
    wastePercent: 10, coats: 2, coverage: 10, packageSize: 5
  });
  assert.deepEqual(
    { grossArea: paint.grossArea, netArea: paint.netArea, areaWithWaste: paint.areaWithWaste },
    { grossArea: 35, netArea: 30, areaWithWaste: 33 }
  );
  assert.ok(Math.abs(paint.theoreticalAmount - 6.6) < 1e-9);
  assert.equal(paint.purchaseUnits, 2);
  assert.equal(paint.unit, '桶');

  const flooring = life.renovationEstimate('flooring', {
    areaMode: 'direct', area: 20, deductions: 0, wastePercent: 10,
    pieceLengthCm: 60, pieceWidthCm: 60, piecesPerPackage: 4
  });
  assert.equal(flooring.areaWithWaste, 22);
  assert.equal(flooring.pieces, 62);
  assert.equal(flooring.purchaseUnits, 16);

  const wallpaper = life.renovationEstimate('wallpaper', {
    areaMode: 'direct', area: 40, deductions: 4, wastePercent: 5,
    rollWidth: 0.53, rollLength: 10
  });
  assert.equal(wallpaper.areaWithWaste, 37.8);
  assert.equal(wallpaper.purchaseUnits, 8);
  assert.throws(() => life.renovationEstimate('paint', {
    areaMode: 'direct', area: 5, deductions: 5, wastePercent: 0,
    coats: 1, coverage: 10, packageSize: 5
  }), /扣除面积/);
});
