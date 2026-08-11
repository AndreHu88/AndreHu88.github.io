(function () {
  'use strict';

  var page = document.querySelector('[data-tool]');
  if (!page || !window.JackToolsCore) return;
  var tool = page.getAttribute('data-tool');
  var form = page.querySelector('[data-tool-form]');
  var result = page.querySelector('[data-tool-result]');
  var copyButton = page.querySelector('[data-copy-result]');
  var swapButton = page.querySelector('[data-tool-swap]');
  var formStatus = page.querySelector('[data-tool-form-status]');
  var core = window.JackToolsCore;
  var moneyFormatter = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });
  var numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 10 });
  var mealApp = null;
  var countdownTimer = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  function setResult(html, copyValue) {
    if (result._downloadUrl) {
      URL.revokeObjectURL(result._downloadUrl);
      result._downloadUrl = '';
    }
    result.classList.remove('is-error');
    result.innerHTML = html;
    result._copyValue = copyValue === undefined ? result.innerText : copyValue;
    copyButton.hidden = !result._copyValue;
    setFormStatus('结果已更新。', 'success');
  }

  function setFormStatus(message, state) {
    formStatus.textContent = message || '';
    formStatus.classList.toggle('is-error', state === 'error');
    formStatus.classList.toggle('is-success', state === 'success');
  }

  function showError(error) {
    result.classList.add('is-error');
    result.innerHTML = '<div class="tool-error"><span class="material-symbols-rounded">error</span><div><strong>无法完成</strong><p>' + escapeHtml(error.message || error) + '</p></div></div>';
    result._copyValue = '';
    copyButton.hidden = true;
    setFormStatus(error.message || String(error), 'error');
  }

  function updateInputStatus(event) {
    if (tool === 'meal-picker') return;
    var input = event.target;
    if (input.validity && !input.validity.valid) {
      input.setAttribute('aria-invalid', 'true');
      setFormStatus('请检查当前输入的必填项或数值范围。', 'error');
      return;
    }
    input.removeAttribute('aria-invalid');
    if (tool === 'cagr') {
      form.elements.startDate.removeAttribute('aria-invalid');
      form.elements.endDate.removeAttribute('aria-invalid');
      var startDate = form.elements.startDate.value;
      var endDate = form.elements.endDate.value;
      if (startDate && endDate && endDate <= startDate) {
        form.elements.endDate.setAttribute('aria-invalid', 'true');
        setFormStatus('结束日期必须晚于开始日期。', 'error');
        return;
      }
    }
    if (tool === 'date-difference') {
      form.elements.start.removeAttribute('aria-invalid');
      form.elements.end.removeAttribute('aria-invalid');
      var start = form.elements.start.value;
      var end = form.elements.end.value;
      if (start && end && end < start) {
        form.elements.end.setAttribute('aria-invalid', 'true');
        setFormStatus('结束日期不能早于开始日期。', 'error');
        return;
      }
    }
    if (tool === 'json-formatter' && form.elements.source.value.trim()) {
      try { JSON.parse(form.elements.source.value); }
      catch (error) {
        form.elements.source.setAttribute('aria-invalid', 'true');
        setFormStatus('JSON 格式尚未完整，请检查括号、引号和逗号。', 'error');
        return;
      }
    }
    if (tool === 'color-converter' && form.elements.source.value.trim()) {
      try { core.parseColor(form.elements.source.value); }
      catch (error) {
        form.elements.source.setAttribute('aria-invalid', 'true');
        setFormStatus(error.message, 'error');
        return;
      }
    }
    if (tool === 'timestamp' && form.elements.source.value.trim()) {
      try { core.parseTimestamp(form.elements.source.value); }
      catch (error) {
        form.elements.source.setAttribute('aria-invalid', 'true');
        setFormStatus(error.message, 'error');
        return;
      }
    }
    var controlsReady = Array.prototype.every.call(form.elements, function (control) {
      return !control.validity || control.validity.valid;
    });
    if (controlsReady) setFormStatus('输入已就绪，可以开始处理。', 'success');
    else setFormStatus('', '');
  }

  function numberValue(name, label, allowZero) {
    var value = Number(form.elements[name].value);
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error('请填写有效的' + label + '。');
    return value;
  }

  function resultText(value, language) {
    return '<textarea class="tool-output-text" rows="13" readonly spellcheck="false" aria-label="处理结果" data-language="' + (language || 'text') + '">' + escapeHtml(value) + '</textarea>';
  }

  function summaryCards(items) {
    return '<div class="tool-summary-grid">' + items.map(function (item) {
      return '<div><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.value) + '</strong>' + (item.hint ? '<small>' + escapeHtml(item.hint) + '</small>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function displayNumber(value, maximumDigits) {
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: maximumDigits === undefined ? 4 : maximumDigits }).format(value);
  }

  function textLines(value) {
    return String(value || '').split(/\r\n|\r|\n/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function resultTable(headers, rows) {
    return '<div class="tool-table-wrap"><table><thead><tr>' + headers.map(function (header) { return '<th>' + escapeHtml(header) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (row) {
      return '<tr>' + row.map(function (value) { return '<td>' + escapeHtml(value) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
  }

  function handleBase64(action) {
    var source = form.elements.source.value;
    if (!source) throw new Error('请先输入需要处理的内容。');
    var value = action === 'decode' ? core.base64ToUtf8(source) : core.utf8ToBase64(source);
    setResult(resultText(value), value);
  }

  function renderTextStats() {
    var stats = core.countText(form.elements.source.value);
    setResult(summaryCards([
      { label: '字符数', value: stats.characters },
      { label: '去空格字符', value: stats.charactersWithoutSpaces },
      { label: '汉字', value: stats.han },
      { label: '英文单词', value: stats.words },
      { label: '行数', value: stats.lines },
      { label: 'UTF-8 字节', value: stats.bytes },
      { label: '预计阅读', value: stats.readingMinutes ? stats.readingMinutes + ' 分钟' : '0 分钟' }
    ]), '字符：' + stats.characters + '\n去空格字符：' + stats.charactersWithoutSpaces + '\n汉字：' + stats.han + '\n英文单词：' + stats.words + '\n行数：' + stats.lines + '\nUTF-8 字节：' + stats.bytes + '\n预计阅读：' + stats.readingMinutes + ' 分钟');
  }

  function handleUrl(action) {
    var source = form.elements.source.value;
    if (!source) throw new Error('请先输入 URL 或文本。');
    var componentMode = form.elements.mode.value === 'component';
    var value = action === 'decode' ? core.decodeUrl(source, componentMode) : core.encodeUrl(source, componentMode);
    setResult(resultText(value), value);
  }

  function handleJson(action) {
    var source = form.elements.source.value;
    if (!source.trim()) throw new Error('请先输入 JSON 内容。');
    var value = core.formatJson(source, action === 'compact');
    setResult(resultText(value, 'json'), value);
  }

  function handleCaseConverter() {
    var source = form.elements.source.value;
    if (!source) throw new Error('请先输入需要转换的文本。');
    var value = core.convertCase(source, form.elements.mode.value);
    setResult(resultText(value), value);
  }

  function handleListCleaner() {
    if (!form.elements.source.value) throw new Error('请先输入列表内容。');
    var cleaned = core.cleanList(form.elements.source.value, {
      trim: form.elements.trim.checked,
      removeEmpty: form.elements.removeEmpty.checked,
      dedupe: form.elements.dedupe.checked,
      caseSensitive: form.elements.caseSensitive.checked,
      sort: form.elements.sort.value
    });
    var html = summaryCards([
      { label: '原始行数', value: cleaned.originalLines },
      { label: '整理后行数', value: cleaned.lines },
      { label: '移除空行', value: cleaned.removedEmpty },
      { label: '移除重复项', value: cleaned.removedDuplicates }
    ]) + resultText(cleaned.value);
    setResult(html, cleaned.value);
  }

  function handleTimestamp(action) {
    if (action === 'now') form.elements.source.value = String(Date.now());
    var source = form.elements.source.value.trim();
    if (!source) throw new Error('请输入时间戳或日期时间。');
    var date = core.parseTimestamp(source);
    var milliseconds = date.getTime();
    setResult(summaryCards([
      { label: '秒时间戳', value: Math.floor(milliseconds / 1000) },
      { label: '毫秒时间戳', value: milliseconds },
      { label: '本地时间', value: date.toLocaleString('zh-CN', { hour12: false }) },
      { label: 'ISO UTC', value: date.toISOString() }
    ]));
  }

  async function handleHash() {
    var source = form.elements.source.value;
    if (!source) throw new Error('请先输入需要生成摘要的文本。');
    var value = await core.hashText(source, form.elements.algorithm.value);
    setResult('<div class="hash-result"><span>' + escapeHtml(form.elements.algorithm.value) + '</span><code>' + value + '</code></div>', value);
  }

  function handleColor() {
    var formats = core.colorFormats(form.elements.source.value);
    var html = '<div class="color-preview" style="background:' + escapeHtml(formats.rgb) + '"></div>' + summaryCards([
      { label: 'HEX', value: formats.hex }, { label: 'RGB(A)', value: formats.rgb }, { label: 'HSL(A)', value: formats.hsl }
    ]);
    setResult(html, formats.hex + '\n' + formats.rgb + '\n' + formats.hsl);
  }

  function handleDateDifference() {
    var start = form.elements.start.value;
    var end = form.elements.end.value;
    if (!start || !end) throw new Error('请选择开始日期和结束日期。');
    var difference = core.dateDifference(start, end, form.elements.inclusive.checked);
    setResult(summaryCards([
      { label: '自然日', value: difference.days + ' 天' },
      { label: '周数', value: (difference.weeks).toFixed(2) + ' 周' },
      { label: '年月日差', value: difference.years + ' 年 ' + difference.months + ' 个月 ' + difference.remainingDays + ' 天' }
    ]));
  }

  function mortgageComponents() {
    var components = [{ principal: numberValue('principalA', '贷款金额') * 10000, annualRate: numberValue('rateA', '年利率', true), months: Math.round(numberValue('yearsA', '贷款期限') * 12) }];
    if (form.elements.loanType.value === 'combination') {
      components.push({ principal: numberValue('principalB', '公积金贷款金额') * 10000, annualRate: numberValue('rateB', '公积金年利率', true), months: Math.round(numberValue('yearsB', '公积金贷款期限') * 12) });
    }
    return components;
  }

  function mortgageTable(plan) {
    return '<details class="mortgage-details"><summary>查看逐月还款明细（' + plan.schedule.length + ' 期）</summary><div class="tool-table-wrap"><table><thead><tr><th>期数</th><th>月供</th><th>本金</th><th>利息</th><th>剩余本金</th></tr></thead><tbody>' + plan.schedule.map(function (row) {
      return '<tr><td>' + row.month + '</td><td>' + moneyFormatter.format(row.payment) + '</td><td>' + moneyFormatter.format(row.principal) + '</td><td>' + moneyFormatter.format(row.interest) + '</td><td>' + moneyFormatter.format(row.remaining) + '</td></tr>';
    }).join('') + '</tbody></table></div></details>';
  }

  function handleMortgage() {
    var components = mortgageComponents();
    var equalPayment = core.mortgagePlan(components, 'equal-payment');
    var equalPrincipal = core.mortgagePlan(components, 'equal-principal');
    var selected = form.elements.scheduleMethod.value === 'equal-principal' ? equalPrincipal : equalPayment;
    var html = '<div class="mortgage-compare"><section><span>等额本息</span><strong>' + moneyFormatter.format(equalPayment.schedule[0].payment) + '</strong><small>每月月供</small><p>总利息 ' + moneyFormatter.format(equalPayment.totalInterest) + '</p></section><section><span>等额本金</span><strong>' + moneyFormatter.format(equalPrincipal.schedule[0].payment) + '</strong><small>首月月供</small><p>总利息 ' + moneyFormatter.format(equalPrincipal.totalInterest) + '</p></section></div>' + summaryCards([{ label: '贷款总额', value: moneyFormatter.format(selected.totalPrincipal) }, { label: '总还款', value: moneyFormatter.format(selected.totalPayment) }, { label: '总利息', value: moneyFormatter.format(selected.totalInterest) }]) + mortgageTable(selected);
    setResult(html);
  }

  function handleCompound() {
    var plan = core.compoundInterest(numberValue('principal', '初始本金', true), numberValue('rate', '年利率', true), numberValue('years', '投资期限'), numberValue('frequency', '复利频率'));
    setResult(summaryCards([{ label: '初始本金', value: moneyFormatter.format(plan.principal) }, { label: '复利收益', value: moneyFormatter.format(plan.earnings) }, { label: '最终金额', value: moneyFormatter.format(plan.finalAmount) }]));
  }

  function handleCagr() {
    var start = form.elements.startDate.value;
    var end = form.elements.endDate.value;
    if (!start || !end) throw new Error('请选择开始日期和结束日期。');
    var days = Math.round((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000);
    var rate = core.cagr(numberValue('startValue', '起始金额'), numberValue('endValue', '结束金额', true), days);
    setResult(summaryCards([{ label: '持有天数', value: days + ' 天' }, { label: '累计变化', value: (((numberValue('endValue', '结束金额', true) / numberValue('startValue', '起始金额')) - 1) * 100).toFixed(2) + '%' }, { label: 'CAGR 年化收益率', value: rate.toFixed(2) + '%' }]));
  }

  function handleRecurring() {
    var plan = core.recurringInvestment(numberValue('payment', '每期投入', true), numberValue('rate', '预期年化收益', true), numberValue('years', '投资期限'), numberValue('frequency', '投入频率'), form.elements.timing.value);
    setResult(summaryCards([{ label: '累计投入', value: moneyFormatter.format(plan.contributed) }, { label: '预估收益', value: moneyFormatter.format(plan.earnings) }, { label: '期末资产', value: moneyFormatter.format(plan.finalAmount) }, { label: '投入期数', value: plan.periods + ' 期' }]));
  }

  async function handleExchangeRate() {
    var amount = numberValue('amount', '换算金额', true);
    var from = form.elements.from.value;
    var to = form.elements.to.value;
    var quote = await core.fetchExchangeRate(from, to);
    var converted = amount * quote.rate;
    var sourceFormatter = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: from, maximumFractionDigits: 4 });
    var targetFormatter = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: to, maximumFractionDigits: 4 });
    setResult(summaryCards([
      { label: '换算金额', value: targetFormatter.format(converted), hint: sourceFormatter.format(amount) },
      { label: '参考汇率', value: '1 ' + from + ' = ' + displayNumber(quote.rate, 8) + ' ' + to },
      { label: '反向汇率', value: '1 ' + to + ' = ' + displayNumber(1 / quote.rate, 8) + ' ' + from },
      { label: '数据日期', value: quote.date || '相同币种' }
    ]), sourceFormatter.format(amount) + ' = ' + targetFormatter.format(converted) + '\n参考汇率：1 ' + from + ' = ' + quote.rate + ' ' + to + '\n数据日期：' + (quote.date || '相同币种'));
  }

  function handleDiscount() {
    var plan = core.discountPlan(numberValue('original', '商品原价', true), numberValue('discount', '折数', true), numberValue('coupon', '额外优惠', true));
    setResult(summaryCards([
      { label: '最终价格', value: moneyFormatter.format(plan.finalPrice) },
      { label: '折后未用券', value: moneyFormatter.format(plan.beforeCoupon) },
      { label: '总共节省', value: moneyFormatter.format(plan.saved) },
      { label: '实际折扣', value: plan.effectiveDiscount.toFixed(2) + ' 折' }
    ]));
  }

  function handleBillSplit() {
    var plan = core.billSplit(numberValue('subtotal', '账单金额', true), Math.round(numberValue('people', '参与人数')), numberValue('serviceRate', '服务费', true), numberValue('tipRate', '小费', true), numberValue('discountAmount', '固定优惠', true));
    var shareHint = plan.people === 1 ? '共 1 人' : '前 ' + (plan.people - 1) + ' 人各 ' + moneyFormatter.format(plan.regularShare) + '，最后一人 ' + moneyFormatter.format(plan.lastShare);
    setResult(summaryCards([
      { label: '调整后总额', value: moneyFormatter.format(plan.total) },
      { label: '人均参考', value: moneyFormatter.format(plan.total / plan.people), hint: shareHint },
      { label: '服务费', value: moneyFormatter.format(plan.service) },
      { label: '小费', value: moneyFormatter.format(plan.tip) }
    ]));
  }

  function unitPriceItems() {
    return Array.prototype.map.call(form.querySelectorAll('[data-unit-price-items] [data-repeat-row]'), function (row) {
      return {
        name: row.querySelector('[name="itemName"]').value.trim(),
        price: Number(row.querySelector('[name="itemPrice"]').value),
        amount: Number(row.querySelector('[name="itemAmount"]').value),
        unit: row.querySelector('[name="itemUnit"]').value
      };
    });
  }

  function handleUnitPrice() {
    var comparison = core.compareUnitPrices(unitPriceItems(), form.elements.dimension.value);
    var rows = comparison.items.map(function (item, index) {
      return [index === 0 ? '最划算' : '第 ' + (index + 1) + ' 名', item.name, moneyFormatter.format(item.unitPrice) + '/' + comparison.baseUnit, index === 0 ? '基准' : '贵 ' + item.moreExpensive.toFixed(2) + '%'];
    });
    setResult(summaryCards([{ label: '最低单价', value: moneyFormatter.format(comparison.items[0].unitPrice) + '/' + comparison.baseUnit }, { label: '最划算商品', value: comparison.items[0].name }]) + resultTable(['排名', '商品', '统一单价', '相对差异'], rows));
  }

  function handlePercentage() {
    var calculation = core.percentageCalculation(form.elements.mode.value, Number(form.elements.a.value), Number(form.elements.b.value), form.elements.direction.value);
    var percentageMode = form.elements.mode.value === 'share' || form.elements.mode.value === 'change';
    setResult(summaryCards([{ label: '计算结果', value: percentageMode ? displayNumber(calculation.value, 6) + '%' : displayNumber(calculation.value, 10) }, { label: '计算过程', value: calculation.formula }]));
  }

  function handleSavingsGoal() {
    var plan = core.savingsGoal(numberValue('target', '目标金额'), numberValue('current', '已有金额', true), Math.round(numberValue('months', '计划期限')), numberValue('annualRate', '预期年化收益', true), form.elements.timing.value);
    setResult(summaryCards([
      { label: '每月需要存入', value: moneyFormatter.format(plan.monthlyDeposit) },
      { label: '累计投入本金', value: moneyFormatter.format(plan.contributed) },
      { label: '预估收益', value: moneyFormatter.format(plan.earnings) },
      { label: '预计期末金额', value: moneyFormatter.format(plan.finalAmount), hint: plan.months + ' 个月后' }
    ]));
  }

  function handleRmbUppercase() {
    var converted = core.rmbUppercase(form.elements.amount.value);
    setResult(summaryCards([
      { label: '数字金额', value: converted.numeric },
      { label: '人民币大写', value: converted.uppercase }
    ]) + '<p class="tool-result-note">金额按元、角、分逐位转换，没有经过浮点运算。</p>', converted.uppercase);
  }

  function handleTaxConverter() {
    var plan = core.taxConversion(form.elements.mode.value, numberValue('amount', '金额', true), numberValue('taxRate', '税率', true));
    var formula = plan.mode === 'exclusive'
      ? '未税金额 × (1 + ' + displayNumber(plan.taxRate, 2) + '%) = 含税金额'
      : '含税金额 ÷ (1 + ' + displayNumber(plan.taxRate, 2) + '%) = 未税金额';
    setResult(summaryCards([
      { label: '未税金额', value: moneyFormatter.format(plan.netAmount) },
      { label: '税额', value: moneyFormatter.format(plan.taxAmount) },
      { label: '价税合计', value: moneyFormatter.format(plan.grossAmount) },
      { label: '采用税率', value: displayNumber(plan.taxRate, 2) + '%' }
    ]) + '<p class="tool-result-note">' + escapeHtml(formula) + '，结果按分位舍入并保持价税合计一致。</p>');
  }

  var travelCategoryLabels = {
    transport: '交通', accommodation: '住宿', food: '餐饮', tickets: '门票', shopping: '购物', other: '其他'
  };

  function travelExpenseItems() {
    return Array.prototype.map.call(form.querySelectorAll('[data-travel-expense-row]'), function (row) {
      var actual = row.querySelector('[name="actualAmount"]').value;
      return {
        name: row.querySelector('[name="expenseName"]').value,
        category: row.querySelector('[name="expenseCategory"]').value,
        scope: row.querySelector('[name="expenseScope"]').value,
        planned: Number(row.querySelector('[name="plannedAmount"]').value),
        actual: actual === '' ? null : Number(actual)
      };
    });
  }

  function handleTravelBudget() {
    var budget = core.travelBudget(Math.round(numberValue('people', '出行人数')), Math.round(numberValue('days', '出行天数')), travelExpenseItems());
    var hasActual = budget.actualItemCount > 0;
    var balanceLabel = budget.allActual ? (budget.balance >= 0 ? '预算结余' : '超出预算') : '预算差额';
    var categoryRows = budget.categories.map(function (item) {
      var categoryHasActual = item.actualItemCount > 0;
      return '<tr><td>' + escapeHtml(travelCategoryLabels[item.category]) + '</td><td>' + moneyFormatter.format(item.planned) + '</td><td>' + item.plannedShare + '%</td><td>' + (categoryHasActual ? moneyFormatter.format(item.actual) : '—') + '</td><td>' + (categoryHasActual ? item.actualShare + '%' : '—') + '</td></tr>';
    }).join('');
    var table = '<div class="tool-table-wrap"><table><thead><tr><th>分类</th><th>计划</th><th>计划占比</th><th>已填实际</th><th>实际占比</th></tr></thead><tbody>' + categoryRows + '</tbody></table></div>';
    setResult(summaryCards([
      { label: '整趟预算', value: moneyFormatter.format(budget.plannedTotal) },
      { label: hasActual ? '已填写实际支出' : '实际支出', value: hasActual ? moneyFormatter.format(budget.actualTotal) : '尚未填写' },
      { label: balanceLabel, value: budget.allActual ? moneyFormatter.format(Math.abs(budget.balance)) : '待补全实际金额' },
      { label: '预算人均 / 日均', value: moneyFormatter.format(budget.plannedPerPerson) + ' / ' + moneyFormatter.format(budget.plannedPerDay) },
      { label: '已填实际人均 / 日均', value: hasActual ? moneyFormatter.format(budget.actualPerPerson) + ' / ' + moneyFormatter.format(budget.actualPerDay) : '—' }
    ]) + table + '<p class="tool-result-note">所有费用已按所选范围换算为整趟总额；只有全部项目都填写实际金额后，才会显示预算结余或超支。</p>');
  }

  function handleUnitConverter() {
    var amount = Number(form.elements.amount.value);
    var converted = core.convertUnit(form.elements.category.value, amount, form.elements.from.value, form.elements.to.value);
    var precision = Number(form.elements.precision.value);
    var units = core.unitCategories[form.elements.category.value].units;
    var sourceLabel = units[form.elements.from.value][0];
    var targetLabel = units[form.elements.to.value][0];
    var value = Number(converted.toFixed(precision));
    setResult(summaryCards([{ label: sourceLabel, value: displayNumber(amount, precision) }, { label: targetLabel, value: displayNumber(value, precision) }, { label: '换算关系', value: '1 ' + sourceLabel + ' = ' + displayNumber(core.convertUnit(form.elements.category.value, 1, form.elements.from.value, form.elements.to.value), precision) + ' ' + targetLabel }]));
  }

  function handleAgeCalculation() {
    var age = core.ageCalculation(form.elements.birthDate.value, form.elements.asOfDate.value);
    setResult(summaryCards([
      { label: '周岁', value: age.years + ' 岁' },
      { label: '精确年龄', value: age.years + ' 年 ' + age.months + ' 个月 ' + age.days + ' 天' },
      { label: '已经出生', value: numberFormatter.format(age.totalDays) + ' 天' },
      { label: '下次生日', value: age.nextBirthdayDays + ' 天后', hint: age.nextBirthday }
    ]));
  }

  function formatOffset(minutes) {
    var sign = minutes >= 0 ? '+' : '−';
    var absolute = Math.abs(minutes);
    return sign + Math.floor(absolute / 60) + ' 小时' + (absolute % 60 ? ' ' + absolute % 60 + ' 分钟' : '');
  }

  function handleTimezone() {
    var conversion = core.timezoneConversion(form.elements.dateTime.value, form.elements.fromZone.value, form.elements.toZone.value);
    var dayHint = conversion.dayDifference === 0 ? '同一日期' : conversion.dayDifference > 0 ? '晚 ' + conversion.dayDifference + ' 天' : '早 ' + Math.abs(conversion.dayDifference) + ' 天';
    var html = summaryCards([
      { label: '目标时间', value: conversion.targetValue, hint: dayHint },
      { label: '时差', value: formatOffset(conversion.offsetMinutes) },
      { label: 'UTC 时间', value: conversion.utc },
      { label: '源时间状态', value: conversion.ambiguous ? '夏令时重复时段' : '时间明确' }
    ]);
    if (conversion.ambiguous) html += '<p class="tool-result-note">源时间在夏令时切换时出现两次，本次采用较早的时刻。</p>';
    setResult(html);
  }

  function handleFuelCost() {
    var plan = core.fuelCost(numberValue('distance', '单程距离', true), numberValue('consumption', '百公里油耗', true), numberValue('price', '油价', true), Math.round(numberValue('people', '分摊人数')), form.elements.roundTrip.checked);
    setResult(summaryCards([
      { label: '总里程', value: displayNumber(plan.distance, 2) + ' 公里' },
      { label: '预计用油', value: displayNumber(plan.liters, 3) + ' 升' },
      { label: '预计油费', value: moneyFormatter.format(plan.cost) },
      { label: '每公里成本', value: moneyFormatter.format(plan.perKilometer), hint: '每人 ' + moneyFormatter.format(plan.perPerson) }
    ]));
  }

  function handleElectricityCost() {
    var plan = core.electricityCost(numberValue('power', '设备功率', true), form.elements.powerUnit.value, numberValue('hours', '每天使用时长', true), Math.round(numberValue('days', '使用天数')), numberValue('price', '电价', true));
    setResult(summaryCards([
      { label: '每天用电', value: displayNumber(plan.dailyKwh, 4) + ' 度' },
      { label: '周期用电', value: displayNumber(plan.totalKwh, 4) + ' 度' },
      { label: '每天电费', value: moneyFormatter.format(plan.dailyCost) },
      { label: '周期总电费', value: moneyFormatter.format(plan.totalCost) }
    ]));
  }

  function recipeItems() {
    return Array.prototype.map.call(form.querySelectorAll('[data-recipe-items] [data-repeat-row]'), function (row) {
      return { name: row.querySelector('[name="ingredientName"]').value.trim(), amount: Number(row.querySelector('[name="ingredientAmount"]').value), unit: row.querySelector('[name="ingredientUnit"]').value.trim() };
    });
  }

  function handleRecipe() {
    var plan = core.scaleRecipe(numberValue('originalServings', '原始份数'), numberValue('targetServings', '目标份数'), recipeItems());
    var output = plan.ingredients.map(function (item) { return item.name + '：' + displayNumber(item.amount, 6) + ' ' + item.unit; }).join('\n');
    setResult(summaryCards([{ label: '缩放比例', value: displayNumber(plan.ratio, 4) + ' 倍' }, { label: '食材数量', value: plan.ingredients.length + ' 项' }]) + resultText(output), output);
  }

  function handleBmi() {
    var bmi = core.bmiCalculation(numberValue('height', '身高'), numberValue('weight', '体重'));
    setResult(summaryCards([
      { label: 'BMI', value: bmi.bmi.toFixed(1) },
      { label: '成人分类', value: bmi.category },
      { label: '参考体重下限', value: bmi.minimumWeight.toFixed(1) + ' 千克' },
      { label: '参考体重上限', value: bmi.maximumWeight.toFixed(1) + ' 千克' }
    ]) + '<p class="tool-result-note">BMI 是基于身高和体重的粗略指标，不反映肌肉量、体脂分布或个体健康状况。</p>');
  }

  function workdayOptions() {
    return { holidays: textLines(form.elements.holidays.value), workingWeekends: textLines(form.elements.workingWeekends.value), includeStart: form.elements.includeStart.checked, includeEnd: form.elements.includeEnd.checked };
  }

  function handleWorkday() {
    if (form.elements.mode.value === 'add') {
      var target = core.addWorkdays(form.elements.startDate.value, Math.round(numberValue('workdays', '工作日数量', true)), form.elements.direction.value, workdayOptions());
      setResult(summaryCards([{ label: '计算结果', value: target }, { label: '移动工作日', value: form.elements.workdays.value + ' 个' }, { label: '方向', value: form.elements.direction.value === 'backward' ? '向前推算' : '向后推算' }]));
      return;
    }
    var count = core.countWorkdays(form.elements.startDate.value, form.elements.endDate.value, workdayOptions());
    setResult(summaryCards([{ label: '工作日数量', value: count + ' 天' }, { label: '开始日期', value: form.elements.startDate.value }, { label: '结束日期', value: form.elements.endDate.value }]));
  }

  function localDateTimeText(date) {
    return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  function handleTimeCalculator() {
    if (form.elements.mode.value === 'difference') {
      var difference = core.dateTimeDifference(form.elements.startDateTime.value, form.elements.endDateTime.value);
      var direction = difference.direction === 'same' ? '两个时刻相同' : difference.direction === 'after' ? '结束时刻晚于开始时刻' : '结束时刻早于开始时刻';
      setResult(summaryCards([
        { label: '完整间隔', value: difference.days + ' 天 ' + difference.hours + ' 小时 ' + difference.minutes + ' 分 ' + difference.seconds + ' 秒' },
        { label: '方向', value: direction },
        { label: '总小时', value: displayNumber(difference.totalHours, 4) },
        { label: '总分钟', value: displayNumber(difference.totalMinutes, 2) }
      ]));
      return;
    }
    var duration = {
      days: Math.round(numberValue('days', '天数', true)), hours: Math.round(numberValue('hours', '小时数', true)),
      minutes: Math.round(numberValue('minutes', '分钟数', true)), seconds: Math.round(numberValue('seconds', '秒数', true))
    };
    var adjusted = core.adjustDateTime(form.elements.baseDateTime.value, form.elements.operation.value, duration);
    var dayChange = adjusted.dayDifference === 0 ? '未跨自然日' : (adjusted.dayDifference > 0 ? '向后跨 ' : '向前跨 ') + Math.abs(adjusted.dayDifference) + ' 天';
    setResult(summaryCards([
      { label: '计算结果', value: localDateTimeText(adjusted.date) },
      { label: '跨日情况', value: dayChange },
      { label: '时区偏移', value: 'UTC' + (adjusted.timezoneOffsetMinutes >= 0 ? '+' : '−') + displayNumber(Math.abs(adjusted.timezoneOffsetMinutes) / 60, 2) },
      { label: '本地时间值', value: adjusted.localValue.replace('T', ' ') }
    ]), adjusted.localValue);
  }

  function renderCountdown() {
    var status = core.countdownStatus(form.elements.eventName.value, form.elements.targetDateTime.value, form.elements.repeat.value, new Date());
    var state = status.status === 'elapsed' ? '已经过去' : status.status === 'now' ? '就是现在' : '距离事件还有';
    var leapNote = status.adjustedLeapDay ? '<p class="tool-result-note">今年不是闰年，2 月 29 日已按 2 月 28 日计算。</p>' : '';
    var value = status.days + '<small>天</small> ' + String(status.hours).padStart(2, '0') + '<small>时</small> ' + String(status.minutes).padStart(2, '0') + '<small>分</small> ' + String(status.seconds).padStart(2, '0') + '<small>秒</small>';
    setResult('<div class="countdown-result"><span>' + escapeHtml(status.eventName) + '</span><strong>' + value + '</strong><p>' + state + ' · ' + escapeHtml(status.targetValue.replace('T', ' ')) + '</p></div>' + leapNote, status.eventName + '：' + state + ' ' + status.days + ' 天 ' + status.hours + ' 小时 ' + status.minutes + ' 分 ' + status.seconds + ' 秒');
  }

  function handleCountdown() {
    if (countdownTimer) window.clearInterval(countdownTimer);
    renderCountdown();
    countdownTimer = window.setInterval(function () {
      try { renderCountdown(); } catch (error) { window.clearInterval(countdownTimer); countdownTimer = null; showError(error); }
    }, 1000);
  }

  function packageItems() {
    return Array.prototype.map.call(form.querySelectorAll('[data-package-items] [data-repeat-row]'), function (row) {
      return {
        name: row.querySelector('[name="packageName"]').value,
        quantity: Math.round(Number(row.querySelector('[name="packageQuantity"]').value)),
        length: Number(row.querySelector('[name="packageLength"]').value), width: Number(row.querySelector('[name="packageWidth"]').value),
        height: Number(row.querySelector('[name="packageHeight"]').value), actualWeight: Number(row.querySelector('[name="actualWeight"]').value)
      };
    });
  }

  function handleDimensionalWeight() {
    var divisor = form.elements.divisorPreset.value === 'custom' ? Number(form.elements.customDivisor.value) : Number(form.elements.divisorPreset.value);
    var plan = core.dimensionalWeight(packageItems(), { lengthUnit: form.elements.lengthUnit.value, weightUnit: form.elements.weightUnit.value, divisor: divisor, rounding: form.elements.rounding.value });
    var rows = plan.items.map(function (item) {
      return '<tr><td>' + escapeHtml(item.name) + ' × ' + item.quantity + '</td><td>' + displayNumber(item.actualWeightKg, 3) + '</td><td>' + displayNumber(item.volumetricWeightKg, 3) + '</td><td>' + displayNumber(item.totalChargeableWeightKg, 3) + '</td></tr>';
    }).join('');
    setResult(summaryCards([
      { label: '总计费重', value: displayNumber(plan.totalChargeableWeightKg, 3) + ' kg' },
      { label: '总实际重量', value: displayNumber(plan.totalActualWeightKg, 3) + ' kg' },
      { label: '总体积重量', value: displayNumber(plan.totalVolumetricWeightKg, 3) + ' kg' },
      { label: '体积系数', value: plan.divisor }
    ]) + '<div class="tool-table-wrap"><table><thead><tr><th>包裹</th><th>实际 kg</th><th>体积 kg</th><th>计费 kg</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
  }

  function renovationValues() {
    var names = ['length', 'width', 'height', 'area', 'deductions', 'wastePercent', 'coats', 'coverage', 'packageSize', 'pieceLengthCm', 'pieceWidthCm', 'piecesPerPackage', 'rollWidth', 'rollLength'];
    var values = { areaMode: form.elements.areaMode.value };
    names.forEach(function (name) { values[name] = Number(form.elements.namedItem(name).value); });
    values.coats = Math.round(values.coats);
    values.piecesPerPackage = Math.round(values.piecesPerPackage);
    return values;
  }

  function handleRenovationEstimator() {
    var estimate = core.renovationEstimate(form.elements.mode.value, renovationValues());
    var theoreticalLabel = estimate.mode === 'paint' ? '理论涂料用量' : estimate.mode === 'flooring' ? '含损耗铺装面积' : '理论卷数';
    var theoreticalValue = estimate.mode === 'paint' ? displayNumber(estimate.theoreticalAmount, 3) + ' 升' : estimate.mode === 'flooring' ? displayNumber(estimate.theoreticalAmount, 3) + ' ㎡' : displayNumber(estimate.theoreticalAmount, 3) + ' 卷';
    var items = [
      { label: '净施工面积', value: displayNumber(estimate.netArea, 3) + ' ㎡', hint: '扣除门窗等区域后' },
      { label: '含损耗面积', value: displayNumber(estimate.areaWithWaste, 3) + ' ㎡' },
      { label: theoreticalLabel, value: theoreticalValue },
      { label: '建议购买', value: estimate.purchaseUnits + ' ' + estimate.unit }
    ];
    if (estimate.mode === 'flooring') items.push({ label: '预计片数', value: estimate.pieces + ' 片' });
    setResult(summaryCards(items) + '<p class="tool-result-note">已按包装、片数或整卷向上取整，建议结合现场异形区域和施工方式复核。</p>');
  }

  function fileSize(value) {
    if (value < 1024) return value + ' B';
    if (value < 1048576) return (value / 1024).toFixed(1) + ' KB';
    return (value / 1048576).toFixed(2) + ' MB';
  }

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, close: function () { URL.revokeObjectURL(url); } }); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('无法读取这张图片。')); };
      image.src = url;
    });
  }

  function loadImageSource(file) {
    if (!window.createImageBitmap) return loadImageElement(file);
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bitmap) {
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: function () { bitmap.close(); } };
    }).catch(function () { return loadImageElement(file); });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob || blob.type !== type) { reject(new Error('当前浏览器不支持导出所选图片格式。')); return; }
        resolve(blob);
      }, type, quality);
    });
  }

  async function handleImageCompressor() {
    var file = form.elements.image.files[0];
    if (!file) throw new Error('请先选择图片。');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) throw new Error('请选择不超过 20 MB 的 JPEG、PNG 或 WebP 图片。');
    var loaded = await loadImageSource(file);
    try {
      if (loaded.width > 12000 || loaded.height > 12000 || loaded.width * loaded.height > 40000000) throw new Error('图片解码尺寸过大，请先选择边长不超过 12000 像素且总像素不超过 4000 万的图片。');
      var dimensions = core.resizedDimensions(loaded.width, loaded.height, Number(form.elements.maxWidth.value), Number(form.elements.maxHeight.value));
      var canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      var context = canvas.getContext('2d');
      if (!context) throw new Error('当前浏览器无法创建图片处理画布。');
      var format = form.elements.format.value;
      if (format === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(loaded.source, 0, 0, canvas.width, canvas.height);
      var blob = await canvasBlob(canvas, format, Number(form.elements.quality.value) / 100);
      var extension = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
      var url = URL.createObjectURL(blob);
      var savings = file.size ? (1 - blob.size / file.size) * 100 : 0;
      setResult('<div class="image-preview"><img alt="压缩后的图片预览"></div>' + summaryCards([{ label: '原始尺寸', value: loaded.width + ' × ' + loaded.height }, { label: '输出尺寸', value: canvas.width + ' × ' + canvas.height }, { label: '原始体积', value: fileSize(file.size) }, { label: '输出体积', value: fileSize(blob.size), hint: savings >= 0 ? '减少 ' + savings.toFixed(1) + '%' : '增加 ' + Math.abs(savings).toFixed(1) + '%' }]) + '<a class="tool-download" download="compressed.' + extension + '"><span class="material-symbols-rounded">download</span>下载处理后的图片</a>', '');
      result._downloadUrl = url;
      result.querySelector('.image-preview img').src = url;
      result.querySelector('.tool-download').href = url;
    } finally { loaded.close(); }
  }

  function drawQrCode(payload) {
    if (typeof window.qrcode !== 'function') throw new Error('二维码组件未能正确加载。');
    if (window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
    var qr = window.qrcode(0, 'M');
    qr.addData(payload, 'Byte');
    try { qr.make(); } catch (error) { throw new Error('内容过长，无法生成二维码。'); }
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    var context = canvas.getContext('2d');
    var modules = qr.getModuleCount();
    var quiet = 4;
    var cell = Math.floor(512 / (modules + quiet * 2));
    var drawn = cell * (modules + quiet * 2);
    var offset = Math.floor((512 - drawn) / 2) + quiet * cell;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 512, 512);
    context.fillStyle = '#111827';
    for (var row = 0; row < modules; row += 1) {
      for (var column = 0; column < modules; column += 1) {
        if (qr.isDark(row, column)) context.fillRect(offset + column * cell, offset + row * cell, cell, cell);
      }
    }
    return canvas;
  }

  function handleQrGenerator() {
    var payload = core.qrPayload(form.elements.mode.value, { content: form.elements.content.value, ssid: form.elements.ssid.value, password: form.elements.password.value, security: form.elements.security.value, hidden: form.elements.hidden.checked });
    var canvas = drawQrCode(payload);
    setResult('<div class="qr-preview" data-qr-preview></div><a class="tool-download" download="qrcode.png"><span class="material-symbols-rounded">download</span>下载 PNG 二维码</a>' + summaryCards([{ label: '内容字节数', value: new TextEncoder().encode(payload).length + ' 字节' }, { label: '纠错等级', value: 'M' }]), payload);
    result.querySelector('[data-qr-preview]').appendChild(canvas);
    result.querySelector('.tool-download').href = canvas.toDataURL('image/png');
  }

  function handleRandomPicker(action) {
    var picked = core.randomPick(form.elements.source.value, action === 'shuffle' ? 1 : Math.round(numberValue('count', '抽取数量')), form.elements.dedupe.checked);
    var values = action === 'shuffle' ? picked.shuffled : picked.selected;
    var output = values.map(function (value, index) { return (index + 1) + '. ' + value; }).join('\n');
    setResult(summaryCards([{ label: action === 'shuffle' ? '已打乱' : '抽取结果', value: values.length + ' 项' }, { label: '有效候选', value: picked.candidateCount + ' 项' }]) + resultText(output), output);
  }

  function handleDiceRoller() {
    if (form.elements.mode.value === 'integer') {
      var integers = core.randomIntegers(Number(form.elements.minimum.value), Number(form.elements.maximum.value), Math.round(Number(form.elements.integerCount.value)));
      setResult(summaryCards([{ label: '生成数量', value: integers.length + ' 个' }, { label: '取值范围', value: form.elements.minimum.value + ' 至 ' + form.elements.maximum.value }]) + resultText(integers.join('\n')), integers.join('\n'));
      return;
    }
    var plan = core.rollDice(Math.round(Number(form.elements.diceCount.value)), Math.round(Number(form.elements.sides.value)), Math.round(Number(form.elements.modifier.value)));
    var modifierText = plan.modifier ? (plan.modifier > 0 ? ' + ' : ' − ') + Math.abs(plan.modifier) : '';
    setResult(summaryCards([{ label: '最终结果', value: plan.total }, { label: '骰子合计', value: plan.subtotal }, { label: '各骰结果', value: plan.rolls.join('、') }, { label: '计算式', value: plan.rolls.join(' + ') + modifierText }]));
  }

  function handleMealPicker(action) {
    if (!mealApp) throw new Error('菜单规划器尚未加载完成。');
    return mealApp.handle(action);
  }

  function updateLoanFields() {
    if (tool !== 'mortgage') return;
    var combination = form.elements.loanType.value === 'combination';
    page.querySelector('[data-combination-fields]').hidden = !combination;
    ['principalB', 'rateB', 'yearsB'].forEach(function (name) {
      form.elements[name].required = combination;
      if (!combination) form.elements[name].removeAttribute('aria-invalid');
    });
    page.querySelector('[data-primary-loan-label]').textContent = combination ? '商业贷款' : (form.elements.loanType.value === 'fund' ? '公积金贷款' : '商业贷款');
  }

  var unitPriceUnits = {
    mass: [['g', '克'], ['kg', '千克']],
    volume: [['ml', '毫升'], ['l', '升']],
    count: [['item', '件']]
  };

  function fillSelect(select, items, selected) {
    select.innerHTML = '';
    items.forEach(function (item) {
      var option = document.createElement('option');
      option.value = Array.isArray(item) ? item[0] : item;
      option.textContent = Array.isArray(item) ? item[1] : item;
      option.selected = option.value === selected;
      select.appendChild(option);
    });
  }

  function updateUnitPriceUnits() {
    if (tool !== 'unit-price') return;
    var units = unitPriceUnits[form.elements.dimension.value];
    Array.prototype.forEach.call(form.querySelectorAll('[data-unit-price-unit]'), function (select) { fillSelect(select, units, select.value); });
  }

  function refreshRows(container, prefix, minimum) {
    var rows = Array.prototype.slice.call(container.querySelectorAll('[data-repeat-row]'));
    rows.forEach(function (row, index) {
      row.querySelector('legend').textContent = prefix + ' ' + (index + 1);
      var remove = row.querySelector('.repeat-remove');
      if (!remove) {
        remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'repeat-remove';
        remove.textContent = '移除';
        remove.addEventListener('click', function () { row.remove(); refreshRows(container, prefix, minimum); });
        row.appendChild(remove);
      }
      remove.hidden = rows.length <= minimum;
    });
  }

  function addUnitPriceRow() {
    var container = form.querySelector('[data-unit-price-items]');
    var count = container.querySelectorAll('[data-repeat-row]').length;
    if (count >= 5) { showError(new Error('最多比较 5 件商品。')); return; }
    var fieldset = document.createElement('fieldset');
    fieldset.className = 'repeat-row';
    fieldset.setAttribute('data-repeat-row', '');
    fieldset.innerHTML = '<legend>商品</legend><div class="tool-fields tool-fields--3"><label>名称<input name="itemName" type="text" value="商品 ' + String.fromCharCode(65 + count) + '" required></label><label>价格（元）<input name="itemPrice" type="number" min="0.01" step="0.01" required></label><label>规格数量<input name="itemAmount" type="number" min="0.0001" step="any" required></label></div><label>规格单位<select name="itemUnit" data-unit-price-unit></select></label>';
    container.appendChild(fieldset);
    updateUnitPriceUnits();
    refreshRows(container, '商品', 2);
  }

  function addIngredientRow() {
    var container = form.querySelector('[data-recipe-items]');
    var count = container.querySelectorAll('[data-repeat-row]').length;
    if (count >= 20) { showError(new Error('最多添加 20 项食材。')); return; }
    var fieldset = document.createElement('fieldset');
    fieldset.className = 'repeat-row';
    fieldset.setAttribute('data-repeat-row', '');
    fieldset.innerHTML = '<legend>食材</legend><div class="tool-fields tool-fields--3"><label>名称<input name="ingredientName" type="text" required></label><label>数量<input name="ingredientAmount" type="number" min="0" step="any" required></label><label>单位<input name="ingredientUnit" type="text" required></label></div>';
    container.appendChild(fieldset);
    refreshRows(container, '食材', 1);
  }

  function updateUnitOptions() {
    if (tool !== 'unit-converter') return;
    var units = core.unitCategories[form.elements.category.value].units;
    var items = Object.keys(units).map(function (key) { return [key, units[key][0]]; });
    var previousFrom = form.elements.from.value;
    var previousTo = form.elements.to.value;
    fillSelect(form.elements.from, items, units[previousFrom] ? previousFrom : items[0][0]);
    fillSelect(form.elements.to, items, units[previousTo] ? previousTo : items[Math.min(1, items.length - 1)][0]);
  }

  function localDateValue(date) {
    var pad = function (value) { return String(value).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function localDateTimeValue(date) {
    var pad = function (value) { return String(value).padStart(2, '0'); };
    return localDateValue(date) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function populateTimeZones() {
    if (tool !== 'timezone-converter') return;
    var zones = core.commonTimeZones;
    if (Intl.supportedValuesOf) {
      try { zones = ['UTC'].concat(Intl.supportedValuesOf('timeZone')); } catch (error) { zones = core.commonTimeZones; }
    }
    var browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
    fillSelect(form.elements.fromZone, zones, zones.indexOf(browserZone) !== -1 ? browserZone : 'Asia/Shanghai');
    fillSelect(form.elements.toZone, zones, zones.indexOf('America/New_York') !== -1 ? 'America/New_York' : zones[0]);
    form.elements.dateTime.value = localDateTimeValue(new Date());
  }

  function updatePercentageFields() {
    if (tool !== 'percentage') return;
    var mode = form.elements.mode.value;
    page.querySelector('[data-percentage-label-a]').textContent = mode === 'change' ? '原值 A' : mode === 'reverse' ? '变化后数值 A' : '数值 A';
    page.querySelector('[data-percentage-label-b]').textContent = mode === 'adjust' || mode === 'reverse' ? '变化比例 B（%）' : mode === 'share' ? '整体数值 B' : '新值 B';
    page.querySelector('[data-percentage-direction]').hidden = mode !== 'adjust' && mode !== 'reverse';
  }

  function updateWorkdayFields() {
    if (tool !== 'workday') return;
    var addMode = form.elements.mode.value === 'add';
    page.querySelector('[data-workday-count]').hidden = addMode;
    page.querySelector('[data-workday-add]').hidden = !addMode;
    form.elements.endDate.required = !addMode;
    form.elements.workdays.required = addMode;
  }

  function updateQrFields() {
    if (tool !== 'qr-generator') return;
    var wifi = form.elements.mode.value === 'wifi';
    var passwordRequired = wifi && form.elements.security.value !== 'nopass';
    page.querySelector('[data-qr-content]').hidden = wifi;
    page.querySelector('[data-qr-wifi]').hidden = !wifi;
    page.querySelector('[data-wifi-password]').hidden = wifi && !passwordRequired;
    form.elements.content.required = !wifi;
    form.elements.ssid.required = wifi;
    form.elements.password.required = passwordRequired;
  }

  function updateRandomFields() {
    if (tool !== 'dice-roller') return;
    var dice = form.elements.mode.value === 'dice';
    page.querySelector('[data-dice-fields]').hidden = !dice;
    page.querySelector('[data-integer-fields]').hidden = dice;
  }

  function updateImageFields() {
    if (tool !== 'image-compressor') return;
    var png = form.elements.format.value === 'image/png';
    page.querySelector('[data-image-quality]').hidden = png;
    page.querySelector('[data-image-quality-note]').hidden = !png;
    form.elements.quality.disabled = png;
  }

  function toggleFieldGroup(group, active) {
    if (!group) return;
    group.hidden = !active;
    Array.prototype.forEach.call(group.querySelectorAll('input, select, textarea'), function (control) {
      if (!control.hasAttribute('data-original-required')) control.setAttribute('data-original-required', control.required ? 'true' : 'false');
      control.disabled = !active;
      control.required = active && control.getAttribute('data-original-required') === 'true';
      if (!active) control.removeAttribute('aria-invalid');
    });
  }

  function updateTaxFields() {
    if (tool !== 'tax-converter') return;
    page.querySelector('[data-tax-amount-label]').textContent = form.elements.mode.value === 'exclusive' ? '未税金额（元）' : '含税金额（元）';
  }

  function updateMealFields() {
    if (tool === 'meal-picker' && mealApp) mealApp.updateFields();
  }

  function handleMealDynamicClick(event) {
    if (tool !== 'meal-picker') return;
    if (mealApp) mealApp.handleFormClick(event);
  }

  function updateTimeCalculatorFields() {
    if (tool !== 'time-calculator') return;
    var difference = form.elements.mode.value === 'difference';
    toggleFieldGroup(page.querySelector('[data-time-adjust]'), !difference);
    toggleFieldGroup(page.querySelector('[data-time-difference]'), difference);
    form.elements.startDateTime.required = difference;
    form.elements.endDateTime.required = difference;
  }

  function updateDimensionalFields() {
    if (tool !== 'dimensional-weight') return;
    var custom = form.elements.divisorPreset.value === 'custom';
    toggleFieldGroup(page.querySelector('[data-custom-divisor]'), custom);
    form.elements.customDivisor.required = custom;
  }

  function updateRenovationFields() {
    if (tool !== 'renovation-estimator') return;
    var mode = form.elements.mode.value;
    var room = form.elements.areaMode.value === 'room';
    toggleFieldGroup(page.querySelector('[data-renovation-room]'), room);
    toggleFieldGroup(page.querySelector('[data-renovation-direct]'), !room);
    toggleFieldGroup(page.querySelector('[data-renovation-height]'), room && mode !== 'flooring');
    toggleFieldGroup(page.querySelector('[data-renovation-paint]'), mode === 'paint');
    toggleFieldGroup(page.querySelector('[data-renovation-flooring]'), mode === 'flooring');
    toggleFieldGroup(page.querySelector('[data-renovation-wallpaper]'), mode === 'wallpaper');
  }

  function refreshTravelRows() {
    var rows = Array.prototype.slice.call(form.querySelectorAll('[data-travel-expense-row]'));
    rows.forEach(function (row, index) {
      row.querySelector('[data-travel-expense-legend]').textContent = '费用 ' + (index + 1);
      var remove = row.querySelector('[data-remove-travel-expense]');
      remove.hidden = rows.length === 1;
      remove.setAttribute('aria-label', '删除费用 ' + (index + 1));
    });
  }

  function addTravelExpenseRow() {
    var container = form.querySelector('[data-travel-expenses]');
    if (container.querySelectorAll('[data-travel-expense-row]').length >= 30) { showError(new Error('最多添加 30 项旅行费用。')); return; }
    container.appendChild(page.querySelector('[data-travel-expense-template]').content.cloneNode(true));
    refreshTravelRows();
    container.lastElementChild.querySelector('[name="expenseName"]').focus();
  }

  function addPackageRow() {
    var container = form.querySelector('[data-package-items]');
    var count = container.querySelectorAll('[data-repeat-row]').length;
    if (count >= 10) { showError(new Error('最多添加 10 种包裹。')); return; }
    var row = container.querySelector('[data-repeat-row]').cloneNode(true);
    var inheritedRemove = row.querySelector('.repeat-remove');
    if (inheritedRemove) inheritedRemove.remove();
    row.querySelector('[name="packageName"]').value = '包裹 ' + (count + 1);
    container.appendChild(row);
    refreshRows(container, '包裹', 1);
    row.querySelector('[name="packageName"]').focus();
  }

  function swapSelectValues(first, second) {
    var value = first.value;
    first.value = second.value;
    second.value = value;
  }

  function resetDynamicRows() {
    if (tool === 'unit-price') {
      var priceRows = form.querySelectorAll('[data-unit-price-items] [data-repeat-row]');
      Array.prototype.slice.call(priceRows, 2).forEach(function (row) { row.remove(); });
      refreshRows(form.querySelector('[data-unit-price-items]'), '商品', 2);
    }
    if (tool === 'recipe-scaler') {
      var recipeRows = form.querySelectorAll('[data-recipe-items] [data-repeat-row]');
      Array.prototype.slice.call(recipeRows, 1).forEach(function (row) { row.remove(); });
      refreshRows(form.querySelector('[data-recipe-items]'), '食材', 1);
    }
    if (tool === 'travel-budget') {
      var travelRows = form.querySelectorAll('[data-travel-expense-row]');
      Array.prototype.slice.call(travelRows, 1).forEach(function (row) { row.remove(); });
      refreshTravelRows();
    }
    if (tool === 'dimensional-weight') {
      var packageRows = form.querySelectorAll('[data-package-items] [data-repeat-row]');
      Array.prototype.slice.call(packageRows, 1).forEach(function (row) { row.remove(); });
      refreshRows(form.querySelector('[data-package-items]'), '包裹', 1);
    }
    if (tool === 'meal-picker') {
      if (mealApp) mealApp.resetDynamicRows();
    }
  }

  function applyToolState() {
    updateLoanFields();
    updateUnitPriceUnits();
    updateUnitOptions();
    updatePercentageFields();
    updateWorkdayFields();
    updateQrFields();
    updateRandomFields();
    updateImageFields();
    updateTaxFields();
    updateMealFields();
    updateTimeCalculatorFields();
    updateDimensionalFields();
    updateRenovationFields();
  }

  function initializeExistingTool() {
    if (tool === 'exchange-rate') page.querySelector('[data-currency-swap]').addEventListener('click', function () { swapSelectValues(form.elements.from, form.elements.to); });
    if (tool === 'unit-price') {
      form.elements.dimension.addEventListener('change', updateUnitPriceUnits);
      page.querySelector('[data-add-unit-price]').addEventListener('click', addUnitPriceRow);
      refreshRows(form.querySelector('[data-unit-price-items]'), '商品', 2);
    }
    if (tool === 'percentage') form.elements.mode.addEventListener('change', updatePercentageFields);
    if (tool === 'unit-converter') {
      form.elements.category.addEventListener('change', updateUnitOptions);
      page.querySelector('[data-unit-swap]').addEventListener('click', function () { swapSelectValues(form.elements.from, form.elements.to); });
    }
    if (tool === 'age-calculator') {
      form.elements.asOfDate.value = localDateValue(new Date());
      page.querySelector('[data-use-today]').addEventListener('click', function () { form.elements.asOfDate.value = localDateValue(new Date()); });
    }
    if (tool === 'timezone-converter') {
      populateTimeZones();
      page.querySelector('[data-timezone-swap]').addEventListener('click', function () { swapSelectValues(form.elements.fromZone, form.elements.toZone); });
      page.querySelector('[data-timezone-now]').addEventListener('click', function () { form.elements.dateTime.value = localDateTimeValue(new Date()); });
    }
    if (tool === 'recipe-scaler') {
      page.querySelector('[data-add-ingredient]').addEventListener('click', addIngredientRow);
      refreshRows(form.querySelector('[data-recipe-items]'), '食材', 1);
    }
    if (tool === 'workday') {
      form.elements.startDate.value = localDateValue(new Date());
      form.elements.endDate.value = localDateValue(new Date());
      form.elements.mode.addEventListener('change', updateWorkdayFields);
    }
    if (tool === 'qr-generator') {
      form.elements.mode.addEventListener('change', updateQrFields);
      form.elements.security.addEventListener('change', updateQrFields);
    }
    if (tool === 'dice-roller') form.elements.mode.addEventListener('change', updateRandomFields);
    if (tool === 'image-compressor') form.elements.format.addEventListener('change', updateImageFields);
  }

  function initializeExpandedTool() {
    if (tool === 'tax-converter') {
      form.elements.mode.addEventListener('change', updateTaxFields);
      Array.prototype.forEach.call(page.querySelectorAll('[data-tax-rate-value]'), function (button) {
        button.addEventListener('click', function () { form.elements.taxRate.value = button.getAttribute('data-tax-rate-value'); form.elements.taxRate.focus(); });
      });
    }
    if (tool === 'travel-budget') {
      page.querySelector('[data-add-travel-expense]').addEventListener('click', addTravelExpenseRow);
      page.querySelector('[data-travel-expenses]').addEventListener('click', function (event) {
        var remove = event.target.closest('[data-remove-travel-expense]');
        if (!remove) return;
        remove.closest('[data-travel-expense-row]').remove();
        refreshTravelRows();
      });
      refreshTravelRows();
    }
    if (tool === 'meal-picker') {
      if (!window.JackMealData || !window.JackMealPlanner || !window.JackMealApp) throw new Error('菜单规划器资源加载失败。');
      mealApp = window.JackMealApp.createMealApp({
        page: page, form: form, result: result, data: window.JackMealData,
        planner: window.JackMealPlanner.createMealPlanner({ catalog: window.JackMealData.dishes, definitions: window.JackMealData.definitions }),
        setResult: setResult, setFormStatus: setFormStatus, showError: showError,
        escapeHtml: escapeHtml, money: function (value) { return moneyFormatter.format(value); }
      });
      mealApp.initialize();
    }
    if (tool === 'time-calculator') {
      form.elements.mode.addEventListener('change', updateTimeCalculatorFields);
      page.querySelector('[data-time-swap]').addEventListener('click', function () { swapSelectValues(form.elements.startDateTime, form.elements.endDateTime); });
      page.querySelector('[data-time-now]').addEventListener('click', function () {
        var value = localDateTimeValue(new Date()) + ':00';
        if (form.elements.mode.value === 'difference') form.elements.startDateTime.value = value;
        else form.elements.baseDateTime.value = value;
      });
      form.elements.baseDateTime.value = localDateTimeValue(new Date()) + ':00';
    }
    if (tool === 'countdown') {
      var tomorrow = new Date(Date.now() + 86400000);
      form.elements.targetDateTime.value = localDateTimeValue(tomorrow) + ':00';
      page.querySelector('[data-countdown-now]').addEventListener('click', function () { form.elements.targetDateTime.value = localDateTimeValue(new Date()) + ':00'; });
    }
    if (tool === 'dimensional-weight') {
      form.elements.divisorPreset.addEventListener('change', updateDimensionalFields);
      page.querySelector('[data-add-package]').addEventListener('click', addPackageRow);
      refreshRows(form.querySelector('[data-package-items]'), '包裹', 1);
    }
    if (tool === 'renovation-estimator') {
      form.elements.mode.addEventListener('change', updateRenovationFields);
      form.elements.areaMode.addEventListener('change', updateRenovationFields);
    }
  }

  function initializeTool() {
    initializeExistingTool();
    initializeExpandedTool();
    applyToolState();
  }

  var toolHandlers = {
    'base64': handleBase64,
    'text-stats': renderTextStats,
    'url-codec': handleUrl,
    'json-formatter': handleJson,
    'case-converter': handleCaseConverter,
    'list-cleaner': handleListCleaner,
    'timestamp': handleTimestamp,
    'hash': handleHash,
    'color-converter': handleColor,
    'date-difference': handleDateDifference,
    'mortgage': handleMortgage,
    'compound-interest': handleCompound,
    'cagr': handleCagr,
    'recurring-investment': handleRecurring,
    'exchange-rate': handleExchangeRate,
    'discount': handleDiscount,
    'bill-split': handleBillSplit,
    'unit-price': handleUnitPrice,
    'percentage': handlePercentage,
    'savings-goal': handleSavingsGoal,
    'rmb-uppercase': handleRmbUppercase,
    'tax-converter': handleTaxConverter,
    'travel-budget': handleTravelBudget,
    'unit-converter': handleUnitConverter,
    'age-calculator': handleAgeCalculation,
    'timezone-converter': handleTimezone,
    'fuel-cost': handleFuelCost,
    'electricity-cost': handleElectricityCost,
    'recipe-scaler': handleRecipe,
    'bmi': handleBmi,
    'workday': handleWorkday,
    'time-calculator': handleTimeCalculator,
    'countdown': handleCountdown,
    'dimensional-weight': handleDimensionalWeight,
    'renovation-estimator': handleRenovationEstimator,
    'image-compressor': handleImageCompressor,
    'qr-generator': handleQrGenerator,
    'random-picker': handleRandomPicker,
    'dice-roller': handleDiceRoller,
    'meal-picker': handleMealPicker
  };

  async function run(action) {
    var handler = toolHandlers[tool];
    if (!handler) throw new Error('这个工具尚未配置处理逻辑。');
    return handler(action);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    Promise.resolve().then(function () { return run(event.submitter ? event.submitter.value : 'calculate'); }).catch(showError);
  });
  form.addEventListener('invalid', function (event) {
    event.target.setAttribute('aria-invalid', 'true');
    setFormStatus('请检查标注的必填项或数值范围。', 'error');
  }, true);
  form.addEventListener('input', updateInputStatus);
  form.addEventListener('change', updateInputStatus);
  form.addEventListener('click', handleMealDynamicClick);
  form.addEventListener('reset', function () {
    window.setTimeout(function () {
      if (countdownTimer) { window.clearInterval(countdownTimer); countdownTimer = null; }
      if (result._downloadUrl) URL.revokeObjectURL(result._downloadUrl);
      result._downloadUrl = '';
      result.classList.remove('is-error');
      result.innerHTML = '<p class="tool-placeholder">填写左侧内容，结果会在这里出现。</p>';
      copyButton.hidden = true;
      Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid="true"]'), function (input) { input.removeAttribute('aria-invalid'); });
      setFormStatus('', '');
      resetDynamicRows();
      if (tool === 'age-calculator') form.elements.asOfDate.value = localDateValue(new Date());
      if (tool === 'timezone-converter') populateTimeZones();
      if (tool === 'workday') { form.elements.startDate.value = localDateValue(new Date()); form.elements.endDate.value = localDateValue(new Date()); }
      applyToolState();
      if (tool === 'text-stats') renderTextStats();
      if (tool === 'meal-picker' && mealApp) mealApp.resetHistory();
    }, 0);
  });
  copyButton.addEventListener('click', function () {
    navigator.clipboard.writeText(result._copyValue || result.innerText).then(function () {
      var original = copyButton.innerHTML;
      copyButton.innerHTML = '<span class="material-symbols-rounded">check</span>已复制';
      window.setTimeout(function () { copyButton.innerHTML = original; }, 1400);
    }).catch(function () { showError(new Error('复制失败，请手动选择结果。')); });
  });
  if (swapButton) {
    swapButton.addEventListener('click', function () {
      if (!result._copyValue) {
        showError(new Error('请先完成一次编码或解码。'));
        return;
      }
      var previousSource = form.elements.source.value;
      form.elements.source.value = result._copyValue;
      setResult(resultText(previousSource), previousSource);
      form.elements.source.focus();
    });
  }

  if (tool === 'text-stats') {
    form.elements.source.addEventListener('input', renderTextStats);
    renderTextStats();
  }
  if (tool === 'mortgage') form.elements.loanType.addEventListener('change', updateLoanFields);
  initializeTool();
}());
