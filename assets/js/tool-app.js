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

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  function setResult(html, copyValue) {
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

  async function run(action) {
    if (tool === 'base64') handleBase64(action);
    else if (tool === 'url-codec') handleUrl(action);
    else if (tool === 'json-formatter') handleJson(action);
    else if (tool === 'timestamp') handleTimestamp(action);
    else if (tool === 'hash') await handleHash();
    else if (tool === 'color-converter') handleColor();
    else if (tool === 'date-difference') handleDateDifference();
    else if (tool === 'mortgage') handleMortgage();
    else if (tool === 'compound-interest') handleCompound();
    else if (tool === 'cagr') handleCagr();
    else if (tool === 'recurring-investment') handleRecurring();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    Promise.resolve(run(event.submitter ? event.submitter.value : 'calculate')).catch(showError);
  });
  form.addEventListener('invalid', function (event) {
    event.target.setAttribute('aria-invalid', 'true');
    setFormStatus('请检查标注的必填项或数值范围。', 'error');
  }, true);
  form.addEventListener('input', updateInputStatus);
  form.addEventListener('change', updateInputStatus);
  form.addEventListener('reset', function () {
    window.setTimeout(function () {
      result.classList.remove('is-error');
      result.innerHTML = '<p class="tool-placeholder">填写左侧内容，结果会在这里出现。</p>';
      copyButton.hidden = true;
      Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid="true"]'), function (input) { input.removeAttribute('aria-invalid'); });
      setFormStatus('', '');
      updateLoanFields();
      if (tool === 'text-stats') renderTextStats();
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
  if (tool === 'mortgage') {
    form.elements.loanType.addEventListener('change', updateLoanFields);
    updateLoanFields();
  }
}());
