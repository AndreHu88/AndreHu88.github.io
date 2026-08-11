(function (root, factory) {
  var common = root && root.JackToolsCore ? root.JackToolsCore : require('./tool-core.js');
  var api = factory(common);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackToolsCore = Object.assign(root.JackToolsCore || {}, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (common) {
  'use strict';

  var unitCategories = {
    length: { units: { mm: ['毫米', 0.001], cm: ['厘米', 0.01], m: ['米', 1], km: ['千米', 1000], inch: ['英寸', 0.0254], ft: ['英尺', 0.3048], yd: ['码', 0.9144], mile: ['英里', 1609.344] } },
    area: { units: { sqm: ['平方米', 1], sqkm: ['平方千米', 1000000], ha: ['公顷', 10000], mu: ['亩', 2000 / 3], sqft: ['平方英尺', 0.09290304] } },
    mass: { units: { mg: ['毫克', 0.000001], g: ['克', 0.001], kg: ['千克', 1], tonne: ['吨', 1000], oz: ['盎司', 0.028349523125], lb: ['磅', 0.45359237] } },
    volume: { units: { ml: ['毫升', 0.001], l: ['升', 1], cubicm: ['立方米', 1000], tsp: ['美制茶匙', 0.00492892159375], tbsp: ['美制汤匙', 0.01478676478125], cup: ['美制杯', 0.2365882365], gallon: ['美制加仑', 3.785411784] } },
    speed: { units: { mps: ['米/秒', 1], kph: ['千米/小时', 1 / 3.6], mph: ['英里/小时', 0.44704], knot: ['节', 0.514444444444] } },
    data: { units: { B: ['字节（B）', 1], KB: ['千字节（KB）', 1000], MB: ['兆字节（MB）', 1000000], GB: ['吉字节（GB）', 1000000000], TB: ['太字节（TB）', 1000000000000], KiB: ['Kibibyte（KiB）', 1024], MiB: ['Mebibyte（MiB）', 1048576], GiB: ['Gibibyte（GiB）', 1073741824], TiB: ['Tebibyte（TiB）', 1099511627776] } },
    temperature: { units: { c: ['摄氏度（°C）', 1], f: ['华氏度（°F）', 1], k: ['开尔文（K）', 1] } }
  };

  var commonTimeZones = ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Bangkok', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];

  function convertTemperature(value, from, to) {
    var celsius = from === 'c' ? value : from === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
    if (celsius < -273.15 - 1e-9) throw new Error('温度不能低于绝对零度。');
    return to === 'c' ? celsius : to === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15;
  }

  function convertUnit(category, value, from, to) {
    if (!Number.isFinite(value)) throw new Error('请输入有效数值。');
    var definition = unitCategories[category];
    if (!definition || !definition.units[from] || !definition.units[to]) throw new Error('请选择同一类型下的有效单位。');
    if (category === 'temperature') return convertTemperature(value, from, to);
    return value * definition.units[from][1] / definition.units[to][1];
  }

  function utcDateParts(value) {
    var date = common.utcDate(value);
    if (Number.isNaN(date.getTime())) throw new Error('请输入有效日期。');
    return date;
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function clampedUtcDate(year, month, day) {
    return new Date(Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month))));
  }

  function ageCalculation(birthValue, asOfValue) {
    var birth = utcDateParts(birthValue);
    var asOf = utcDateParts(asOfValue);
    if (birth > asOf) throw new Error('出生日期不能晚于计算日期。');
    var years = asOf.getUTCFullYear() - birth.getUTCFullYear();
    var birthdayThisYear = clampedUtcDate(asOf.getUTCFullYear(), birth.getUTCMonth() + 1, birth.getUTCDate());
    if (birthdayThisYear > asOf) years -= 1;
    var cursor = clampedUtcDate(birth.getUTCFullYear() + years, birth.getUTCMonth() + 1, birth.getUTCDate());
    var months = 0;
    while (months < 11) {
      var monthIndex = cursor.getUTCMonth() + 2;
      var targetYear = cursor.getUTCFullYear() + Math.floor((monthIndex - 1) / 12);
      var targetMonth = ((monthIndex - 1) % 12) + 1;
      var next = clampedUtcDate(targetYear, targetMonth, birth.getUTCDate());
      if (next > asOf) break;
      cursor = next;
      months += 1;
    }
    var days = common.daysBetweenUtc(cursor, asOf);
    var nextBirthdayYear = asOf.getUTCFullYear();
    var nextBirthday = clampedUtcDate(nextBirthdayYear, birth.getUTCMonth() + 1, birth.getUTCDate());
    if (nextBirthday < asOf) nextBirthday = clampedUtcDate(nextBirthdayYear + 1, birth.getUTCMonth() + 1, birth.getUTCDate());
    return { years: years, months: months, days: days, totalDays: common.daysBetweenUtc(birth, asOf), nextBirthdayDays: common.daysBetweenUtc(asOf, nextBirthday), nextBirthday: nextBirthday.toISOString().slice(0, 10) };
  }

  function partsInZone(date, timeZone) {
    var formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    var values = {};
    formatter.formatToParts(date).forEach(function (part) { if (part.type !== 'literal') values[part.type] = Number(part.value); });
    return values;
  }

  function parseLocalDateTime(value) {
    var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) throw new Error('请输入有效的日期时间。');
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0) };
  }

  function sameDateTime(left, right) {
    return ['year', 'month', 'day', 'hour', 'minute', 'second'].every(function (key) { return left[key] === right[key]; });
  }

  function zonedDateTimeToDate(value, timeZone) {
    var desired = parseLocalDateTime(value);
    var wallUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second);
    var matches = [];
    for (var offset = -14 * 60; offset <= 14 * 60; offset += 15) {
      var candidate = new Date(wallUtc - offset * 60000);
      if (sameDateTime(partsInZone(candidate, timeZone), desired)) matches.push(candidate);
    }
    if (!matches.length) throw new Error('这个本地时间在所选时区中不存在，可能处于夏令时切换区间。');
    matches.sort(function (left, right) { return left - right; });
    return { date: matches[0], ambiguous: matches.length > 1 };
  }

  function timezoneConversion(value, fromZone, toZone) {
    var source = zonedDateTimeToDate(value, fromZone);
    var targetParts = partsInZone(source.date, toZone);
    var sourceParts = parseLocalDateTime(value);
    var sourceWall = Date.UTC(sourceParts.year, sourceParts.month - 1, sourceParts.day, sourceParts.hour, sourceParts.minute, sourceParts.second);
    var targetWall = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day, targetParts.hour, targetParts.minute, targetParts.second);
    var sourceOffset = Math.round((sourceWall - source.date.getTime()) / 60000);
    var targetOffset = Math.round((targetWall - source.date.getTime()) / 60000);
    var pad = function (number) { return String(number).padStart(2, '0'); };
    var targetValue = targetParts.year + '-' + pad(targetParts.month) + '-' + pad(targetParts.day) + ' ' + pad(targetParts.hour) + ':' + pad(targetParts.minute);
    var dayDifference = Math.round((Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day) - Date.UTC(sourceParts.year, sourceParts.month - 1, sourceParts.day)) / 86400000);
    return { targetValue: targetValue, utc: source.date.toISOString(), offsetMinutes: targetOffset - sourceOffset, dayDifference: dayDifference, ambiguous: source.ambiguous };
  }

  function fuelCost(distance, consumption, price, people, roundTrip) {
    if (![distance, consumption, price].every(Number.isFinite) || distance < 0 || consumption < 0 || price < 0 || !Number.isInteger(people) || people < 1) throw new Error('距离、油耗和油价不能为负，人数需为正整数。');
    var totalDistance = distance * (roundTrip ? 2 : 1);
    var liters = totalDistance * consumption / 100;
    var cost = liters * price;
    return { distance: totalDistance, liters: liters, cost: cost, perKilometer: totalDistance ? cost / totalDistance : 0, perPerson: cost / people };
  }

  function electricityCost(power, powerUnit, hours, days, price) {
    if (![power, hours, price].every(Number.isFinite) || power < 0 || hours < 0 || hours > 24 || !Number.isInteger(days) || days < 1 || price < 0) throw new Error('请检查功率、使用时长、天数和电价。');
    var kilowatts = powerUnit === 'kw' ? power : power / 1000;
    var dailyKwh = kilowatts * hours;
    return { dailyKwh: dailyKwh, totalKwh: dailyKwh * days, dailyCost: dailyKwh * price, totalCost: dailyKwh * days * price };
  }

  function scaleRecipe(originalServings, targetServings, ingredients) {
    if (![originalServings, targetServings].every(Number.isFinite) || originalServings <= 0 || targetServings <= 0 || !Array.isArray(ingredients) || ingredients.length < 1 || ingredients.length > 20) throw new Error('份数需大于零，并填写 1 到 20 项食材。');
    var ratio = targetServings / originalServings;
    return { ratio: ratio, ingredients: ingredients.map(function (item) {
      if (!item.name || !item.unit || !Number.isFinite(item.amount) || item.amount < 0) throw new Error('请完整填写食材名称、非负数量和单位。');
      return { name: item.name, amount: item.amount * ratio, unit: item.unit };
    }) };
  }

  function bmiCalculation(heightCm, weightKg) {
    if (![heightCm, weightKg].every(Number.isFinite) || heightCm < 50 || heightCm > 250 || weightKg < 10 || weightKg > 500) throw new Error('请输入合理范围内的身高和体重。');
    var meters = heightCm / 100;
    var bmi = weightKg / (meters * meters);
    var category = bmi < 18.5 ? '体重偏低' : bmi < 25 ? '正常范围' : bmi < 30 ? '超重范围' : '肥胖范围';
    return { bmi: bmi, category: category, minimumWeight: 18.5 * meters * meters, maximumWeight: 24.9 * meters * meters };
  }

  function dateSet(values) {
    var result = Object.create(null);
    (values || []).forEach(function (value) { if (value) result[value] = true; });
    return result;
  }

  function isWorkday(date, holidays, workingWeekends) {
    var key = date.toISOString().slice(0, 10);
    if (workingWeekends[key]) return true;
    if (holidays[key]) return false;
    var day = date.getUTCDay();
    return day !== 0 && day !== 6;
  }

  function countWorkdays(startValue, endValue, options) {
    var start = utcDateParts(startValue);
    var end = utcDateParts(endValue);
    if (end < start) throw new Error('结束日期不能早于开始日期。');
    var holidays = dateSet(options.holidays);
    var workingWeekends = dateSet(options.workingWeekends);
    var count = 0;
    for (var cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      var isStart = cursor.getTime() === start.getTime();
      var isEnd = cursor.getTime() === end.getTime();
      if ((isStart && !options.includeStart) || (isEnd && !options.includeEnd)) continue;
      if (isWorkday(cursor, holidays, workingWeekends)) count += 1;
    }
    return count;
  }

  function addWorkdays(startValue, amount, direction, options) {
    if (!Number.isInteger(amount) || amount < 0) throw new Error('工作日数量需为非负整数。');
    var cursor = utcDateParts(startValue);
    var holidays = dateSet(options.holidays);
    var workingWeekends = dateSet(options.workingWeekends);
    var step = direction === 'backward' ? -1 : 1;
    var remaining = amount;
    while (remaining > 0) {
      cursor.setUTCDate(cursor.getUTCDate() + step);
      if (isWorkday(cursor, holidays, workingWeekends)) remaining -= 1;
    }
    return cursor.toISOString().slice(0, 10);
  }

  function resizedDimensions(width, height, maximumWidth, maximumHeight) {
    if (width <= 0 || height <= 0) throw new Error('图片尺寸无效。');
    var maxWidth = maximumWidth > 0 ? maximumWidth : width;
    var maxHeight = maximumHeight > 0 ? maximumHeight : height;
    var scale = Math.min(1, maxWidth / width, maxHeight / height);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale: scale };
  }

  function validDateTime(value) {
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('请输入有效的日期时间。');
    return date;
  }

  function localDateTimeText(date) {
    var pad = function (value) { return String(value).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' +
      pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function localDayNumber(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  }

  function dateTimeAmount(value, name) {
    var number = Number(value || 0);
    if (!Number.isInteger(number) || number < 0) throw new Error(name + '需为非负整数。');
    return number;
  }

  function adjustDateTime(value, direction, amounts) {
    if (direction !== 'add' && direction !== 'subtract') throw new Error('请选择增加或减少时间。');
    var source = validDateTime(value);
    var result = new Date(source.getTime());
    var values = amounts || {};
    var days = dateTimeAmount(values.days, '天数');
    var hours = dateTimeAmount(values.hours, '小时');
    var minutes = dateTimeAmount(values.minutes, '分钟');
    var seconds = dateTimeAmount(values.seconds, '秒数');
    var multiplier = direction === 'subtract' ? -1 : 1;
    result.setDate(result.getDate() + multiplier * days);
    result.setSeconds(result.getSeconds() + multiplier * (hours * 3600 + minutes * 60 + seconds));
    if (Number.isNaN(result.getTime())) throw new Error('计算结果超出支持的日期范围。');
    return {
      date: result,
      localValue: localDateTimeText(result),
      dayDifference: localDayNumber(result) - localDayNumber(source),
      timezoneOffsetMinutes: -result.getTimezoneOffset()
    };
  }

  function dateTimeDifference(startValue, endValue) {
    var difference = validDateTime(endValue).getTime() - validDateTime(startValue).getTime();
    var absolute = Math.abs(difference);
    var totalSeconds = Math.floor(absolute / 1000);
    return {
      direction: difference === 0 ? 'same' : difference > 0 ? 'after' : 'before',
      signedMilliseconds: difference,
      totalSeconds: totalSeconds,
      totalMinutes: absolute / 60000,
      totalHours: absolute / 3600000,
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor(totalSeconds % 86400 / 3600),
      minutes: Math.floor(totalSeconds % 3600 / 60),
      seconds: totalSeconds % 60
    };
  }

  function annualEventDate(source, year) {
    var month = source.getMonth();
    var day = source.getDate();
    var lastDay = new Date(year, month + 1, 0).getDate();
    var adjustedDay = Math.min(day, lastDay);
    return {
      date: new Date(year, month, adjustedDay, source.getHours(), source.getMinutes(), source.getSeconds()),
      adjustedLeapDay: month === 1 && day === 29 && adjustedDay === 28
    };
  }

  function countdownStatus(eventName, targetValue, repeat, nowValue) {
    var name = String(eventName || '').trim();
    if (!name) throw new Error('请输入事件名称。');
    if (repeat !== 'once' && repeat !== 'yearly') throw new Error('请选择有效的重复方式。');
    var originalTarget = validDateTime(targetValue);
    var now = validDateTime(nowValue === undefined ? new Date() : nowValue);
    var target = originalTarget;
    var adjustedLeapDay = false;
    if (repeat === 'yearly') {
      var candidate = annualEventDate(originalTarget, now.getFullYear());
      if (candidate.date < now) candidate = annualEventDate(originalTarget, now.getFullYear() + 1);
      target = candidate.date;
      adjustedLeapDay = candidate.adjustedLeapDay;
    }
    var difference = target.getTime() - now.getTime();
    var totalSeconds = Math.floor(Math.abs(difference) / 1000);
    return {
      eventName: name,
      target: target,
      targetValue: localDateTimeText(target),
      status: difference === 0 ? 'now' : difference > 0 ? 'upcoming' : 'elapsed',
      yearly: repeat === 'yearly',
      adjustedLeapDay: adjustedLeapDay,
      totalSeconds: totalSeconds,
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor(totalSeconds % 86400 / 3600),
      minutes: Math.floor(totalSeconds % 3600 / 60),
      seconds: totalSeconds % 60
    };
  }

  function roundedPackageWeight(weight, rule) {
    if (rule === 'none') return weight;
    if (rule === 'half') return Math.ceil(weight * 2 - 1e-12) / 2;
    if (rule === 'whole') return Math.ceil(weight - 1e-12);
    throw new Error('请选择有效的计费重进位规则。');
  }

  function dimensionalWeight(packages, options) {
    if (!Array.isArray(packages) || packages.length < 1 || packages.length > 10) throw new Error('请填写 1 到 10 种包裹。');
    var settings = options || {};
    if (settings.lengthUnit !== 'cm' && settings.lengthUnit !== 'in') throw new Error('请选择厘米或英寸作为尺寸单位。');
    if (settings.weightUnit !== 'kg' && settings.weightUnit !== 'lb') throw new Error('请选择千克或磅作为重量单位。');
    if (!Number.isFinite(settings.divisor) || settings.divisor <= 0) throw new Error('体积系数需大于零。');
    var lengthFactor = settings.lengthUnit === 'in' ? 2.54 : 1;
    var weightFactor = settings.weightUnit === 'lb' ? 0.45359237 : 1;
    var totals = { actual: 0, volumetric: 0, chargeable: 0 };
    var items = packages.map(function (item, index) {
      var dimensions = [item.length, item.width, item.height];
      if (!dimensions.every(function (value) { return Number.isFinite(value) && value > 0; })) throw new Error('包裹 ' + (index + 1) + ' 的长宽高需大于零。');
      if (!Number.isFinite(item.actualWeight) || item.actualWeight < 0) throw new Error('包裹 ' + (index + 1) + ' 的实际重量不能为负。');
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) throw new Error('包裹 ' + (index + 1) + ' 的数量需为 1 到 1000 的整数。');
      var actualWeightKg = item.actualWeight * weightFactor;
      var volumetricWeightKg = dimensions.reduce(function (volume, value) { return volume * value * lengthFactor; }, 1) / settings.divisor;
      var chargeableWeightKg = roundedPackageWeight(Math.max(actualWeightKg, volumetricWeightKg), settings.rounding);
      totals.actual += actualWeightKg * item.quantity;
      totals.volumetric += volumetricWeightKg * item.quantity;
      totals.chargeable += chargeableWeightKg * item.quantity;
      return {
        name: String(item.name || '').trim() || '包裹 ' + (index + 1),
        quantity: item.quantity,
        actualWeightKg: actualWeightKg,
        volumetricWeightKg: volumetricWeightKg,
        chargeableWeightKg: chargeableWeightKg,
        totalChargeableWeightKg: chargeableWeightKg * item.quantity
      };
    });
    return {
      items: items,
      totalActualWeightKg: totals.actual,
      totalVolumetricWeightKg: totals.volumetric,
      totalChargeableWeightKg: totals.chargeable,
      divisor: settings.divisor,
      rounding: settings.rounding
    };
  }

  function positiveRenovationValue(value, label) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(label + '需大于零。');
    return value;
  }

  function tidyDecimal(value) {
    return Math.round(value * 1e12) / 1e12;
  }

  function renovationAreas(mode, values) {
    var grossArea;
    if (values.areaMode === 'direct') {
      grossArea = positiveRenovationValue(values.area, '施工面积');
    } else if (values.areaMode === 'room') {
      var length = positiveRenovationValue(values.length, '房间长度');
      var width = positiveRenovationValue(values.width, '房间宽度');
      grossArea = mode === 'flooring' ? length * width : 2 * (length + width) * positiveRenovationValue(values.height, '房间高度');
    } else {
      throw new Error('请选择房间尺寸或直接面积。');
    }
    var deductions = values.deductions === undefined || values.deductions === '' ? 0 : values.deductions;
    var wastePercent = values.wastePercent === undefined || values.wastePercent === '' ? 0 : values.wastePercent;
    if (!Number.isFinite(deductions) || deductions < 0 || deductions >= grossArea) throw new Error('扣除面积需非负且小于施工总面积。');
    if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 100) throw new Error('损耗率需在 0% 到 100% 之间。');
    var netArea = grossArea - deductions;
    return {
      grossArea: tidyDecimal(grossArea),
      netArea: tidyDecimal(netArea),
      areaWithWaste: tidyDecimal(netArea * (1 + wastePercent / 100))
    };
  }

  function renovationEstimate(mode, input) {
    if (['paint', 'flooring', 'wallpaper'].indexOf(mode) === -1) throw new Error('请选择有效的装修用量模式。');
    var values = input || {};
    var areas = renovationAreas(mode, values);
    var result = { mode: mode, grossArea: areas.grossArea, netArea: areas.netArea, areaWithWaste: areas.areaWithWaste };
    if (mode === 'paint') {
      if (!Number.isInteger(values.coats) || values.coats < 1 || values.coats > 10) throw new Error('施工遍数需为 1 到 10 的整数。');
      var coverage = positiveRenovationValue(values.coverage, '每升覆盖面积');
      var paintPackage = positiveRenovationValue(values.packageSize, '包装容量');
      result.theoreticalAmount = tidyDecimal(areas.areaWithWaste * values.coats / coverage);
      result.purchaseUnits = Math.ceil(result.theoreticalAmount / paintPackage);
      result.unit = '桶';
    } else if (mode === 'flooring') {
      var pieceArea = positiveRenovationValue(values.pieceLengthCm, '单片长度') * positiveRenovationValue(values.pieceWidthCm, '单片宽度') / 10000;
      if (!Number.isInteger(values.piecesPerPackage) || values.piecesPerPackage < 1) throw new Error('每包装片数需为正整数。');
      result.theoreticalAmount = areas.areaWithWaste;
      result.pieces = Math.ceil(areas.areaWithWaste / pieceArea);
      result.purchaseUnits = Math.ceil(result.pieces / values.piecesPerPackage);
      result.unit = '包装';
    } else {
      var rollArea = positiveRenovationValue(values.rollWidth, '单卷宽度') * positiveRenovationValue(values.rollLength, '单卷长度');
      result.theoreticalAmount = tidyDecimal(areas.areaWithWaste / rollArea);
      result.purchaseUnits = Math.ceil(result.theoreticalAmount);
      result.unit = '卷';
    }
    return result;
  }

  return {
    unitCategories: unitCategories,
    commonTimeZones: commonTimeZones,
    convertUnit: convertUnit,
    ageCalculation: ageCalculation,
    zonedDateTimeToDate: zonedDateTimeToDate,
    timezoneConversion: timezoneConversion,
    fuelCost: fuelCost,
    electricityCost: electricityCost,
    scaleRecipe: scaleRecipe,
    bmiCalculation: bmiCalculation,
    countWorkdays: countWorkdays,
    addWorkdays: addWorkdays,
    resizedDimensions: resizedDimensions,
    adjustDateTime: adjustDateTime,
    dateTimeDifference: dateTimeDifference,
    countdownStatus: countdownStatus,
    dimensionalWeight: dimensionalWeight,
    renovationEstimate: renovationEstimate
  };
}));
