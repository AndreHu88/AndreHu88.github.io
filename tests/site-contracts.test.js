const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function flatYamlRecords(relativePath, recordKey) {
  const source = readProjectFile(relativePath);
  const records = [];
  let current = null;
  source.split(/\r?\n/).forEach((line) => {
    const recordMatch = line.match(new RegExp(`^- ${recordKey}:\\s*(.+)$`));
    if (recordMatch) {
      current = { [recordKey]: recordMatch[1].trim() };
      records.push(current);
      return;
    }
    const fieldMatch = current && line.match(/^  ([a-z_]+):\s*(.*)$/);
    if (fieldMatch) current[fieldMatch[1]] = fieldMatch[2].trim();
  });
  return records;
}

function mortgageControl(value) {
  const listeners = {};
  return {
    value: value || '', required: false, textContent: '', hidden: false, attributes: {}, focused: false,
    addEventListener(type, listener) { listeners[type] = listener; },
    removeAttribute(name) { delete this.attributes[name]; },
    setAttribute(name, nextValue) { this.attributes[name] = String(nextValue); },
    getAttribute(name) { return this.attributes[name]; },
    focus() { this.focused = true; },
    dispatch(type, event) {
      listeners[type]({ currentTarget: this, key: event && event.key, preventDefault() {} });
    }
  };
}

function loadMortgagePage() {
  const names = [
    'principalA', 'rateA', 'yearsA', 'principalB', 'rateB', 'yearsB', 'paidMonths',
    'adjustmentPrincipalA', 'adjustmentYearsA', 'oldRateA', 'newRateA',
    'adjustmentPrincipalB', 'adjustmentYearsB', 'oldRateB', 'newRateB'
  ];
  const elements = Object.fromEntries(names.map((name) => [name, mortgageControl()]));
  elements.loanType = mortgageControl('commercial');
  elements.mortgageMode = mortgageControl('new');
  const newTab = mortgageControl();
  newTab.setAttribute('data-mortgage-mode-tab', 'new');
  const adjustmentTab = mortgageControl();
  adjustmentTab.setAttribute('data-mortgage-mode-tab', 'adjustment');
  const panels = {
    '[data-new-loan-fields]': { hidden: false }, '[data-adjustment-fields]': { hidden: true },
    '[data-new-combination-fields]': { hidden: true }, '[data-adjustment-combination-fields]': { hidden: true },
    '[data-mortgage-mode-description]': mortgageControl(), '[data-mortgage-submit]': mortgageControl()
  };
  const formListeners = {};
  const form = {
    elements, addEventListener(type, listener) { formListeners[type] = listener; }, querySelectorAll() { return []; },
    dispatch(type) { formListeners[type]({ preventDefault() {} }); }
  };
  const result = { innerHTML: '', _copyValue: '', _downloadUrl: '', classList: { add() {}, remove() {} } };
  const copyButton = { hidden: true, addEventListener() {}, innerHTML: '' };
  const formStatus = { textContent: '', classList: { toggle() {} } };
  const resultTitle = { textContent: '计算结果' };
  const page = {
    getAttribute() { return 'mortgage'; },
    querySelector(selector) {
      if (selector === '[data-tool-form]') return form;
      if (selector === '[data-tool-result]') return result;
      if (selector === '[data-copy-result]') return copyButton;
      if (selector === '[data-tool-form-status]') return formStatus;
      if (selector === '#tool-result-title') return resultTitle;
      if (selector === '[data-tool-swap]') return null;
      return panels[selector];
    },
    querySelectorAll(selector) {
      if (selector === '[data-mortgage-mode-tab]') return [newTab, adjustmentTab];
      if (selector === '[data-primary-loan-label]') return [{ textContent: '' }, { textContent: '' }];
      return [];
    }
  };
  vm.runInNewContext(readProjectFile('assets/js/tool-app.js'), {
    document: { querySelector() { return page; }, createElement() { return mortgageControl(); } },
    window: { JackToolsCore: {}, setTimeout(callback) { callback(); } }, Intl, URL: { revokeObjectURL() {} }
  });
  return { elements, newTab, adjustmentTab, panels, form, result, copyButton, formStatus, resultTitle };
}

test('site head declares the responsive mobile viewport', () => {
  assert.match(readProjectFile('_includes/head.html'), /<meta name="viewport" content="width=device-width, initial-scale=1">/);
});

test('desktop navigation exposes article destinations without a drawer', () => {
  const header = readProjectFile('_includes/site-header.html');
  [
    ['/#latest', '最新文章'],
    ['/archive/', '时间归档'],
    ['/tags/', '全部标签'],
    ['/tools/', '工具'],
    ['/book/', '知识库'],
    ['/about/', '关于']
  ].forEach(([href, label]) => {
    assert.match(header, new RegExp('href="\\{\\{ site\\.baseurl \\}\\}' + href.replace('/', '\\/') + '">' + label + '<'));
  });
  assert.doesNotMatch(header, /data-nav-trigger|data-nav-popover|article-popover/);
  assert.match(header, /active_section == 'tools'/);
  assert.doesNotMatch(header, /nav-link--library/);
  assert.doesNotMatch(readProjectFile('assets/js/site.js'), /setArticleMenu|data-nav-trigger|data-nav-popover/);
});

test('timestamp current-time action bypasses empty required input validation', () => {
  const forms = readProjectFile('_includes/tool-forms/developer.html');
  assert.match(forms, /value="now"[^>]*formnovalidate/);
});

test('mortgage form exposes accessible mode tabs and repayment explanations', () => {
  const forms = readProjectFile('_includes/tool-forms/finance.html');
  const app = readProjectFile('assets/js/tool-app.js');
  const styles = readProjectFile('style.scss');
  const mortgageForm = forms.slice(forms.indexOf("{% when 'mortgage' %}"), forms.indexOf("{% when 'compound-interest' %}"));

  assert.match(mortgageForm, /role="tablist"/);
  assert.match(mortgageForm, /name="mortgageMode" type="hidden" value="new"/);
  assert.match(mortgageForm, /data-mortgage-mode-tab="new"[^>]*aria-selected="true"/);
  assert.match(mortgageForm, /data-mortgage-mode-tab="adjustment"[^>]*aria-selected="false"/);
  assert.match(mortgageForm, /data-new-loan-fields[^>]*role="tabpanel"/);
  assert.match(mortgageForm, /data-adjustment-fields[^>]*role="tabpanel"[^>]*hidden/);
  assert.doesNotMatch(mortgageForm, /<select[^>]*name="mortgageMode"/);
  assert.match(mortgageForm, /每月还款额基本固定，前期利息占比较高，月供压力更平稳。/);
  assert.match(mortgageForm, /每月偿还相同本金，月供逐月减少；前期月供更高，总利息通常更少。/);
  assert.match(mortgageForm, /贷款金额、利率和期限相同/);
  assert.match(mortgageForm, /name="paidMonths"/);
  assert.match(mortgageForm, /name="remainingPrincipalA"/);
  assert.match(mortgageForm, /name="remainingPrincipalB"/);
  assert.match(app, /className: 'is-change ' \+ change\.className/);
  assert.match(styles, /\.tool-summary-grid > div\.is-saving/);
  assert.match(styles, /\.tool-summary-grid > div\.is-increase/);
});

test('mortgage tab click switches modes and clears only stale results', () => {
  const { elements, newTab, adjustmentTab, panels, result, copyButton, formStatus, resultTitle } = loadMortgagePage();
  assert.equal(newTab.getAttribute('aria-selected'), 'true');
  assert.equal(adjustmentTab.getAttribute('aria-selected'), 'false');
  assert.equal(elements.principalA.required, true);
  assert.equal(elements.adjustmentPrincipalA.required, false);
  result.innerHTML = '<p>旧计算结果</p>';
  result._copyValue = '旧计算结果';
  copyButton.hidden = false;
  formStatus.textContent = '输入已就绪';
  adjustmentTab.dispatch('click');
  assert.equal(elements.mortgageMode.value, 'adjustment');
  assert.equal(panels['[data-new-loan-fields]'].hidden, true);
  assert.equal(panels['[data-adjustment-fields]'].hidden, false);
  assert.equal(elements.principalA.required, false);
  assert.equal(elements.adjustmentPrincipalA.required, true);
  assert.match(result.innerHTML, /填写原贷款及新旧利率/);
  assert.equal(result._copyValue, '');
  assert.equal(copyButton.hidden, true);
  assert.equal(formStatus.textContent, '');
  assert.equal(panels['[data-mortgage-submit]'].textContent, '比较调息变化');
  assert.equal(resultTitle.textContent, '调息变化结果');

  result.innerHTML = '<p>保留当前结果</p>';
  adjustmentTab.dispatch('click');
  assert.equal(result.innerHTML, '<p>保留当前结果</p>');
});

test('mortgage tabs support arrow, Home, and End keyboard navigation', () => {
  const { elements, newTab, adjustmentTab, resultTitle } = loadMortgagePage();
  adjustmentTab.dispatch('click');
  adjustmentTab.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(elements.mortgageMode.value, 'new');
  assert.equal(newTab.focused, true);
  assert.equal(resultTitle.textContent, '新贷款测算结果');
  newTab.dispatch('keydown', { key: 'End' });
  assert.equal(elements.mortgageMode.value, 'adjustment');
  adjustmentTab.dispatch('keydown', { key: 'Home' });
  assert.equal(elements.mortgageMode.value, 'new');
  newTab.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(elements.mortgageMode.value, 'adjustment');
});

test('mortgage form reset restores the new-loan tab and result prompt', () => {
  const { elements, newTab, adjustmentTab, panels, form, result, copyButton } = loadMortgagePage();
  adjustmentTab.dispatch('click');
  elements.mortgageMode.value = 'new';
  result.innerHTML = '<p>重置前结果</p>';
  copyButton.hidden = false;
  form.dispatch('reset');
  assert.equal(newTab.getAttribute('aria-selected'), 'true');
  assert.equal(adjustmentTab.getAttribute('aria-selected'), 'false');
  assert.match(result.innerHTML, /填写贷款信息/);
  assert.equal(copyButton.hidden, true);
  assert.equal(panels['[data-mortgage-submit]'].textContent, '计算月供');
});

test('mortgage combination fields follow the active tab requirements', () => {
  const { elements, adjustmentTab, panels } = loadMortgagePage();
  elements.loanType.value = 'combination';
  elements.loanType.dispatch('change');
  assert.equal(panels['[data-new-combination-fields]'].hidden, false);
  assert.equal(elements.principalB.required, true);
  adjustmentTab.dispatch('click');
  assert.equal(panels['[data-adjustment-combination-fields]'].hidden, false);
  assert.equal(elements.principalB.required, false);
  assert.equal(elements.adjustmentPrincipalB.required, true);
});

test('article cards support explicit and tag-based local covers', () => {
  const home = readProjectFile('index.html');
  const coverData = readProjectFile('_data/post_covers.yml');
  assert.match(home, /post\.cover/);
  assert.match(home, /site\.data\.post_covers/);
  assert.doesNotMatch(home, /article-card__media-link--plain/);
  ['金融', '读书笔记', '随笔', 'iOS', 'Linux', 'Java', '数据结构', '工具'].forEach((tag) => {
    assert.match(coverData, new RegExp('- ' + tag));
  });
});

test('tool metadata contains exactly 40 unique tools in the refined categories', () => {
  const tools = flatYamlRecords('_data/tools.yml', 'slug');
  const categories = flatYamlRecords('_data/tool_categories.yml', 'id');
  assert.equal(tools.length, 40);
  assert.equal(new Set(tools.map((tool) => tool.slug)).size, 40);
  assert.deepEqual(categories.map((category) => category.id), [
    'finance-loan', 'finance-investment', 'finance-consumer', 'finance-currency', 'date-time',
    'food-health', 'home-travel', 'utility', 'random', 'text', 'developer'
  ]);

  const counts = tools.reduce((result, tool) => {
    result[tool.category] = (result[tool.category] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, {
    text: 6, developer: 3, 'finance-loan': 2, 'finance-investment': 3,
    'finance-consumer': 5, 'finance-currency': 3, 'date-time': 6,
    'food-health': 3, 'home-travel': 4, utility: 3, random: 2
  });
  const categoryNames = Object.fromEntries(categories.map((category) => [category.id, category.name]));
  tools.forEach((tool) => {
    assert.equal(tool.category_name, categoryNames[tool.category], `${tool.slug} category label is out of sync`);
    assert.ok(['text', 'developer', 'finance', 'life', 'fun'].includes(tool.module || tool.category), `${tool.slug} has an unknown script module`);
  });
  assert.deepEqual(
    tools.slice(-8).map((tool) => tool.slug),
    ['meal-picker', 'time-calculator', 'countdown', 'rmb-uppercase', 'tax-converter', 'travel-budget', 'dimensional-weight', 'renovation-estimator']
  );
  tools.forEach((tool) => {
    ['title', 'category', 'category_name', 'icon', 'summary', 'keywords'].forEach((field) => {
      assert.ok(tool[field], `${tool.slug} is missing ${field}`);
    });
  });
  assert.deepEqual(tools.filter((tool) => tool.networked === 'true').map((tool) => tool.slug), ['exchange-rate']);
  assert.deepEqual(tools.filter((tool) => tool.extra_script).map((tool) => tool.slug), ['qr-generator']);
  assert.equal(tools.some((tool) => Object.prototype.hasOwnProperty.call(tool, 'featured')), false);
});

test('every tool metadata record has a matching route page', () => {
  const tools = flatYamlRecords('_data/tools.yml', 'slug');
  const expectedPages = new Set(tools.map((tool) => `${tool.slug}.html`));
  const actualPages = new Set(fs.readdirSync(path.join(projectRoot, 'tools')).filter((file) => file.endsWith('.html') && file !== 'index.html'));
  assert.deepEqual(actualPages, expectedPages);

  tools.forEach((tool) => {
    const page = readProjectFile(`tools/${tool.slug}.html`);
    assert.match(page, new RegExp(`^---\\n[\\s\\S]*?tool: ${tool.slug}\\n[\\s\\S]*?permalink: /tools/${tool.slug}/\\n---`), `${tool.slug} page front matter does not match metadata`);
  });
});

test('category dispatcher and forms cover every tool slug', () => {
  const tools = flatYamlRecords('_data/tools.yml', 'slug');
  const formDispatcher = readProjectFile('_includes/tool-form.html');
  assert.match(formDispatcher, /include\.tool\.module \| default: include\.tool\.category/);
  ['text', 'developer', 'finance', 'life', 'fun'].forEach((category) => {
    assert.match(formDispatcher, new RegExp(`include tool-forms/${category}\\.html`));
    const categoryForm = readProjectFile(`_includes/tool-forms/${category}.html`);
    tools.filter((tool) => (tool.module || tool.category) === category).forEach((tool) => {
      assert.match(categoryForm, new RegExp(`(?:include\\.tool\\.slug ==|when) '${tool.slug}'`), `${tool.slug} has no form branch`);
    });
  });
});

test('tool application uses a complete explicit handler registry', () => {
  const tools = flatYamlRecords('_data/tools.yml', 'slug');
  const app = readProjectFile('assets/js/tool-app.js');
  assert.match(app, /var toolHandlers\s*=\s*\{/);
  tools.forEach((tool) => {
    assert.match(app, new RegExp(`['"]${tool.slug}['"]\\s*:`), `${tool.slug} has no registered handler`);
  });
  assert.doesNotMatch(app, /if \(tool === ['"][^'"]+['"]\)[\s\S]{0,80}else if \(tool ===/);
});

test('tool layout loads category modules, optional local scripts and privacy notices', () => {
  const layout = readProjectFile('_layouts/tool.html');
  assert.match(layout, /tool\.module \| default: tool\.category/);
  assert.match(layout, /tool-\{\{ tool_module \}\}\.js/);
  assert.match(layout, /tool_module == 'finance'/);
  assert.match(layout, /assets\/js\/vendor\/\{\{ tool\.extra_script \}\}\.js/);
  assert.match(layout, /if tool\.networked/);
  assert.match(layout, /输入金额不会发送或保存/);
  assert.match(layout, /tool\.slug == 'bmi'/);
  assert.match(readProjectFile('assets/js/vendor/qrcode-generator.LICENSE'), /MIT License|Licensed under the MIT license/i);
});

test('tools hub provides data-driven categories, search, filtering and local-first copy', () => {
  const hub = readProjectFile('tools/index.html');
  assert.match(hub, /site\.data\.tool_categories/);
  assert.match(hub, /data-tool-search-input/);
  assert.match(hub, /data-tool-filter=/);
  assert.match(hub, /data-tool-filter-status/);
  assert.match(hub, /data-tools-empty/);
  assert.match(hub, /assign tool_count = site\.data\.tools \| size/);
  assert.match(hub, /\{\{ tool_count \}\} 个工具/);
  assert.doesNotMatch(hub, /32 个工具/);
  assert.match(hub, /大多数工具完全在浏览器本地运行/);
  assert.match(hub, /汇率工具仅联网请求币种对应的最新参考汇率/);
  const behavior = readProjectFile('assets/js/tools-hub.js');
  assert.match(behavior, /data-tool-search-input/);
  assert.match(behavior, /data-tool-filter/);
  assert.match(behavior, /data-tools-clear/);
  assert.match(behavior, /scrollIntoView/);
  const styles = readProjectFile('style.scss');
  assert.match(styles, /\.tool-category[^}]*scroll-margin-top/);
  assert.match(styles, /\.tools-hub \[hidden\][^}]*display: none !important/);
});

test('pages without a tool slug do not inherit the first tool metadata record', () => {
  const head = readProjectFile('_includes/head.html');
  const meta = readProjectFile('_includes/meta.html');
  assert.match(head, /if page\.tool[\s\S]*assign head_tool/);
  assert.match(meta, /if page\.tool[\s\S]*assign meta_tool/);
});
