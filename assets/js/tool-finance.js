(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackToolsCore = Object.assign(root.JackToolsCore || {}, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function mortgageComponent(principal, annualRate, months, method) {
    var monthlyRate = annualRate / 1200;
    var remaining = principal;
    var schedule = [];
    var fixedPayment = monthlyRate === 0 ? principal / months : principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
    for (var month = 1; month <= months; month += 1) {
      var principalPayment = method === 'equal-principal' ? principal / months : fixedPayment - remaining * monthlyRate;
      var interest = remaining * monthlyRate;
      var payment = principalPayment + interest;
      remaining = Math.max(0, remaining - principalPayment);
      schedule.push({ month: month, payment: payment, principal: principalPayment, interest: interest, remaining: remaining });
    }
    return schedule;
  }

  function mortgagePlan(components, method) {
    var schedules = components.filter(function (item) { return item.principal > 0 && item.months > 0; }).map(function (item) {
      return mortgageComponent(item.principal, item.annualRate, item.months, method);
    });
    var length = schedules.reduce(function (maximum, schedule) { return Math.max(maximum, schedule.length); }, 0);
    var merged = [];
    for (var index = 0; index < length; index += 1) {
      merged.push(schedules.reduce(function (row, schedule) {
        var item = schedule[index];
        if (!item) return row;
        row.payment += item.payment;
        row.principal += item.principal;
        row.interest += item.interest;
        row.remaining += item.remaining;
        return row;
      }, { month: index + 1, payment: 0, principal: 0, interest: 0, remaining: 0 }));
    }
    var totalPrincipal = components.reduce(function (sum, item) { return sum + item.principal; }, 0);
    var totalPayment = merged.reduce(function (sum, row) { return sum + row.payment; }, 0);
    return { schedule: merged, totalPrincipal: totalPrincipal, totalPayment: totalPayment, totalInterest: totalPayment - totalPrincipal };
  }

  function validateMortgageAdjustment(components, method, paidMonths) {
    if (!Array.isArray(components) || components.length === 0) throw new Error('请至少填写一笔贷款。');
    if (method !== 'equal-payment' && method !== 'equal-principal') throw new Error('请选择有效的还款方式。');
    if (!Number.isInteger(paidMonths) || paidMonths < 0) throw new Error('已还期数必须是大于或等于零的整数。');
    components.forEach(function (component) {
      if (![component.principal, component.oldAnnualRate, component.newAnnualRate].every(Number.isFinite)) throw new Error('贷款金额和利率必须是有限数值。');
      if (!(component.principal > 0)) throw new Error('原贷款金额必须大于零。');
      if (!Number.isInteger(component.months) || component.months <= 0) throw new Error('贷款期限必须是完整月数。');
      if (!(component.oldAnnualRate >= 0) || !(component.newAnnualRate >= 0)) throw new Error('贷款利率不能为负数。');
      if (component.remainingPrincipal != null && !Number.isFinite(component.remainingPrincipal)) throw new Error('当前剩余本金必须是有限数值。');
      if (component.remainingPrincipal != null && (!(component.remainingPrincipal > 0) || component.remainingPrincipal > component.principal)) {
        throw new Error('当前剩余本金必须大于零且不能超过原贷款金额。');
      }
    });
    if (!components.some(function (component) { return component.months > paidMonths; })) throw new Error('贷款已经全部还清。');
  }

  function mortgageAdjustmentPlan(components, method, paidMonths) {
    validateMortgageAdjustment(components, method, paidMonths);
    var activeComponents = components.filter(function (component) { return component.months > paidMonths; }).map(function (component) {
      var originalSchedule = mortgageComponent(component.principal, component.oldAnnualRate, component.months, method);
      var inferredRemaining = paidMonths === 0 ? component.principal : originalSchedule[paidMonths - 1].remaining;
      return {
        remainingPrincipal: component.remainingPrincipal == null ? inferredRemaining : component.remainingPrincipal,
        oldAnnualRate: component.oldAnnualRate,
        newAnnualRate: component.newAnnualRate,
        remainingMonths: component.months - paidMonths
      };
    });
    var oldPlan = mortgagePlan(activeComponents.map(function (component) {
      return { principal: component.remainingPrincipal, annualRate: component.oldAnnualRate, months: component.remainingMonths };
    }), method);
    var newPlan = mortgagePlan(activeComponents.map(function (component) {
      return { principal: component.remainingPrincipal, annualRate: component.newAnnualRate, months: component.remainingMonths };
    }), method);
    var schedule = newPlan.schedule.map(function (row, index) {
      return {
        month: paidMonths + index + 1,
        oldPayment: oldPlan.schedule[index].payment,
        newPayment: row.payment,
        paymentChange: row.payment - oldPlan.schedule[index].payment,
        principal: row.principal,
        interest: row.interest,
        remaining: row.remaining
      };
    });
    return {
      remainingPrincipal: newPlan.totalPrincipal,
      oldNextPayment: oldPlan.schedule[0].payment,
      newNextPayment: newPlan.schedule[0].payment,
      paymentChange: newPlan.schedule[0].payment - oldPlan.schedule[0].payment,
      oldRemainingInterest: oldPlan.totalInterest,
      newRemainingInterest: newPlan.totalInterest,
      interestChange: newPlan.totalInterest - oldPlan.totalInterest,
      schedule: schedule
    };
  }

  function compoundInterest(principal, annualRate, years, compoundsPerYear) {
    var periods = years * compoundsPerYear;
    var finalAmount = principal * Math.pow(1 + annualRate / 100 / compoundsPerYear, periods);
    return { principal: principal, earnings: finalAmount - principal, finalAmount: finalAmount };
  }

  function cagr(startValue, endValue, days) {
    if (startValue <= 0 || endValue < 0 || days <= 0) throw new Error('起始金额需大于零，结束金额不能为负，且结束日期必须晚于开始日期。');
    return (Math.pow(endValue / startValue, 365.2425 / days) - 1) * 100;
  }

  function recurringInvestment(payment, annualRate, years, periodsPerYear, timing) {
    var periods = Math.round(years * periodsPerYear);
    var periodicRate = annualRate / 100 / periodsPerYear;
    var balance = 0;
    for (var period = 0; period < periods; period += 1) {
      if (timing === 'beginning') balance += payment;
      balance *= 1 + periodicRate;
      if (timing !== 'beginning') balance += payment;
    }
    var contributed = payment * periods;
    return { contributed: contributed, earnings: balance - contributed, finalAmount: balance, periods: periods };
  }

  function discountPlan(original, discount, coupon) {
    if (![original, discount, coupon].every(Number.isFinite) || original < 0 || discount < 0 || discount > 10 || coupon < 0) throw new Error('原价和优惠不能为负，折数需在 0 到 10 之间。');
    var beforeCoupon = original * discount / 10;
    var finalPrice = Math.max(0, beforeCoupon - coupon);
    var saved = original - finalPrice;
    return { original: original, beforeCoupon: beforeCoupon, couponApplied: beforeCoupon - finalPrice, finalPrice: finalPrice, saved: saved, effectiveDiscount: original === 0 ? 0 : finalPrice / original * 10 };
  }

  function billSplit(subtotal, people, serviceRate, tipRate, discountAmount) {
    if (![subtotal, serviceRate, tipRate, discountAmount].every(Number.isFinite) || subtotal < 0 || !Number.isInteger(people) || people < 1 || people > 100 || serviceRate < 0 || tipRate < 0 || discountAmount < 0) throw new Error('请检查账单金额、人数和附加费用。');
    var service = subtotal * serviceRate / 100;
    var tip = subtotal * tipRate / 100;
    var totalCents = Math.max(0, Math.round((subtotal + service + tip - discountAmount) * 100));
    var regularCents = Math.floor(totalCents / people);
    var lastCents = totalCents - regularCents * (people - 1);
    return { service: service, tip: tip, discountApplied: Math.min(discountAmount, subtotal + service + tip), total: totalCents / 100, regularShare: regularCents / 100, lastShare: lastCents / 100, people: people };
  }

  var priceUnitFactors = {
    mass: { g: 0.001, kg: 1 },
    volume: { ml: 0.001, l: 1 },
    count: { item: 1 }
  };

  function compareUnitPrices(items, dimension) {
    var factors = priceUnitFactors[dimension];
    if (!factors || !Array.isArray(items) || items.length < 2 || items.length > 5) throw new Error('请选择比较类型，并填写 2 到 5 件商品。');
    var compared = items.map(function (item) {
      var factor = factors[item.unit];
      if (!factor || !Number.isFinite(item.price) || !Number.isFinite(item.amount) || item.price <= 0 || item.amount <= 0) throw new Error('商品价格和规格必须大于零，且单位需与比较类型一致。');
      return { name: item.name || '未命名商品', price: item.price, normalizedAmount: item.amount * factor, unitPrice: item.price / (item.amount * factor) };
    }).sort(function (left, right) { return left.unitPrice - right.unitPrice; });
    var cheapest = compared[0].unitPrice;
    compared.forEach(function (item) { item.moreExpensive = cheapest === 0 ? 0 : (item.unitPrice / cheapest - 1) * 100; });
    return { items: compared, baseUnit: dimension === 'mass' ? '千克' : dimension === 'volume' ? '升' : '件' };
  }

  function percentageCalculation(mode, a, b, direction) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('请填写有效数值。');
    if (mode === 'share') {
      if (b === 0) throw new Error('作为整体的数值 B 不能为零。');
      return { value: a / b * 100, formula: a + ' ÷ ' + b + ' × 100%' };
    }
    if (mode === 'change') {
      if (a === 0) throw new Error('作为原值的数值 A 不能为零。');
      return { value: (b - a) / Math.abs(a) * 100, formula: '(' + b + ' − ' + a + ') ÷ |' + a + '| × 100%' };
    }
    var sign = direction === 'decrease' ? -1 : 1;
    if (mode === 'adjust') return { value: a * (1 + sign * b / 100), formula: a + ' × (1 ' + (sign < 0 ? '−' : '+') + ' ' + b + '%)' };
    if (mode === 'reverse') {
      var divisor = 1 + sign * b / 100;
      if (divisor === 0) throw new Error('变化比例使原值无法反推。');
      return { value: a / divisor, formula: a + ' ÷ (1 ' + (sign < 0 ? '−' : '+') + ' ' + b + '%)' };
    }
    throw new Error('不支持这个百分比计算方式。');
  }

  function savingsGoal(target, current, months, annualRate, timing) {
    if (![target, current, annualRate].every(Number.isFinite) || target <= 0 || current < 0 || !Number.isInteger(months) || months < 1 || annualRate < 0) throw new Error('目标需大于零，期限需为正整数，已有金额和收益率不能为负。');
    var monthlyRate = annualRate / 1200;
    var growth = Math.pow(1 + monthlyRate, months);
    var currentFuture = current * growth;
    var annuityFactor = monthlyRate === 0 ? months : (growth - 1) / monthlyRate;
    if (timing === 'beginning') annuityFactor *= 1 + monthlyRate;
    var monthlyDeposit = Math.max(0, (target - currentFuture) / annuityFactor);
    var finalAmount = currentFuture + monthlyDeposit * annuityFactor;
    var contributed = current + monthlyDeposit * months;
    return { monthlyDeposit: monthlyDeposit, contributed: contributed, earnings: finalAmount - contributed, finalAmount: finalAmount, months: months };
  }

  var uppercaseDigits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  var groupUnits = ['', '万', '亿'];

  function uppercaseFourDigits(value) {
    var digits = String(value).padStart(4, '0').split('').map(Number);
    var placeUnits = ['仟', '佰', '拾', ''];
    var result = '';
    var pendingZero = false;
    digits.forEach(function (digit, index) {
      if (digit === 0) {
        if (result) pendingZero = true;
        return;
      }
      if (pendingZero) result += uppercaseDigits[0];
      result += uppercaseDigits[digit] + placeUnits[index];
      pendingZero = false;
    });
    return result;
  }

  function uppercaseInteger(integerText) {
    if (integerText === '0') return uppercaseDigits[0];
    var groups = [];
    for (var end = integerText.length; end > 0; end -= 4) {
      groups.push(Number(integerText.slice(Math.max(0, end - 4), end)));
    }
    var result = '';
    var skippedGroup = false;
    for (var index = groups.length - 1; index >= 0; index -= 1) {
      var group = groups[index];
      if (group === 0) {
        if (result) skippedGroup = true;
        continue;
      }
      if (result && (skippedGroup || group < 1000) && !result.endsWith(uppercaseDigits[0])) result += uppercaseDigits[0];
      result += uppercaseFourDigits(group) + groupUnits[index];
      skippedGroup = false;
    }
    return result;
  }

  function rmbUppercase(amount) {
    var source = String(amount === undefined || amount === null ? '' : amount).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(source)) throw new Error('请输入有效金额，最多保留两位小数。');
    var parts = source.split('.');
    var integerText = parts[0].replace(/^0+(?=\d)/, '');
    if (integerText.length > 12) throw new Error('金额不能超过 999999999999.99 元。');
    var fractionText = (parts[1] || '').padEnd(2, '0');
    var jiao = Number(fractionText.charAt(0));
    var fen = Number(fractionText.charAt(1));
    var uppercase = uppercaseInteger(integerText) + '元';
    if (jiao === 0 && fen === 0) uppercase += '整';
    if (jiao > 0) uppercase += uppercaseDigits[jiao] + '角';
    if (fen > 0) {
      if (jiao === 0 && integerText !== '0') uppercase += uppercaseDigits[0];
      uppercase += uppercaseDigits[fen] + '分';
    }
    return { numeric: integerText + '.' + fractionText, uppercase: uppercase };
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function taxConversion(mode, amount, taxRate) {
    if (mode !== 'exclusive' && mode !== 'inclusive') throw new Error('请选择有效的含税换算方式。');
    if (!Number.isFinite(amount) || amount < 0) throw new Error('金额必须是大于或等于零的有效数值。');
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error('税率需在 0% 到 100% 之间。');
    var netAmount;
    var grossAmount;
    if (mode === 'exclusive') {
      netAmount = roundMoney(amount);
      grossAmount = roundMoney(netAmount * (1 + taxRate / 100));
    } else {
      grossAmount = roundMoney(amount);
      netAmount = roundMoney(grossAmount / (1 + taxRate / 100));
    }
    return {
      mode: mode,
      taxRate: taxRate,
      netAmount: netAmount,
      taxAmount: roundMoney(grossAmount - netAmount),
      grossAmount: grossAmount
    };
  }

  var travelCategories = ['transport', 'accommodation', 'food', 'tickets', 'shopping', 'other'];
  function travelScopeMultiplier(scope, people, days) {
    if (scope === 'total') return 1;
    if (scope === 'per-person') return people;
    if (scope === 'per-day') return days;
    if (scope === 'per-person-day') return people * days;
    throw new Error('请选择有效的费用计价范围。');
  }

  function normalizeTravelItem(item, index, people, days) {
    if (!item || travelCategories.indexOf(item.category) === -1) throw new Error('请选择有效的费用分类。');
    if (!Number.isFinite(item.planned) || item.planned < 0) throw new Error('计划金额必须是大于或等于零的有效数值。');
    var hasActual = item.actual !== null && item.actual !== undefined;
    if (hasActual && (!Number.isFinite(item.actual) || item.actual < 0)) throw new Error('实际金额必须是大于或等于零的有效数值，或留空。');
    var multiplier = travelScopeMultiplier(item.scope, people, days);
    return {
      name: String(item.name || '').trim() || '费用 ' + (index + 1),
      category: item.category,
      scope: item.scope,
      plannedTotal: roundMoney(item.planned * multiplier),
      actualTotal: hasActual ? roundMoney(item.actual * multiplier) : null
    };
  }

  function travelBudget(people, days, items) {
    if (!Number.isInteger(people) || people < 1 || people > 1000) throw new Error('出行人数需为 1 到 1000 的整数。');
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('出行天数需为 1 到 3650 的整数。');
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) throw new Error('请填写 1 到 30 项旅行费用。');
    var normalizedItems = items.map(function (item, index) {
      return normalizeTravelItem(item, index, people, days);
    });
    var categoryTotals = {};
    var plannedTotal = 0;
    var actualTotal = 0;
    var actualItemCount = 0;
    normalizedItems.forEach(function (item) {
      if (!categoryTotals[item.category]) categoryTotals[item.category] = { category: item.category, planned: 0, actual: 0, itemCount: 0, actualItemCount: 0 };
      categoryTotals[item.category].itemCount += 1;
      plannedTotal = roundMoney(plannedTotal + item.plannedTotal);
      categoryTotals[item.category].planned = roundMoney(categoryTotals[item.category].planned + item.plannedTotal);
      if (item.actualTotal === null) return;
      actualItemCount += 1;
      categoryTotals[item.category].actualItemCount += 1;
      actualTotal = roundMoney(actualTotal + item.actualTotal);
      categoryTotals[item.category].actual = roundMoney(categoryTotals[item.category].actual + item.actualTotal);
    });
    var categories = travelCategories.filter(function (category) { return categoryTotals[category]; }).map(function (category) {
      var totals = categoryTotals[category];
      return {
        category: category,
        planned: totals.planned,
        actual: totals.actual,
        plannedShare: plannedTotal === 0 ? 0 : roundMoney(totals.planned / plannedTotal * 100),
        actualShare: actualTotal === 0 ? 0 : roundMoney(totals.actual / actualTotal * 100),
        itemCount: totals.itemCount,
        actualItemCount: totals.actualItemCount
      };
    });
    return {
      people: people,
      days: days,
      items: normalizedItems,
      categories: categories,
      plannedTotal: plannedTotal,
      actualTotal: actualTotal,
      balance: roundMoney(plannedTotal - actualTotal),
      plannedPerPerson: roundMoney(plannedTotal / people),
      actualPerPerson: roundMoney(actualTotal / people),
      plannedPerDay: roundMoney(plannedTotal / days),
      actualPerDay: roundMoney(actualTotal / days),
      plannedPerPersonDay: roundMoney(plannedTotal / people / days),
      actualPerPersonDay: roundMoney(actualTotal / people / days),
      actualItemCount: actualItemCount,
      allActual: actualItemCount === normalizedItems.length
    };
  }

  function fetchExchangeRate(from, to, fetchImpl, timeoutMs) {
    var base = String(from || '').toUpperCase();
    var quote = String(to || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote)) return Promise.reject(new Error('请输入有效的三位币种代码。'));
    if (base === quote) return Promise.resolve({ date: '', base: base, quote: quote, rate: 1 });
    var request = fetchImpl || globalThis.fetch;
    if (typeof request !== 'function') return Promise.reject(new Error('当前环境无法获取汇率。'));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, timeoutMs || 8000);
    var url = 'https://api.frankfurter.dev/v2/rate/' + encodeURIComponent(base) + '/' + encodeURIComponent(quote);
    return request(url, controller ? { signal: controller.signal } : {}).then(function (response) {
      if (!response.ok) throw new Error(response.status === 404 || response.status === 422 ? '汇率服务不支持这个币种组合。' : '汇率服务暂时不可用。');
      return response.json();
    }).then(function (data) {
      if (!data || !Number.isFinite(Number(data.rate)) || Number(data.rate) <= 0 || !data.date) throw new Error('汇率服务返回了无法识别的数据。');
      return { date: String(data.date), base: base, quote: quote, rate: Number(data.rate) };
    }).catch(function (error) {
      if (error && error.name === 'AbortError') throw new Error('获取汇率超时，请稍后重试。');
      throw error;
    }).finally(function () { clearTimeout(timer); });
  }

  return {
    mortgageComponent: mortgageComponent,
    mortgagePlan: mortgagePlan,
    mortgageAdjustmentPlan: mortgageAdjustmentPlan,
    compoundInterest: compoundInterest,
    cagr: cagr,
    recurringInvestment: recurringInvestment,
    discountPlan: discountPlan,
    billSplit: billSplit,
    compareUnitPrices: compareUnitPrices,
    percentageCalculation: percentageCalculation,
    savingsGoal: savingsGoal,
    rmbUppercase: rmbUppercase,
    taxConversion: taxConversion,
    travelBudget: travelBudget,
    fetchExchangeRate: fetchExchangeRate
  };
}));
