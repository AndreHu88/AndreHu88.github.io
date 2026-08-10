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
    compoundInterest: compoundInterest,
    cagr: cagr,
    recurringInvestment: recurringInvestment,
    discountPlan: discountPlan,
    billSplit: billSplit,
    compareUnitPrices: compareUnitPrices,
    percentageCalculation: percentageCalculation,
    savingsGoal: savingsGoal,
    fetchExchangeRate: fetchExchangeRate
  };
}));
