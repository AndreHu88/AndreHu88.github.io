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

  return {
    mortgageComponent: mortgageComponent,
    mortgagePlan: mortgagePlan,
    compoundInterest: compoundInterest,
    cagr: cagr,
    recurringInvestment: recurringInvestment
  };
}));
